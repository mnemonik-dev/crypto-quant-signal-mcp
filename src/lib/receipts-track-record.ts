/**
 * In-process cached track-record source for the `_receipts` primitive
 * (P0 VERDICT-WITH-RECEIPTS-W1).
 *
 * The receipt proof numbers must be LIVE (Numerical-citation + measured-claims
 * LAW — never hardcoded), but `formatReceipts` runs on the SYNCHRONOUS hot
 * response path and must not block. So this module caches the slim
 * `{pfe_win_rate, n, window, as_of}` snapshot that a background warmer refreshes
 * from the SAME in-process performance data behind `performance://signal-performance`
 * (`getPerformanceStatsAsync`).
 *
 * Deliberately distinct from `track-record-snapshot.ts`: that module HTTP-fetches
 * `/api/performance-public` to feed the activation-nudge display copy. The wave
 * spec requires the receipt numbers come from the in-process source and NOT a
 * fresh HTTP self-call — so this is the in-process sibling, carrying the richer
 * receipt shape (evaluated `n`, coverage `window`, snapshot `as_of`).
 *
 * Process-boundary discipline (CLAUDE.md "module-level warmer process-boundary
 * gate"): `getReceiptTrackRecord()` is a PURE synchronous read (never starts a
 * timer), so importing it in a tool / test / `docker exec` cron is side-effect-
 * free. ONLY the long-lived server process calls `startReceiptTrackRecordWarmer()`
 * (from index.ts boot). Fail-open: returns null before the first warm / after a
 * source failure, and the receipt OMITS the track-record line rather than showing
 * a stale number.
 */
import { getPerformanceStatsAsync } from './performance-db.js';
import type { ReceiptTrackRecord } from './receipts.js';

let cached: ReceiptTrackRecord | null = null;
let warmerStarted = false;

/**
 * Synchronous, side-effect-free read of the current receipt track-record. Returns
 * the last successful warm, or null before the first fetch lands / after a
 * failure (caller fail-opens by omitting the track-record line).
 */
export function getReceiptTrackRecord(): ReceiptTrackRecord | null {
  return cached;
}

/**
 * Refresh the cache from the in-process performance stats. Fail-open: on any
 * error / null-WR / zero-sample payload the cache is left as-is (last-good or
 * null) — a partial source must never blank or zero the proof. Exported for the
 * warmer + tests; production code reads via `getReceiptTrackRecord()`.
 */
export async function refreshReceiptTrackRecord(): Promise<ReceiptTrackRecord | null> {
  try {
    const stats = await getPerformanceStatsAsync();
    const wr = stats.overall?.pfeWinRate;
    const n = stats.overall?.totalEvaluated;
    // Both must be valid + a non-empty sample to adopt a fresh snapshot.
    if (typeof wr !== 'number' || !Number.isFinite(wr)) return cached;
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return cached;
    const from = stats.period?.from;
    const to = stats.period?.to;
    cached = {
      pfe_win_rate: Number(wr.toFixed(4)),
      n: Math.round(n),
      window: from && to ? `${from}..${to}` : '',
      as_of: new Date().toISOString(),
    };
    return cached;
  } catch {
    return cached;
  }
}

/**
 * Refresh interval — track-record numbers move slowly (evaluated count climbs
 * steadily, WR barely drifts), so a 15-minute warm is well within acceptable
 * staleness for an inline proof line.
 */
const REFRESH_MS = 15 * 60 * 1000;

/**
 * Start the background warmer (idempotent). Called ONCE from the server boot in
 * index.ts — never from a tool, test, or short-lived cron. Kicks an immediate
 * non-blocking refresh, then refreshes on an interval. The interval is `.unref()`'d
 * so it never holds the event loop open on its own.
 */
export function startReceiptTrackRecordWarmer(): void {
  if (warmerStarted) return;
  warmerStarted = true;
  void refreshReceiptTrackRecord();
  const timer = setInterval(() => {
    void refreshReceiptTrackRecord();
  }, REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/** Inject a snapshot — tests only. */
export function _setReceiptTrackRecordForTest(value: ReceiptTrackRecord | null): void {
  cached = value;
}

/** Reset module state — tests only. */
export function _resetReceiptTrackRecordForTest(): void {
  cached = null;
  warmerStarted = false;
}
