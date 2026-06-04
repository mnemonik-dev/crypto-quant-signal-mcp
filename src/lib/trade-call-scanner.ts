// ── Cross-asset trade-call scanner (SCAN-TRADE-CALLS-W1 C2) ──
//
// Compute engine behind the public `scan_trade_calls` MCP/HTTP tool. Returns
// ranked composite-verdict trade calls across the top 1–100 perps by notional
// open interest on a chosen PROMOTED venue (HL/BINANCE/BYBIT/OKX/BITGET).
//
// Mirrors the proven `cross-asset-grid.ts` fan-out shape — TTL snapshot,
// promise-coalesced refresh, `pLimit` bounded concurrency, per-cell isolation
// — but parameterised by (exchange, timeframe, topN) instead of a fixed grid.
//
// Design notes:
//   • Universe via `getExchangeTopAssetsWithVolume` (the 5 PROMOTED venues
//     only — it throws on shadow venues; callers filter via the tool enum).
//     NOT oi-ranking.ts (HL-only, different purpose).
//   • Each cell scores via `getTradeSignal({ internal: true })` so scan cells
//     NEVER touch the per-coin quota counter or the performance-db track record
//     (preserves the on-chain ↔ dashboard equality canary). The tool HANDLER
//     charges the batch via the C1 multi-unit quota seam (the `units` param) —
//     quota is the handler's job, never this module's.
//   • Coalescing is PER-COIN: concurrent scans for the same (exchange,timeframe)
//     share one in-flight score per coin, so 2 identical concurrent scans score
//     each coin once, not twice. Smaller topN is served by snapshot slice;
//     larger topN tops up only the missing coins.
//   • Allow-list result shaping (CLAUDE.md public-API LAW): `toScanCallItem`
//     is the EXPORTED pure formatter; `ScanCallItem` carries ONLY
//     {coin, timeframe, exchange, call, confidence, regime} — no price, no
//     indicators, no reasoning, and never any `outcome_*` field.
//   • No track-record persistence, no quota increment, no Telegram here — the
//     module is read-only over the scoring path; side effects are the handler's.
//
// Frozen exports for C3/C4: scanTradeCalls, getTopCoinSet, ScanTradeCallsResult,
// ScanCallItem, _setScanScorerForTest, _clearScanCaches.

import pLimit from 'p-limit';
import { getTradeSignal } from '../tools/get-trade-call.js';
import { getExchangeTopAssetsWithVolume } from './exchange-universe.js';
import { ResultCache } from './result-cache.js';
import type { SignalVerdict, RegimeType } from '../types.js';

/** The 5 PROMOTED venues — the only exchanges `getExchangeTopAssetsWithVolume` supports. */
export type ScanExchangeId = 'HL' | 'BINANCE' | 'BYBIT' | 'OKX' | 'BITGET';
export const SCAN_EXCHANGES: readonly ScanExchangeId[] = ['BINANCE', 'HL', 'BYBIT', 'OKX', 'BITGET'] as const;

/** Public per-coin scan row — allow-listed projection of a trade call. */
export interface ScanCallItem {
  coin: string;
  timeframe: string;
  exchange: ScanExchangeId;
  call: SignalVerdict;
  confidence: number;
  regime: RegimeType;
}

export interface ScanTradeCallsResult {
  /** Universe size attempted (top-N coins by OI on the venue). */
  scanned: number;
  /** Non-HOLD calls in the RETURNED `calls[]` — the handler's quota-unit driver. */
  eligible_non_hold: number;
  /** HOLD cells computed (informational; HOLDs are free + excluded unless includeHolds). */
  holds: number;
  /** Cells that failed to score (isolated + skipped). */
  errors: number;
  /** True when the deadline elapsed before every cell completed. */
  partial: boolean;
  calls: ScanCallItem[];
}

export interface ScanTradeCallsParams {
  topN?: number;
  timeframe?: string;
  exchange?: ScanExchangeId;
  minConfidence?: number;
  includeHolds?: boolean;
  limit?: number;
}

/** The allow-listed subset a scorer must yield. Decouples the scanner from the full TradeCallResult. */
export interface ScanScore {
  coin: string;
  timeframe: string;
  call: SignalVerdict;
  confidence: number;
  regime: RegimeType;
}

