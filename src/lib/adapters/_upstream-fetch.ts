/**
 * _upstream-fetch.ts — OPS-ADAPTER-RATELIMIT-UNIFY-W1 (C1, the generator)
 *
 * ONE transport for every venue REST call. Replaces the 17 near-identical
 * `<venue>Get` fetch/retry loops with a single helper that:
 *   (a) consults the venue-budget-registry and `acquire()`s the request's weight
 *       BEFORE the fetch when the venue is budgeted (HL/Binance now; BYBIT/OKX/
 *       BITGET in C3) — interactive throws `UpstreamRateLimitError` over ceiling,
 *       batch waits→SKIP;
 *   (b) maps rate-limit/ban responses (HTTP `banStatuses` — default [418,429],
 *       BYBIT adds 403; and optional `banBodyCodes` for venues like Bitget that
 *       signal throttles via a response BODY code) to a typed
 *       `UpstreamRateLimitError` thrown IMMEDIATELY, **zero retries** — retrying a
 *       ban extends it, and the prior generic-Error path never tripped the
 *       cross-asset-grid's `UpstreamRateLimitError`-keyed backoff (the Binance
 *       self-DoS bug; BITMART 429→418 confirmed live);
 *   (c) retries ONLY transient failures (network/5xx/timeout) ≤ `transientRetries`
 *       with the existing 500ms sleep;
 *   (d) returns the parsed JSON — per-venue URL building + envelope parsing stay
 *       in the adapter (byte-equivalence spine).
 *
 * The per-venue `VENUE_FETCH_CONFIGS` are exported so non-adapter callers
 * (`exchange-universe.ts`, `underlying-type.ts`) reuse them — no duplicated
 * banStatuses anywhere.
 */
import { UpstreamRateLimitError } from '../errors.js';
import { WeightBudgetSkipError, currentWeightClass, currentCaller, type WeightClass } from '../upstream-weight-budget.js';
import { getVenueBudget } from '../venue-budget-registry.js';
import { recordRateLimitEvent } from '../rate-limit-events.js';

export interface VenueFetchConfig {
  /** Name in the typed UpstreamRateLimitError (the venue's existing rate-limit arg, e.g. 'Hyperliquid'). */
  venueName: string;
  /** Name in the generic `<name> API <status>` / `max retries exceeded` errors. Defaults to venueName.
   *  Only differs for HL (error text says 'HL' while the rate-limit venue is 'Hyperliquid'). */
  apiErrorName?: string;
  /** Registry key for the budget lookup. */
  exchangeId: string;
  /** HTTP statuses treated as a typed rate-limit/ban (thrown immediately, no retry). Default [418, 429]. */
  banStatuses: number[];
  /** Response BODY codes (post-parse) treated as a rate-limit (e.g. Bitget 45001/40725/40808). */
  banBodyCodes?: Array<string | number>;
  /** Header carrying the wait hint. Default 'Retry-After'. */
  retryAfterHeader?: string;
  /** Per-venue abort timeout (ms). */
  timeoutMs: number;
  /** Transient (network/5xx) retry budget. */
  transientRetries: number;
  /** Side-effect hook on each response BEFORE the ban check (e.g. Binance's
   *  X-MBX-USED-WEIGHT forensic warn). Must not throw. */
  onResponse?: (res: Response) => void;
}

export interface UpstreamRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Venue-computed weight (HL/Binance); request-count venues ignore it. */
  weightHint?: number;
  /** Explicit weight class override (e.g. HL monitor liveness = 'interactive'); defaults to the ALS class. */
  cls?: WeightClass;
}

function isBanBody(json: unknown, codes: Array<string | number>): boolean {
  if (!json || typeof json !== 'object') return false;
  const code = (json as { code?: unknown }).code;
  return code !== undefined && codes.some((c) => c === code || String(c) === String(code));
}

/**
 * The single venue transport. Returns parsed JSON `T`. Throws
 * `UpstreamRateLimitError` (rate-limit/ban, no-retry), `WeightBudgetSkipError`
 * (batch budget saturated), or a generic `Error` (non-rate-limit non-2xx /
 * exhausted transient retries) — matching each adapter's prior error shapes.
 */
