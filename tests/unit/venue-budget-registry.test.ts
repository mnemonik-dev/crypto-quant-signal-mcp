/**
 * tests/unit/venue-budget-registry.test.ts — OPS-ADAPTER-RATELIMIT-UNIFY-W1 (C2/C3)
 *
 * The registry is the SoT for *which* venues are cross-process budgeted. C2 moved
 * the HL/Binance singletons in; C3 added the BYBIT/OKX/BITGET request-count rows.
 * Asserts: the 5 budgeted venues resolve, weight semantics (weightHint venues vs
 * request-count venues), sparse-null for delay-paced shadow venues, distinct
 * instances, and that a budgeted entry can actually `acquire` (smoke).
 */
import { describe, it, expect } from 'vitest';
import { getVenueBudget } from '../../src/lib/venue-budget-registry.js';
import { WeightBudget } from '../../src/lib/upstream-weight-budget.js';

describe('venue-budget-registry', () => {
  it('resolves all five budgeted venues to a WeightBudget', () => {
    for (const id of ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET']) {
      const entry = getVenueBudget(id);
      expect(entry, id).not.toBeNull();
      expect(entry!.budget).toBeInstanceOf(WeightBudget);
    }
  });

  it('weight-metered venues (HL/Binance) read weightHint with a venue default', () => {
    const hl = getVenueBudget('HL')!;
    expect(hl.weightFor({ weightHint: 104 })).toBe(104);
    expect(hl.weightFor({})).toBe(20); // HL default

    const bin = getVenueBudget('BINANCE')!;
    expect(bin.weightFor({ weightHint: 40 })).toBe(40);
    expect(bin.weightFor({})).toBe(5); // Binance default
  });

  it('request-count venues (BYBIT/OKX/BITGET) always cost 1, ignoring weightHint', () => {
    for (const id of ['BYBIT', 'OKX', 'BITGET']) {
      const entry = getVenueBudget(id)!;
      expect(entry.weightFor({}), id).toBe(1);
      expect(entry.weightFor({ weightHint: 999 }), id).toBe(1); // request-count: hint ignored
    }
  });

  it('returns null for delay-paced shadow venues + unknown ids (sparse Map)', () => {
    for (const id of ['ASTER', 'KUCOIN', 'MEXC', 'PHEMEX', 'BITMART', 'XT', 'NOPE', '']) {
      expect(getVenueBudget(id), id).toBeNull();
    }
  });

  it('each budgeted venue is a distinct WeightBudget instance', () => {
    const budgets = ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET'].map((id) => getVenueBudget(id)!.budget);
    expect(new Set(budgets).size).toBe(5);
  });

  it('a budgeted entry can acquire (vitest ledger is unbounded; never throttles)', async () => {
    const bybit = getVenueBudget('BYBIT')!;
    await expect(bybit.budget.acquire(bybit.weightFor({}), 'interactive')).resolves.toBeUndefined();
  });
});