type ScanScorer = (coin: string, timeframe: string, exchange: ScanExchangeId) => Promise<ScanScore>;

/**
 * EXPORTED pure formatter (allow-list LAW). Projects a score onto the public
 * `ScanCallItem` shape — explicit field copy, never a spread, so a wider score
 * object can never leak `price` / `indicators` / `reasoning` / `outcome_*`.
 */
export function toScanCallItem(score: ScanScore, exchange: ScanExchangeId): ScanCallItem {
  return {
    coin: score.coin,
    timeframe: score.timeframe,
    exchange,
    call: score.call,
    confidence: score.confidence,
    regime: score.regime,
  };
}

/** Real scorer — the internal trade-call compute path (skips quota + track record). */
async function defaultScorer(coin: string, timeframe: string, exchange: ScanExchangeId): Promise<ScanScore> {
  const r = await getTradeSignal({ coin, timeframe, exchange, includeReasoning: false, internal: true });
  return { coin: r.coin, timeframe: r.timeframe, call: r.call, confidence: r.confidence, regime: r.regime };
}

// ── Env config (default-deny parse per CLAUDE.md — non-finite / <1 → default) ──
function envPositiveInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : def;
}

// ── Module-private state ──
interface CachedCell {
  item: ScanCallItem;
  at: number;
}
/** `${exchange}:${timeframe}` → (coin → cell). Stores cells for the largest topN computed. */
const snapshots = new Map<string, Map<string, CachedCell>>();
/** `${exchange}:${timeframe}:${coin}` → in-flight score, for per-coin coalescing. */
const inflightCells = new Map<string, Promise<ScanCallItem>>();
/** Last-known-good universe per `${exchange}:${n}` — served when a fresh fetch throws. */
const lastKnownGoodUniverse = new Map<string, string[]>();
let universeCache: ResultCache<string[]> | null = null;
let _scorerOverride: ScanScorer | null = null;

function getUniverseCache(): ResultCache<string[]> {
  if (!universeCache) {
    universeCache = new ResultCache<string[]>({
      ttlMs: envPositiveInt('SCAN_UNIVERSE_TTL_SEC', 600) * 1000,
      max: 256,
    });
  }
  return universeCache;
}

/**
 * Resolve the top-`n` coin set on a promoted venue, OI-desc-sorted. Fresh
 * results are cached in a `ResultCache` keyed `${exchange}:${n}`. Stale-on-
 * error: if a fetch throws but we have a last-known-good set, serve it; with no
 * prior good set, the error propagates.
 */
export async function getTopCoinSet(exchange: ScanExchangeId, n: number): Promise<string[]> {
  const cache = getUniverseCache();
  const key = `${exchange}:${n}`;
  const fresh = cache.get(key);
  if (fresh) return fresh;
  try {
    const assets = await getExchangeTopAssetsWithVolume(exchange, n);
    const coins = assets.map((a) => a.coin);
    cache.set(key, coins);
    lastKnownGoodUniverse.set(key, coins);
    return coins;
  } catch (err) {
    const stale = lastKnownGoodUniverse.get(key);
    if (stale) {
      console.debug(
        `[trade-call-scanner] universe fetch failed for ${key}; serving stale (${stale.length} coins):`,
        err instanceof Error ? err.message : err,
      );
      return stale;
    }
    throw err;
  }
}

/**
 * Return a coin's cell from the (exchange,timeframe) snapshot when fresh,
 * otherwise compute it. Per-coin promise coalescing ensures concurrent callers
 * share a single in-flight score. Throws on scorer failure (caller isolates).
 */
async function getOrComputeCell(
  exchange: ScanExchangeId,
  timeframe: string,
  coin: string,
  scorer: ScanScorer,
  snapshotTtlMs: number,
): Promise<ScanCallItem> {
  const skey = `${exchange}:${timeframe}`;
  let snap = snapshots.get(skey);
  if (!snap) {
    snap = new Map<string, CachedCell>();
    snapshots.set(skey, snap);
  }
  const cached = snap.get(coin);
  if (cached && Date.now() - cached.at <= snapshotTtlMs) return cached.item;

  const ckey = `${skey}:${coin}`;
  const inflight = inflightCells.get(ckey);
  if (inflight) return inflight;

  const p = (async () => {
    const score = await scorer(coin, timeframe, exchange);
    const item = toScanCallItem(score, exchange);
    snap!.set(coin, { item, at: Date.now() });
    return item;
  })();
  inflightCells.set(ckey, p);
  try {
    return await p;
  } finally {
    if (inflightCells.get(ckey) === p) inflightCells.delete(ckey);
  }
}

