/**
 * Track-record snapshot — the single live-value source for activation nudges.
 *
 * ACTIVATION-NUDGE-W1 (2026-06-18): the soft/aha/limit upgrade nudges quote the
 * public PFE win-rate + on-chain call count. Those numbers must be LIVE (per the
 * Numerical-citation + measured-claims LAW — never hardcoded in copy), but the
 * nudge builders run on the SYNCHRONOUS hot response path and cannot block on an
 * HTTP fetch. So this module holds a process-cached `{pfeWr, callCount}` that a
 * background warmer refreshes from `/api/performance-public`, with a `[STATIC]`
 * fallback snapshot for cold-start / fetch-failure.
 *
 * SoT field map (verified live 2026-06-18 — `curl …/api/performance-public`):
 *   - PFE WR  ← `.overall.pfeWinRate` (FRACTION, e.g. 0.9157) → ×100, 1 dp → "91.6"
 *               (matches landing `data-tr-field="pfe_wr"`; NOT a top-level field —
 *               `email.ts` reads the wrong path and silently shows its fallback)
 *   - N calls ← top-level `totalCalls` (== `.overall.totalCalls`) → locale string
 *               → "246,331" (matches landing `data-tr-field="call_count"`)
 *
 * Process-boundary discipline (per CLAUDE.md "module-level warmer process-boundary
 * gate"): `getTrackRecord()` is a PURE synchronous read (never starts a timer), so
 * importing it in a test / `docker exec` cron is side-effect-free. ONLY the
 * long-lived server process calls `startTrackRecordWarmer()` (from index.ts boot).
 */

export interface TrackRecord {
  /** PFE win rate, percent, 1 dp, as a display string (e.g. "91.6"). */
  pfeWr: string;
  /** On-chain call count, locale-grouped display string (e.g. "246,331"). */
  callCount: string;
}

/**
 * `[STATIC]` fallback — live snapshot taken 2026-06-18 from
 * `/api/performance-public` (`.overall.pfeWinRate`=0.9157 → "91.6";
 * `totalCalls`=246,331). Both are monotonic-grow floors (call count only
 * climbs; WR is stable) so a stale fallback under-states rather than over-states
 * — honest with the copy's trailing "+". Refreshed live by the warmer below.
 */
const FALLBACK: TrackRecord = { pfeWr: '91.6', callCount: '246,331' };

let cached: TrackRecord | null = null;
let warmerStarted = false;

/**
 * Synchronous, side-effect-free read of the current track-record snapshot.
 * Returns the last successful warm fetch, or the `[STATIC]` fallback before the
 * first fetch lands / after a fetch failure. Safe to call on the hot path.
 */
export function getTrackRecord(): TrackRecord {
  return cached ?? FALLBACK;
}

/**
 * Fetch `/api/performance-public` and update the cache. Fail-open: on any
 * error / bad shape the cache is left as-is (last-good or fallback). Exported
 * for the warmer + tests; production code reads via `getTrackRecord()`.
 */
export async function refreshTrackRecord(): Promise<TrackRecord> {
  const baseUrl = process.env.API_BASE_URL || 'https://api.algovault.com';
  try {
    const res = await fetch(`${baseUrl}/api/performance-public`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return getTrackRecord();
    const data = (await res.json()) as {
      overall?: { pfeWinRate?: number | null; totalCalls?: number | null };
      totalCalls?: number | null;
    };
    const wrFraction = data.overall?.pfeWinRate;
    const calls = data.overall?.totalCalls ?? data.totalCalls;
    // Both must be valid numbers to adopt a fresh snapshot; otherwise keep the
    // last-good value (a partial / null payload must not blank the nudge).
    if (typeof wrFraction !== 'number' || !Number.isFinite(wrFraction)) return getTrackRecord();
    if (typeof calls !== 'number' || !Number.isFinite(calls) || calls <= 0) return getTrackRecord();
    cached = {
      pfeWr: (wrFraction * 100).toFixed(1),
      callCount: Math.round(calls).toLocaleString('en-US'),
    };
    return cached;
  } catch {
    return getTrackRecord();
  }
}

/**
 * Refresh interval — track-record numbers move slowly (call count climbs
 * steadily, WR barely drifts), so a 15-minute warm is well within acceptable
 * staleness for a conversion nudge.
 */
const REFRESH_MS = 15 * 60 * 1000;

/**
 * Start the background warmer (idempotent). Called ONCE from the server boot in
 * index.ts — never from a tool, test, or short-lived cron. Kicks an immediate
 * non-blocking refresh, then refreshes on an interval. The interval is
 * `.unref()`'d so it never holds the event loop open on its own.
 */
export function startTrackRecordWarmer(): void {
  if (warmerStarted) return;
  warmerStarted = true;
  // Immediate warm (non-blocking — boot does not await the first fetch).
  void refreshTrackRecord();
  const timer = setInterval(() => {
    void refreshTrackRecord();
  }, REFRESH_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

/** Inject a snapshot — tests only. */
export function _setTrackRecordForTest(value: TrackRecord | null): void {
  cached = value;
}

/** Reset module state — tests only. */
export function _resetTrackRecordForTest(): void {
  cached = null;
  warmerStarted = false;
}
