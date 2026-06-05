/**
 * tests/seed-orchestrator-concurrency.test.ts — OPS-SEED-ORCHESTRATOR-W1 / CH1
 *
 * Unit coverage for the bounded-concurrency seed primitives added to
 * `src/scripts/seed-signals.ts` (the durable generator fix: seed-process count
 * and DB-connection ceiling become invariant to venue count):
 *
 *   - runVenuesWithConcurrency() — max in-flight ≤ limit; one rejecting runner
 *     never loses the others (fail-soft fan-in); result order preserved.
 *   - runVenueSeed()             — per-venue fail-soft: a throwing universe
 *     fetcher yields {failed:true} and NEVER rejects (preserves the current
 *     continue-on-venue-failure semantics).
 *   - rotateVenues()             — deterministic TF-indexed rotation; the result
 *     is a permutation (same set, no drops/dupes); single-venue = identity (so
 *     the legacy per-exchange crons stay byte-equivalent at CH1).
 *   - formatOrchestratorSummary()— the greppable `[seed-orchestrator]` contract.
 *   - computeOverrun()           — the 0.8×cadence boundary.
 *
 * Audit reference: audits/OPS-SEED-ORCHESTRATOR-W1-endpoint-truth.md
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  runVenueSeed,
  runVenuesWithConcurrency,
  rotateVenues,
  formatOrchestratorSummary,
  computeOverrun,
  TF_CADENCE_S,
  UNIVERSE_FETCHERS,
  type VenueSeedResult,
} from '../src/scripts/seed-signals.js';
import type { ExchangeId } from '../src/types.js';

const PROMOTED: ExchangeId[] = ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET'];

function fakeResult(venueId: ExchangeId, over: Partial<VenueSeedResult> = {}): VenueSeedResult {
  return { venueId, seeded: 1, skipped: 0, errors: 0, durationMs: 1, failed: false, ...over };
}

describe('runVenuesWithConcurrency — bounded fan-out (R1.3)', () => {
  it('never runs more than `limit` runners in flight (limit 2, 5 venues)', async () => {
    let inFlight = 0;
    let peak = 0;
    const runner = async (v: ExchangeId): Promise<VenueSeedResult> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return fakeResult(v);
    };
    const results = await runVenuesWithConcurrency(PROMOTED, 2, runner);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1); // genuinely parallelised, not accidentally serial
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.venueId).sort()).toEqual([...PROMOTED].sort());
  });

  it('limit 1 runs strictly serially (max in flight == 1) — byte-equivalent path', async () => {
    let inFlight = 0;
    let peak = 0;
    const runner = async (v: ExchangeId): Promise<VenueSeedResult> => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return fakeResult(v);
    };
    await runVenuesWithConcurrency(PROMOTED, 1, runner);
    expect(peak).toBe(1);
  });

  it('one rejecting runner does NOT lose the other venues (fail-soft fan-in)', async () => {
    const runner = async (v: ExchangeId): Promise<VenueSeedResult> => {
      if (v === 'BYBIT') throw new Error('synthetic venue blow-up');
      return fakeResult(v, { seeded: 7 });
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const results = await runVenuesWithConcurrency(PROMOTED, 2, runner);
    errSpy.mockRestore();
    expect(results).toHaveLength(5); // nobody lost
    const bybit = results.find((r) => r.venueId === 'BYBIT');
    expect(bybit?.failed).toBe(true);
    expect(bybit?.seeded).toBe(0);
    const others = results.filter((r) => r.venueId !== 'BYBIT');
    expect(others).toHaveLength(4);
    expect(others.every((r) => r.seeded === 7 && r.failed === false)).toBe(true);
  });

  it('preserves input order in the results array', async () => {
    const order: ExchangeId[] = ['OKX', 'HL', 'BITGET', 'BINANCE', 'BYBIT'];
    const runner = async (v: ExchangeId): Promise<VenueSeedResult> => fakeResult(v);
    const results = await runVenuesWithConcurrency(order, 3, runner);
    expect(results.map((r) => r.venueId)).toEqual(order);
  });
});

describe('runVenueSeed — per-venue fail-soft (R1.2)', () => {
  const saved: Partial<Record<ExchangeId, (n: number) => Promise<string[]>>> = {};
  afterEach(() => {
    for (const k of Object.keys(saved) as ExchangeId[]) {
      UNIVERSE_FETCHERS[k] = saved[k]!;
      delete saved[k];
    }
    vi.restoreAllMocks();
  });

  it('a throwing universe fetcher yields {failed:true} and never rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    saved.BITGET = UNIVERSE_FETCHERS.BITGET;
    UNIVERSE_FETCHERS.BITGET = async () => {
      throw new Error('synthetic universe fetch failure');
    };
    const res = await runVenueSeed('BITGET', {
      timeframe: '5m',
      top: 50,
      idempotencyWindow: 240,
      restrictedCoins: null,
    });
    expect(res.failed).toBe(true);
    expect(res.seeded).toBe(0);
    expect(res.venueId).toBe('BITGET');
    expect(typeof res.durationMs).toBe('number');
  });

  it('an empty universe is a clean skip (failed:false, seeded:0)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    saved.OKX = UNIVERSE_FETCHERS.OKX;
    UNIVERSE_FETCHERS.OKX = async () => [];
    const res = await runVenueSeed('OKX', {
      timeframe: '5m',
      top: 50,
      idempotencyWindow: 240,
      restrictedCoins: null,
    });
    expect(res.failed).toBe(false);
    expect(res.seeded).toBe(0);
  });
});

describe('rotateVenues — deterministic TF rotation (R1.4)', () => {
  it('is a permutation: same set, no drops or dupes, across every timeframe', () => {
    for (const tf of Object.keys(TF_CADENCE_S)) {
      const rot = rotateVenues(PROMOTED, tf);
      expect(rot).toHaveLength(PROMOTED.length);
      expect([...rot].sort()).toEqual([...PROMOTED].sort());
    }
  });

  it('is deterministic (same TF → identical order every call)', () => {
    expect(rotateVenues(PROMOTED, '5m')).toEqual(rotateVenues(PROMOTED, '5m'));
  });

  it('different timeframes start on different venues (cross-process burst spread)', () => {
    const starts = ['5m', '15m', '30m', '1h'].map((tf) => rotateVenues(PROMOTED, tf)[0]);
    expect(new Set(starts).size).toBeGreaterThan(1);
  });

  it('single-venue list is identity (legacy per-exchange crons unchanged at CH1)', () => {
    expect(rotateVenues(['HL'], '5m')).toEqual(['HL']);
    expect(rotateVenues(['HL'], '1d')).toEqual(['HL']);
  });

  it('empty list returns empty', () => {
    expect(rotateVenues([], '5m')).toEqual([]);
  });
});

describe('formatOrchestratorSummary — greppable contract (R1.6)', () => {
  it('emits the exact [seed-orchestrator] shape (none for no failed venues)', () => {
    const line = formatOrchestratorSummary({
      timeframe: '5m', venues: 5, concurrency: 2,
      seeded: 12, skipped: 3, errors: 0,
      failedVenues: [], durationS: 12.34, overrun: false,
    });
    expect(line).toBe(
      '[seed-orchestrator] tf=5m venues=5 concurrency=2 seeded=12 skipped=3 errors=0 failed_venues=none duration_s=12.3 overrun=false',
    );
  });

  it('matches the monitor/gate regex contract and joins failed venues with commas', () => {
    const line = formatOrchestratorSummary({
      timeframe: '1h', venues: 5, concurrency: 2,
      seeded: 0, skipped: 200, errors: 1,
      failedVenues: ['BYBIT', 'OKX'], durationS: 5, overrun: true,
    });
    expect(line).toMatch(
      /^\[seed-orchestrator\] tf=\S+ venues=\d+ concurrency=\d+ seeded=\d+ skipped=\d+ errors=\d+ failed_venues=\S+ duration_s=[\d.]+ overrun=(true|false)$/,
    );
    expect(line).toContain('failed_venues=BYBIT,OKX');
  });
});

describe('computeOverrun — 0.8×cadence boundary (R1.6)', () => {
  it('5m (cadence 300s): 239s under, 241s over the 240s line', () => {
    expect(computeOverrun('5m', 239)).toBe(false);
    expect(computeOverrun('5m', 241)).toBe(true);
  });
  it('exactly 0.8×cadence is NOT an overrun (strictly greater)', () => {
    expect(computeOverrun('5m', 240)).toBe(false);
  });
  it('unknown timeframe never overruns (cadence 0 → false)', () => {
    expect(computeOverrun('99x', 999999)).toBe(false);
  });
});
