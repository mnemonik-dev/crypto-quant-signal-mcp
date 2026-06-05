/**
 * Hyperliquid adapter — implements ExchangeAdapter for the HL public API.
 * Base URL: https://api.hyperliquid.xyz/info
 * All requests are POST, no auth needed for read endpoints.
 */
import type {
  ExchangeAdapter,
  Candle,
  AssetContext,
  FundingData,
  HLCandle,
  HLMetaAndAssetCtxs,
  HLPredictedFunding,
  DexType,
} from '../../types.js';
import { UpstreamRateLimitError } from '../errors.js';
import { hlWeightBudget, currentWeightClass, type WeightClass } from '../upstream-weight-budget.js';

const BASE_URL = 'https://api.hyperliquid.xyz/info';
const TIMEOUT_MS = 3000;
const MAX_RETRIES = 1;

// ── OPS-HL-RATELIMITER-W2: HL `/info` request → rate-limit weight ──
// Source (re-verified 2026-06-04): HL docs "rate-limits-and-user-limits":
//   • "All other documented info requests have weight 20."
//   • candleSnapshot: additional +1 weight per 60 items returned.
//   • fundingHistory class: additional +1 weight per 20 items returned.
//   • weight 2: l2Book, allMids, clearinghouseState, orderStatus,
//     spotClearinghouseState, exchangeStatus.
// `weightHint` is the expected item count (passed by getCandles /
// getFundingHistory). Unknown types default to 20 — never under-count.
const WEIGHT_2_TYPES = new Set([
  'l2Book',
  'allMids',
  'clearinghouseState',
  'orderStatus',
  'spotClearinghouseState',
  'exchangeStatus',
]);
// Conservative fallback when a caller omits weightHint. Real candle/funding
// callers always pass one; this only guards a future caller that forgets.
const DEFAULT_ITEM_HINT = 500;

export function weightFor(body: Record<string, unknown>, weightHint?: number): number {
  const type = typeof body?.type === 'string' ? (body.type as string) : '';
  if (WEIGHT_2_TYPES.has(type)) return 2;
  if (type === 'candleSnapshot') {
    return 20 + Math.ceil((weightHint ?? DEFAULT_ITEM_HINT) / 60);
  }
  if (type === 'fundingHistory') {
    return 20 + Math.ceil((weightHint ?? DEFAULT_ITEM_HINT) / 20);
  }
  return 20; // metaAndAssetCtxs, predictedFundings, and unknown → never under-count
}

// HL candle intervals → ms, for deriving the candleSnapshot weightHint from the
// requested [startTime, now] window (HL returns ~one item per interval bucket).
const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
};

export function expectedCandleItems(
  interval: string,
  startTime: number,
  endTime?: number,
): number | undefined {
  const ms = INTERVAL_MS[interval];
  if (!ms) return undefined; // unknown interval → weightFor falls back to its conservative default
  // OPS-HL-SEED-LOAD-W1: bound by endTime when given (outcome backfill window),
  // else assume to-now. Matches HL's "+1 weight per 60 items RETURNED".
  const upper = endTime ?? Date.now();
  return Math.max(1, Math.ceil((upper - startTime) / ms));
}

/**
 * Budgeted entry point for EVERY HL `/info` POST — the single chokepoint
 * (OPS-HL-RATELIMITER-W2). Reserves the request's weight against the shared
 * cross-process HL weight ledger BEFORE hitting the network, then delegates to
 * the raw fetch. `cls` defaults to the AsyncLocalStorage weight class
 * (`interactive` unless inside `runAsBatch`). Exported so the non-adapter HL
 * callers (seed universe discovery, oi-ranking, exchange-universe, monitor)
 * route through the SAME budget — making "every HL caller is throttled" structural.
 *   - interactive: throws `UpstreamRateLimitError` if over ceiling (→ structured 429).
 *   - batch: waits for the window to roll, else throws `WeightBudgetSkipError`
 *     (caller logs a skip and the next idempotent fire retries).
 */
