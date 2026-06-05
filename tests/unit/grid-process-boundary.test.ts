/**
 * OPS-GRID-PROCESS-BOUNDARY-W1 — the 42-cell grid refresh is the long-lived
 * server's job ONLY; the breaker is silent; server refreshes are batch-lane +
 * stale-while-revalidate.
 *
 * R1 — process-identity gate: short-lived (cron/seed/backfill) processes never
 *      trigger a refresh; the server is unchanged.
 * R2 — silent breaker: a trip resizes to the fallback grid + logs a forensic
 *      console.warn, but NEVER calls sendAlert (recovery alerts are noise).
 * R3 — batch class + SWR: a stale snapshot is served immediately while a single
 *      coalesced background refresh runs; cold start still blocks-and-fills.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// R2 regression guard — mock telegram so any (regressed) breaker page is
// observable. After this wave the grid module no longer imports telegram, so
// this asserts the trip branch can never reintroduce a page.
vi.mock('../../src/lib/telegram.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(true),
}));

import { sendAlert } from '../../src/lib/telegram.js';
import {
  GRID_ASSETS,
  GRID_TIMEFRAMES_FULL,
  FALLBACK_TIMEFRAMES,
  GRID_SCORING_EXCHANGE,
  getGridSnapshot,
  refreshGridIfStale,
  getActiveGridTimeframes,
  _setProcessIdentityForTest,
  _setScorerOverride,
  _setSnapshotForTest,
  _clearCache,
  _resetCircuitBreaker,
  _resetRateLimitBackoff,
  _pushRefreshDurationForTest,
} from '../../src/lib/cross-asset-grid.js';
import type { GridCell } from '../../src/types.js';

const FULL_GRID_CELLS = GRID_ASSETS.length * GRID_TIMEFRAMES_FULL.length; // 42

function makeBuyScorer(confidence = 70): {
  scorer: (coin: string, timeframe: string) => Promise<GridCell>;
  callCount: () => number;
} {
  let count = 0;
  return {
    scorer: async (coin, timeframe) => {
      count++;
      return { coin, timeframe, signal: 'BUY', confidence, exchange: GRID_SCORING_EXCHANGE, regime: 'TRENDING_UP' };
    },
    callCount: () => count,
  };
}

function resetGridState(): void {
  _setProcessIdentityForTest(false); // default: long-lived server
  _clearCache();
  _setScorerOverride(null);
  _resetCircuitBreaker();
  _resetRateLimitBackoff();
}

beforeEach(() => {
  resetGridState();
  vi.mocked(sendAlert).mockClear();
});

afterEach(() => {
  resetGridState();
  vi.useRealTimers();
});

describe('R1: process-identity gate (server-only refresh)', () => {
  it('short-lived process: getGridSnapshot returns the cache without refreshing (scorer never called)', async () => {
    _setProcessIdentityForTest(true);
    const handle = makeBuyScorer();
    _setScorerOverride(handle.scorer);
    _clearCache();

    const snap = await getGridSnapshot();

    expect(snap).toEqual([]);           // empty cache, no refresh
    expect(handle.callCount()).toBe(0); // the scorer override is never invoked
  });

  it('short-lived process: refreshGridIfStale is a no-op (scorer never called)', async () => {
    _setProcessIdentityForTest(true);
    const handle = makeBuyScorer();
    _setScorerOverride(handle.scorer);
    _clearCache();

    await refreshGridIfStale();

    expect(handle.callCount()).toBe(0);
  });

  it('long-lived server process: getGridSnapshot refreshes the full grid (unchanged)', async () => {
    _setProcessIdentityForTest(false);
    const handle = makeBuyScorer();
    _setScorerOverride(handle.scorer);
    _clearCache();

    const snap = await getGridSnapshot();

    expect(snap).toHaveLength(FULL_GRID_CELLS);
    expect(handle.callCount()).toBe(FULL_GRID_CELLS);
  });
});

describe('R2: silent breaker (no paging)', () => {
  it('trip resizes to the fallback grid + logs a forensic warn but NEVER calls sendAlert', async () => {
    // Stub Date.now so we can force a measured refresh duration > 30s deterministically
    // (returns `fakeNow`, bumped once mid-refresh). Base time is large (> the former 1h
    // cooldown) so the PRE-wave code path WOULD have paged — that makes the
    // `not.toHaveBeenCalled()` assertion a real RED before the fix, not a vacuous pass.
    const BASE = 10_000_000;
    let fakeNow = BASE;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    _resetCircuitBreaker();
    // Two prior slow refreshes preloaded; this refresh is the 3rd consecutive slow one.
    _pushRefreshDurationForTest(40_000);
    _pushRefreshDurationForTest(40_000);

    let jumped = false;
    _setScorerOverride(async (coin, timeframe): Promise<GridCell> => {
      if (!jumped) { jumped = true; fakeNow = BASE + 31_000; } // this refresh measures 31s
      return { coin, timeframe, signal: 'HOLD', confidence: 0, exchange: GRID_SCORING_EXCHANGE, regime: 'RANGING' };
    });
    _clearCache();

    await refreshGridIfStale();

    // Breaker tripped → grid resized to the fallback timeframe set.
    expect([...getActiveGridTimeframes()]).toEqual([...FALLBACK_TIMEFRAMES]);
    // Forensic warn emitted (the full measured-durations line is preserved).
    expect(
      warnSpy.mock.calls.some((c) => String(c[0]).includes('slow-grid circuit breaker TRIPPED')),
    ).toBe(true);
    // R2: the self-recovering fallback must never page.
    expect(sendAlert).not.toHaveBeenCalled();

    nowSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('R3: batch class + stale-while-revalidate', () => {
  it('cold start blocks and fills the cache', async () => {
    const handle = makeBuyScorer();
    _setScorerOverride(handle.scorer);
    _clearCache();

    const snap = await getGridSnapshot();

    expect(snap).toHaveLength(FULL_GRID_CELLS);
    expect(handle.callCount()).toBe(FULL_GRID_CELLS);
  });

  it('stale snapshot is served immediately + the background refresh fires once (coalesced)', async () => {
    const handle = makeBuyScorer();
    _setScorerOverride(handle.scorer);
    _clearCache();

    const first = await getGridSnapshot();         // cold → one full refresh
    expect(handle.callCount()).toBe(FULL_GRID_CELLS);

    _setSnapshotForTest(first, Date.now() - 61_000); // backdate → stale

    const t0 = Date.now();
    const stale = await getGridSnapshot();          // SWR: returns the stale array, does not block
    const elapsed = Date.now() - t0;
    expect(stale).toBe(first);
    expect(elapsed).toBeLessThan(20);

    // The background refresh was kicked; join it (coalesced) and confirm exactly
    // ONE more full refresh ran — 2 × 42 total, never 3 × 42 (no double refresh).
    await refreshGridIfStale();
    expect(handle.callCount()).toBe(FULL_GRID_CELLS * 2);
  });
});