export async function upstreamFetch<T>(cfg: VenueFetchConfig, req: UpstreamRequest): Promise<T> {
  const entry = getVenueBudget(cfg.exchangeId);
  if (entry) {
    await entry.budget.acquire(entry.weightFor(req), req.cls ?? currentWeightClass());
  }
  for (let attempt = 0; attempt <= cfg.transientRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      cfg.onResponse?.(res);
      if (cfg.banStatuses.includes(res.status)) {
        const ra = res.headers.get(cfg.retryAfterHeader ?? 'Retry-After');
        const seconds = ra ? parseInt(ra, 10) : null;
        recordRateLimitEvent(cfg.venueName, 'throw', String(res.status), req.cls ?? currentWeightClass(), undefined, currentCaller());
        throw new UpstreamRateLimitError(cfg.venueName, Number.isFinite(seconds) ? seconds : null);
      }
      if (!res.ok) {
        throw new Error(`${cfg.apiErrorName ?? cfg.venueName} API ${res.status}: ${res.statusText}`);
      }
      const json = (await res.json()) as T;
      if (cfg.banBodyCodes && isBanBody(json, cfg.banBodyCodes)) {
        const code = (json as { code?: unknown }).code;
        recordRateLimitEvent(cfg.venueName, 'throw', code != null ? String(code) : 'BODY_CODE', req.cls ?? currentWeightClass(), undefined, currentCaller());
        throw new UpstreamRateLimitError(cfg.venueName, null);
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      // Never retry a rate-limit/ban (extends it) or a budget skip — surface immediately.
      if (err instanceof UpstreamRateLimitError || err instanceof WeightBudgetSkipError) throw err;
      if (attempt === cfg.transientRetries) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${cfg.apiErrorName ?? cfg.venueName} API: max retries exceeded`);
}

// ── Per-venue configs (exported; reused by adapters + non-adapter callers) ──
// banStatuses: default [418,429]; BYBIT adds 403 (public-IP "access too frequent"
// ban, verified 2026-06-05). banBodyCodes: Bitget 45001/40725/40808 (verified).
// timeoutMs: 3000 for promoted+Aster, 4000 for the 11 later-pilot shadow venues
// (matches each adapter's current TIMEOUT_MS — byte-equivalence).
const T3 = 3000;
const T4 = 4000;
export const VENUE_FETCH_CONFIGS: Record<string, VenueFetchConfig> = {
  HL: { venueName: 'Hyperliquid', apiErrorName: 'HL', exchangeId: 'HL', banStatuses: [429], timeoutMs: T3, transientRetries: 1 },
  BINANCE: {
    venueName: 'Binance',
    exchangeId: 'BINANCE',
    banStatuses: [418, 429],
    timeoutMs: T3,
    transientRetries: 1,
    onResponse: (res) => {
      const usedWeight = res.headers.get('X-MBX-USED-WEIGHT-1m');
      if (usedWeight && parseInt(usedWeight) > 1800) {
        console.warn(`[Binance] Rate limit warning: ${usedWeight}/2400 weight used`);
      }
    },
  },
  BYBIT: { venueName: 'Bybit', exchangeId: 'BYBIT', banStatuses: [403, 418, 429], timeoutMs: T3, transientRetries: 1 },
  OKX: { venueName: 'OKX', exchangeId: 'OKX', banStatuses: [418, 429], timeoutMs: T3, transientRetries: 1 },
  BITGET: { venueName: 'Bitget', exchangeId: 'BITGET', banStatuses: [418, 429], banBodyCodes: [45001, 40725, 40808], timeoutMs: T3, transientRetries: 1 },
  ASTER: { venueName: 'Aster', exchangeId: 'ASTER', banStatuses: [418, 429], timeoutMs: T3, transientRetries: 1 },
  BINGX: { venueName: 'BingX', exchangeId: 'BINGX', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  GATE: { venueName: 'Gate', exchangeId: 'GATE', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  HTX: { venueName: 'HTX', exchangeId: 'HTX', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  KUCOIN: { venueName: 'KuCoin', exchangeId: 'KUCOIN', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  MEXC: { venueName: 'MEXC', exchangeId: 'MEXC', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  PHEMEX: { venueName: 'Phemex', exchangeId: 'PHEMEX', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  WEEX: { venueName: 'WEEX', exchangeId: 'WEEX', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  BITMART: { venueName: 'Bitmart', exchangeId: 'BITMART', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  WHITEBIT: { venueName: 'WhiteBIT', exchangeId: 'WHITEBIT', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  XT: { venueName: 'XT', exchangeId: 'XT', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
  EDGEX: { venueName: 'edgeX', exchangeId: 'EDGEX', banStatuses: [418, 429], timeoutMs: T4, transientRetries: 1 },
};