export async function hlInfoPost<T>(
  body: Record<string, unknown>,
  opts?: { cls?: WeightClass; weightHint?: number },
): Promise<T> {
  const cls = opts?.cls ?? currentWeightClass();
  await hlWeightBudget.acquire(weightFor(body, opts?.weightHint), cls);
  return hlPost<T>(body);
}

// OPS-HL-RATELIMIT-W1 (2026-05-22): per-coin getAssetContext used to issue
// N redundant `metaAndAssetCtxs` fetches per seed fire — each returning the
// same ~230-perp universe payload. At ~weight 20 per call, a 20-coin top-20
// 3m fire burned ~400 weight on identical responses; the 15m HL top-100 fire
// (~230 coins with TradFi) burned ~4600 weight on identical responses. Burst
// stacking across overlapping 1m/3m/5m/15m HL crons pushed peak load to
// ~10x the documented 1200 weight/min/IP budget, triggering intermittent 429
// storms (worst observed fire: 0 seeded, 20 errors at 2026-05-22T06:24 UTC).
// This in-process coalescing cache (60s TTL, dex-keyed) collapses N concurrent
// or near-sequential `metaAndAssetCtxs` callers within ONE node process to a
// single backend fetch. Cross-process coalescing (separate cron-fire node
// processes) is out of scope and deferred to OPS-HL-RATELIMITER-W2.
const META_TTL_MS = 60_000;
type MetaCacheEntry = { value: unknown; ts: number };
const metaCache = new Map<string, MetaCacheEntry>();
const metaInflight = new Map<string, Promise<unknown>>();

function metaCacheKey(dex: DexType): string {
  return dex === 'xyz' ? 'xyz' : 'standard';
}

async function getMetaAndAssetCtxsCoalesced<T>(dex: DexType): Promise<T> {
  const key = metaCacheKey(dex);
  const cached = metaCache.get(key);
  if (cached && Date.now() - cached.ts < META_TTL_MS) {
    return cached.value as T;
  }
  const existing = metaInflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const body: Record<string, unknown> = { type: 'metaAndAssetCtxs' };
  if (dex === 'xyz') body.dex = 'xyz';
  const promise = hlInfoPost<T>(body)
    .then((value) => {
      metaCache.set(key, { value, ts: Date.now() });
      metaInflight.delete(key);
      return value;
    })
    .catch((err) => {
      metaInflight.delete(key);
      throw err;
    });
  metaInflight.set(key, promise as Promise<unknown>);
  return promise;
}

/**
 * Test-only reset of the adapter's metaAndAssetCtxs coalescing cache.
 * Production code MUST NOT call this — used by unit tests to isolate cases.
 */
export function _resetHyperliquidMetaCache(): void {
  metaCache.clear();
  metaInflight.clear();
}

