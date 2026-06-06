/**
 * tests/unit/signal-perf-backfill-batch.test.ts — OPS-HL-BACKFILL-BATCH-W1 R2
 *
 * The lazy outcome-backfill fired by `getSignalPerformance()` runs in the BATCH weight class
 * (it was 100% of HL interactive BUDGET_CEILING throws — OPS-RATELIMIT-CALLER-ATTRIBUTION-W1)
 * AND is single-flighted so concurrent reads SHARE one batch sweep (mirrors
 * `cross-asset-grid ensureRefreshInflight`). Fail-open preserved (a backfill error never
 * affects the read response).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist-safe shared state the performance-db mock writes + the test reads.
const h = vi.hoisted(() => ({
  sweeps: 0, // # times runBackfill's DB-read "all due outcomes" sweep ran
  classSeen: [] as string[], // weight class observed during each sweep
  cwc: null as null | (() => string), // late-bound REAL currentWeightClass (budget unmocked)
  pendingImpl: null as null | (() => Promise<unknown[]>), // per-test override of the sweep result
}));

// getAdapter is never reached (the sweep returns 0 due signals) — stub defensively.
vi.mock('../../src/lib/exchange-adapter.js', () => ({
  getAdapter: () => ({ getCandles: async () => [] }),
}));

// Mock the backfill's first DB call so the sweep is observable + returns 0 signals (fast, no
// HL). The class is captured SYNCHRONOUSLY (before any await), so the single-flight count +
// class are settled before either concurrent read resolves.
vi.mock('../../src/lib/performance-db.js', () => ({
  getSignalsNeedingUnifiedBackfillAsync: () => {
    h.sweeps++;
    if (h.cwc) h.classSeen.push(h.cwc());
    return h.pendingImpl ? h.pendingImpl() : Promise.resolve([]);
  },
  getPerformanceStatsAsync: () => Promise.resolve({ totalCalls: 0 }),
  updateSignalOutcomes: () => {},
}));

import { getSignalPerformance } from '../../src/resources/signal-performance.js';
import { currentWeightClass } from '../../src/lib/upstream-weight-budget.js';
h.cwc = currentWeightClass;

describe('getSignalPerformance lazy backfill — batch + single-flight (OPS-HL-BACKFILL-BATCH-W1)', () => {
  beforeEach(async () => {
    // let any prior in-flight backfill settle so the module-level guard clears, then reset.
    await new Promise((r) => setTimeout(r, 5));
    h.sweeps = 0;
    h.classSeen.length = 0;
    h.pendingImpl = null;
  });

  it('two concurrent reads share ONE backfill sweep, run in the BATCH class', async () => {
    // The guard is synchronous + runBackfill calls its DB-read synchronously (before its
    // first await) → sweep count + class are settled before either read resolves.
    const reads = Promise.all([getSignalPerformance(), getSignalPerformance()]);
    expect(h.sweeps).toBe(1); // single-flight: one shared sweep, not two
    expect(h.classSeen).toEqual(['batch']); // BATCH lane, not interactive (the whole fix)
    await expect(reads).resolves.toBeDefined(); // both reads resolve (read never blocks on backfill)
  });

  it('a later read after the in-flight settles triggers a fresh sweep (guard clears on settle)', async () => {
    await getSignalPerformance();
    await new Promise((r) => setTimeout(r, 5)); // let the fire-and-forget backfill settle + clear
    await getSignalPerformance();
    expect(h.sweeps).toBeGreaterThanOrEqual(2);
  });

  it('a backfill error never breaks the read (fail-open; backfill stays fire-and-forget)', async () => {
    h.pendingImpl = () => Promise.reject(new Error('boom')); // sweep throws
    await expect(getSignalPerformance()).resolves.toBeDefined(); // read still resolves
    expect(h.classSeen).toEqual(['batch']); // and it still ran in batch
  });
});
