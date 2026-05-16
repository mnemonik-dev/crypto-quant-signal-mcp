/**
 * EXCHANGE-SHADOW-PROMOTE-W1 / C3 — evaluate-venues cron unit tests.
 *
 * Mocks performance-db.dbQuery, venue-store helpers, and telegram.
 * Exercises every branch of the C3 decision tree + edge cases
 * (HOLDs-excluded math, pre-deadline no-op, sample-insufficient, NULL WR).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/performance-db.js', () => ({
  dbQuery: vi.fn(),
}));

vi.mock('../../src/lib/venue-store.js', () => ({
  listVenues: vi.fn(),
  recordEval: vi.fn(),
  setStatus: vi.fn(),
  incrementExtension: vi.fn(),
}));

vi.mock('../../src/lib/telegram.js', () => ({
  sendVenueStatusChange: vi.fn().mockResolvedValue(true),
}));

import {
  computeVenueStats,
  decide,
  evaluateAllShadowVenues,
} from '../../src/scripts/evaluate-venues.js';
import { dbQuery } from '../../src/lib/performance-db.js';
import {
  listVenues,
  recordEval,
  setStatus,
  incrementExtension,
} from '../../src/lib/venue-store.js';
import { sendVenueStatusChange } from '../../src/lib/telegram.js';
import type { VenueRecord } from '../../src/types.js';

const mockQuery = vi.mocked(dbQuery);
const mockList = vi.mocked(listVenues);
const mockRecord = vi.mocked(recordEval);
const mockSetStatus = vi.mocked(setStatus);
const mockIncrement = vi.mocked(incrementExtension);
const mockTelegram = vi.mocked(sendVenueStatusChange);

function makeShadow(overrides: Partial<VenueRecord> = {}): VenueRecord {
  return {
    exchange_id: 'GATEIO',
    status: 'shadow',
    asset_count: 100,
    min_buy_sell_sample: 1000,
    integrated_at: '2026-05-01T00:00:00Z',
    promoted_at: null,
    retired_at: null,
    extension_count: 0,
    last_eval_at: null,
    last_eval_pfe_wr: null,
    last_eval_buy_sell_count: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── decide() — pure-logic branch coverage ───────────────────────────────

describe('decide — branch coverage', () => {
  it('PROMOTE: day-15+ AND sample-met AND WR≥0.80 → action=promoted', () => {
    const venue = makeShadow();
    const decision = decide(venue, { pfe_wr: 0.85, buy_sell_count: 1500, days_since: 16 });
    expect(decision.action).toBe('promoted');
    if (decision.action === 'promoted') {
      expect(decision.pfe_wr).toBe(0.85);
      expect(decision.buy_sell_count).toBe(1500);
    }
  });

  it('EXTEND: day-15 hit, never extended, criteria miss → action=extended', () => {
    const venue = makeShadow({ extension_count: 0 });
    const decision = decide(venue, { pfe_wr: 0.65, buy_sell_count: 1500, days_since: 16 });
    expect(decision.action).toBe('extended');
  });

  it("EXTEND: day-15 hit, WR met but sample insufficient → still 'extended' (sample-met is AND condition)", () => {
    const venue = makeShadow({ extension_count: 0, min_buy_sell_sample: 1000 });
    const decision = decide(venue, { pfe_wr: 0.90, buy_sell_count: 999, days_since: 16 });
    expect(decision.action).toBe('extended');
  });

  it("MANUAL: day-30 hit, extension_count==1 → action=manual_required", () => {
    const venue = makeShadow({ extension_count: 1 });
    const decision = decide(venue, { pfe_wr: 0.70, buy_sell_count: 2000, days_since: 31 });
    expect(decision.action).toBe('manual_required');
  });

  it("NO-OP: within initial 15-day window → action=no_op, reason=within_initial_window", () => {
    const venue = makeShadow();
    const decision = decide(venue, { pfe_wr: null, buy_sell_count: 500, days_since: 7 });
    expect(decision.action).toBe('no_op');
    if (decision.action === 'no_op') expect(decision.reason).toBe('within_initial_window');
  });

  it("NO-OP: day-15+ but NO Phase-E outcomes yet (pfe_wr=null) → reason=no_phase_e_outcomes_yet (not promote)", () => {
    const venue = makeShadow({ extension_count: 0 });
    const decision = decide(venue, { pfe_wr: null, buy_sell_count: 1500, days_since: 16 });
    // Day-15 hit + extension_count==0 → extend branch triggers; but the test
    // covers the OPPOSITE scenario: already-extended-but-no-outcomes-yet
    // shouldn't promote. Re-test with extension_count=1, pre-day-30:
    const venue2 = makeShadow({ extension_count: 1 });
    const decision2 = decide(venue2, { pfe_wr: null, buy_sell_count: 1500, days_since: 25 });
    expect(decision2.action).toBe('no_op');
    if (decision2.action === 'no_op') expect(decision2.reason).toBe('no_phase_e_outcomes_yet');
    // First scenario: day-15 + extension_count=0 → extend
    expect(decision.action).toBe('extended');
  });

  it("NO-OP: sample insufficient after extension → reason=sample_insufficient", () => {
    const venue = makeShadow({ extension_count: 1 });
    const decision = decide(venue, { pfe_wr: 0.85, buy_sell_count: 500, days_since: 25 });
    expect(decision.action).toBe('no_op');
    if (decision.action === 'no_op') expect(decision.reason).toBe('sample_insufficient');
  });

  it("NO-OP: WR below threshold mid-cycle → reason=wr_below_threshold", () => {
    const venue = makeShadow({ extension_count: 1 });
    const decision = decide(venue, { pfe_wr: 0.65, buy_sell_count: 2000, days_since: 25 });
    expect(decision.action).toBe('no_op');
    if (decision.action === 'no_op') expect(decision.reason).toBe('wr_below_threshold');
  });

  it("EDGE: sample-met by exactly one short → still 'extended' (>=, not >)", () => {
    const venue = makeShadow({ min_buy_sell_sample: 1000, extension_count: 0 });
    // sample = 999 → insufficient → extend
    expect(decide(venue, { pfe_wr: 0.90, buy_sell_count: 999, days_since: 16 }).action).toBe('extended');
    // sample = 1000 exact → meets gate → promote
    expect(decide(venue, { pfe_wr: 0.90, buy_sell_count: 1000, days_since: 16 }).action).toBe('promoted');
  });

  it("EDGE: WR exactly at 0.80 threshold → promote (>=, not >)", () => {
    const venue = makeShadow({ extension_count: 0 });
    expect(decide(venue, { pfe_wr: 0.7999, buy_sell_count: 1500, days_since: 16 }).action).toBe('extended');
    expect(decide(venue, { pfe_wr: 0.8000, buy_sell_count: 1500, days_since: 16 }).action).toBe('promoted');
  });
});

// ── computeVenueStats — SQL shape coverage ──────────────────────────────

describe('computeVenueStats — SQL shape', () => {
  it("filters buy_sell_count by signal IN ('BUY','SELL') AND created_at > integrated_at", async () => {
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 1500 }])
      .mockResolvedValueOnce([{ pfe_wr: 0.85 }]);
    const venue = makeShadow({ integrated_at: '2026-05-01T00:00:00Z' });
    const now = new Date('2026-05-20T00:00:00Z');
    const stats = await computeVenueStats(venue, now);
    expect(stats.buy_sell_count).toBe(1500);
    expect(stats.pfe_wr).toBeCloseTo(0.85);
    expect(stats.days_since).toBe(19);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toMatch(/COUNT\(\*\)/);
    expect(countCall[0]).toMatch(/signal IN \('BUY', 'SELL'\)/);
    expect(countCall[0]).toMatch(/created_at > \?/);

    const wrCall = mockQuery.mock.calls[1];
    expect(wrCall[0]).toMatch(/AVG\(CASE/);
    expect(wrCall[0]).toMatch(/WHEN \(signal = 'BUY'  AND pfe_return_pct > 0\)/);
    expect(wrCall[0]).toMatch(/WHEN \(signal = 'SELL' AND pfe_return_pct < 0\)/);
    expect(wrCall[0]).toMatch(/pfe_return_pct IS NOT NULL/);
  });

  it("pfe_wr=null when no Phase-E-evaluated signals exist yet", async () => {
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 100 }])
      .mockResolvedValueOnce([{ pfe_wr: null }]);
    const stats = await computeVenueStats(makeShadow());
    expect(stats.pfe_wr).toBeNull();
    expect(stats.buy_sell_count).toBe(100);
  });

  it("HOLDs-excluded math: 990 HOLDs + 10 BUYs (all wins) → buy_sell_count=10, pfe_wr=1.0", async () => {
    // The SQL contract guarantees signal IN ('BUY','SELL') filters out HOLDs
    // at the query layer. Test asserts the result the SQL would return.
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 10 }])
      .mockResolvedValueOnce([{ pfe_wr: 1.0 }]);
    const venue = makeShadow({ min_buy_sell_sample: 100, integrated_at: '2026-05-13T00:00:00Z' });
    // Force days_since < 15 so the no-op branch (sample insufficient,
    // pre-deadline) fires deterministically without depending on real wall-
    // clock vs default `now`.
    const now = new Date('2026-05-16T00:00:00Z'); // 3 days since integration
    const stats = await computeVenueStats(venue, now);
    expect(stats.buy_sell_count).toBe(10);
    expect(stats.pfe_wr).toBe(1.0);
    // With min_buy_sell_sample=100 + buy_sell_count=10 + days_since=3 →
    // pre-deadline no-op (NOT extended — day-15 floor not yet hit).
    const decision = decide(venue, stats);
    expect(decision.action).toBe('no_op');
    if (decision.action === 'no_op') {
      expect(decision.reason).toBe('within_initial_window');
    }
  });
});

// ── evaluateAllShadowVenues — orchestration coverage ────────────────────

describe('evaluateAllShadowVenues — orchestration', () => {
  it("0 shadow venues → 0 actions, 0 Telegram alerts, 0 setStatus calls", async () => {
    mockList.mockResolvedValueOnce([{}, {}, {}, {}, {}] as unknown as VenueRecord[]); // 5 promoted
    mockList.mockResolvedValueOnce([]); // 0 shadow
    const summary = await evaluateAllShadowVenues();
    expect(summary.promoted_count_initial).toBe(5);
    expect(summary.shadow_count).toBe(0);
    expect(summary.actions).toEqual([]);
    expect(mockTelegram).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("1 shadow venue triggers PROMOTE → setStatus('promoted') + Telegram", async () => {
    const shadow = makeShadow({ integrated_at: '2026-05-01T00:00:00Z' });
    mockList.mockResolvedValueOnce([] as VenueRecord[]); // promoted query
    mockList.mockResolvedValueOnce([shadow]); // shadow query
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 1500 }])
      .mockResolvedValueOnce([{ pfe_wr: 0.85 }]);
    const now = new Date('2026-05-20T00:00:00Z');
    const summary = await evaluateAllShadowVenues(now);

    expect(summary.actions).toHaveLength(1);
    expect(summary.actions[0].decision.action).toBe('promoted');
    expect(mockRecord).toHaveBeenCalledWith('GATEIO', 0.85, 1500, now);
    expect(mockSetStatus).toHaveBeenCalledWith('GATEIO', 'promoted', { promoted_at: now });
    expect(mockTelegram).toHaveBeenCalledWith(expect.objectContaining({
      venue: 'GATEIO',
      action: 'promoted',
      pfe_wr: 0.85,
      buy_sell_count: 1500,
    }));
  });

  it("EXTEND branch fires incrementExtension + Telegram (NOT setStatus)", async () => {
    const shadow = makeShadow({ integrated_at: '2026-05-01T00:00:00Z', extension_count: 0 });
    mockList.mockResolvedValueOnce([] as VenueRecord[]);
    mockList.mockResolvedValueOnce([shadow]);
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 1500 }])
      .mockResolvedValueOnce([{ pfe_wr: 0.65 }]);
    const now = new Date('2026-05-20T00:00:00Z');
    await evaluateAllShadowVenues(now);

    expect(mockIncrement).toHaveBeenCalledWith('GATEIO');
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockTelegram).toHaveBeenCalledWith(expect.objectContaining({
      action: 'extended',
      extension_count: 1, // pre-increment+1 (Telegram surfaces new count)
    }));
  });

  it("MANUAL branch fires Telegram only (NO state change)", async () => {
    const shadow = makeShadow({
      integrated_at: '2026-04-01T00:00:00Z',
      extension_count: 1,
    });
    mockList.mockResolvedValueOnce([] as VenueRecord[]);
    mockList.mockResolvedValueOnce([shadow]);
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 1500 }])
      .mockResolvedValueOnce([{ pfe_wr: 0.70 }]);
    const now = new Date('2026-05-15T00:00:00Z');
    await evaluateAllShadowVenues(now);

    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
    expect(mockTelegram).toHaveBeenCalledWith(expect.objectContaining({
      action: 'manual_required',
    }));
  });

  it("NO-OP branch (pre-deadline) records eval but no Telegram + no state change", async () => {
    const shadow = makeShadow({ integrated_at: '2026-05-13T00:00:00Z' });
    mockList.mockResolvedValueOnce([] as VenueRecord[]);
    mockList.mockResolvedValueOnce([shadow]);
    mockQuery
      .mockResolvedValueOnce([{ buy_sell_count: 200 }])
      .mockResolvedValueOnce([{ pfe_wr: 0.6 }]);
    const now = new Date('2026-05-16T00:00:00Z');
    await evaluateAllShadowVenues(now);

    expect(mockRecord).toHaveBeenCalled();
    expect(mockTelegram).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });
});