async function hlPost<T>(body: Record<string, unknown>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      // v1.10.2: throw a typed UpstreamRateLimitError on 429 so the MCP tool
      // handler can emit a structured response with exchange + retry_after.
      // Other non-2xx still throw a generic Error (no client-side fallback
      // suggestion is meaningful for those).
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const seconds = retryAfter ? parseInt(retryAfter, 10) : null;
        throw new UpstreamRateLimitError('Hyperliquid', Number.isFinite(seconds) ? seconds : null);
      }
      if (!res.ok) {
        throw new Error(`HL API ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      // Don't retry rate-limit errors at the adapter layer — let the MCP
      // handler surface them immediately so the agent can fall back to
      // another exchange instead of waiting through MAX_RETRIES × 500ms
      // of guaranteed-to-fail retries.
      if (err instanceof UpstreamRateLimitError) throw err;
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('HL API: max retries exceeded');
}

export class HyperliquidAdapter implements ExchangeAdapter {
  getName(): string {
    return 'Hyperliquid';
  }

  async getCandles(coin: string, interval: string, startTime: number, dex: DexType = 'standard', endTime?: number): Promise<Candle[]> {
    // xyz perps require the xyz: prefix for candle fetches
    const apiCoin = dex === 'xyz' ? `xyz:${coin}` : coin;
    // OPS-HL-SEED-LOAD-W1: bound the fetch with endTime when given. Outcome
    // backfill needs only [signalTime, signalTime+(evalCount+buffer)·candleMs];
    // without endTime HL returns [startTime, now] (~5000 candles → weight ~104).
    // HL candleSnapshot honors req.endTime (live-verified: 11 candles bounded vs 101 to-now).
    const req: Record<string, unknown> = { coin: apiCoin, interval, startTime };
    if (endTime !== undefined) req.endTime = endTime;
    const raw = await hlInfoPost<HLCandle[]>(
      { type: 'candleSnapshot', req },
      { weightHint: expectedCandleItems(interval, startTime, endTime) },
    );
    return (raw || []).map(c => ({
      open: parseFloat(c.o),
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close: parseFloat(c.c),
      volume: parseFloat(c.v),
      time: c.t,
    }));
  }

  async getAssetContext(coin: string, dex: DexType = 'standard'): Promise<AssetContext> {
    // OPS-HL-RATELIMIT-W1: route through the in-process coalescing cache so
    // N per-coin callers within a seed fire share one backend fetch (60s TTL).
    const raw = await getMetaAndAssetCtxsCoalesced<
      [HLMetaAndAssetCtxs['meta'], HLMetaAndAssetCtxs['assetCtxs']]
    >(dex);
    const meta = raw[0];
    const ctxs = raw[1];
    // xyz universe names include 'xyz:' prefix (e.g. 'xyz:GOLD'), so match both formats
    const lookupName = dex === 'xyz' ? `xyz:${coin}` : coin;
    const idx = meta.universe.findIndex(a => a.name === lookupName);
    if (idx === -1) {
      throw new Error(`${coin} not found on Hyperliquid${dex === 'xyz' ? ' (xyz dex)' : ''}`);
    }
    const ctx = ctxs[idx];
    // R2: HL funding is per-1h period → annualized = raw × 8760 (1h periods/year)
    const fundingRaw = parseFloat(ctx.funding || '0');
    return {
      coin,
      funding: fundingRaw,
      fundingAnnualized: fundingRaw * 8760,
      openInterest: parseFloat(ctx.openInterest || '0'),
      prevDayPx: parseFloat(ctx.prevDayPx || '0'),
      volume24h: parseFloat(ctx.dayNtlVlm || '0'),
      oraclePx: parseFloat(ctx.oraclePx || '0'),
      markPx: parseFloat(ctx.markPx || '0'),
    };
  }

  async getPredictedFundings(): Promise<FundingData[]> {
    const raw = await hlInfoPost<HLPredictedFunding[]>({ type: 'predictedFundings' });
    return raw.map(entry => ({
      coin: entry[0],
      venues: (entry[1] || [])
        .filter(([, data]) => data != null && data.fundingRate != null)
        .filter(([, data]) => {
          const rate = parseFloat(data.fundingRate);
          return !isNaN(rate); // Item 5: reject NaN instead of silently converting to 0
        })
        .map(([venue, data]) => ({
          venue,
          fundingRate: parseFloat(data.fundingRate),
          nextFundingTime: data.nextFundingTime ?? 0,
        })),
    }));
  }

  /**
   * Fetch historical HL funding rates for conviction scoring.
   * Returns hourly funding records for the given coin.
   * HL endpoint: { type: 'fundingHistory', coin, startTime }
   */
  async getFundingHistory(coin: string, startTime: number): Promise<{ time: number; fundingRate: number }[]> {
    try {
      const raw = await hlInfoPost<{ time: number; coin: string; fundingRate: string; premium: string }[]>(
        { type: 'fundingHistory', coin, startTime },
        { weightHint: Math.max(1, Math.ceil((Date.now() - startTime) / 3_600_000)) },
      );
      return (raw || [])
        .filter(r => r.fundingRate != null && !isNaN(parseFloat(r.fundingRate)))
        .map(r => ({
          time: r.time,
          fundingRate: parseFloat(r.fundingRate),
        }));
    } catch {
      return []; // Best-effort: return empty on failure
    }
  }

  async getCurrentPrice(coin: string, dex: DexType = 'standard'): Promise<number | null> {
    try {
      const ctx = await this.getAssetContext(coin, dex);
      return ctx.oraclePx || ctx.markPx;
    } catch {
      return null;
    }
  }
}