/** Resolve `work`, or report `true` if `ms` elapses first (work keeps running). */
async function raceDeadline(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), ms);
  });
  const done = work.then(() => false);
  const timedOut = await Promise.race([done, timeout]);
  if (timer) clearTimeout(timer);
  return timedOut;
}

function clampInt(n: number, lo: number, hi: number, def: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : def;
}

/**
 * Scan the top-`topN` perps on `exchange` at `timeframe`, returning ranked
 * non-HOLD trade calls (then HOLDs when `includeHolds`), clamped to `limit`.
 * `minConfidence` filters non-HOLD only. Never charges quota or records signals.
 */
export async function scanTradeCalls(params: ScanTradeCallsParams): Promise<ScanTradeCallsResult> {
  const topN = clampInt(params.topN ?? 20, 1, 100, 20);
  const timeframe = params.timeframe ?? '15m';
  const exchange = params.exchange ?? 'BINANCE';
  const minConfidence = params.minConfidence;
  const includeHolds = params.includeHolds ?? false;
  const limit = clampInt(params.limit ?? 10, 1, 100, 10);

  const concurrency = envPositiveInt('SCAN_CONCURRENCY', 6);
  const snapshotTtlMs = envPositiveInt('SCAN_SNAPSHOT_TTL_SEC', 60) * 1000;
  const deadlineMs = envPositiveInt('SCAN_DEADLINE_MS', 30000);
  const scorer = _scorerOverride ?? defaultScorer;

  const coins = await getTopCoinSet(exchange, topN);
  const scanned = coins.length;

  const limiter = pLimit(concurrency);
  const cells: (ScanCallItem | null)[] = new Array(coins.length).fill(null);
  let errors = 0;
  const tasks = coins.map((coin, i) =>
    limiter(async () => {
      try {
        cells[i] = await getOrComputeCell(exchange, timeframe, coin, scorer, snapshotTtlMs);
      } catch (err) {
        // Cell isolation: skip + tally, debug log only — NO Telegram (no-TG-on-completion LAW).
        errors++;
        console.debug(
          `[trade-call-scanner] cell skipped ${exchange}/${coin}/${timeframe}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
  const partial = await raceDeadline(Promise.allSettled(tasks), deadlineMs);

  const computed = cells.filter((c): c is ScanCallItem => c !== null);
  const holds = computed.filter((c) => c.call === 'HOLD').length;

  let eligible = computed.filter((c) => c.call !== 'HOLD');
  if (minConfidence != null) eligible = eligible.filter((c) => c.confidence >= minConfidence);
  eligible = [...eligible].sort((a, b) => b.confidence - a.confidence);

  let ordered: ScanCallItem[] = eligible;
  if (includeHolds) {
    const sortedHolds = computed.filter((c) => c.call === 'HOLD').sort((a, b) => b.confidence - a.confidence);
    ordered = [...eligible, ...sortedHolds];
  }
  const calls = ordered.slice(0, limit);
  const eligible_non_hold = calls.filter((c) => c.call !== 'HOLD').length;

  return { scanned, eligible_non_hold, holds, errors, partial, calls };
}

// ── Test seams (underscore-prefixed; non-public) ──

/** Inject a deterministic scorer in place of the live `getTradeSignal` path. */
export function _setScanScorerForTest(fn: ScanScorer | null): void {
  _scorerOverride = fn;
}

/** Reset all scanner caches (snapshots, in-flight, universe fresh + last-known-good). */
export function _clearScanCaches(): void {
  snapshots.clear();
  inflightCells.clear();
  lastKnownGoodUniverse.clear();
  universeCache?.clear();
}

/** Expire only the fresh universe cache, preserving last-known-good (stale-on-error tests). */
export function _expireUniverseFresh(): void {
  universeCache?.clear();
}
