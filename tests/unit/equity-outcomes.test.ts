/** Unit tests — EQUITIES-ENGINE-W1 C5 pure PFE/outcome computation. */
import { describe, it, expect } from 'vitest';
import { computePfeOutcome, type OutcomeBar } from '../../src/lib/equities/equity-outcomes.js';

const bar = (high: number, low: number, close: number): OutcomeBar => ({ high, low, close });

describe('computePfeOutcome', () => {
  it('BUY: pfe tracks the highest high (entry-anchored, positive)', () => {
    const out = computePfeOutcome(100, [bar(102, 99, 101), bar(110, 104, 108), bar(107, 103, 105)], 'BUY');
    expect(out).not.toBeNull();
    expect(out!.pfe_pct).toBeCloseTo(10, 6);          // (110-100)/100
    expect(out!.outcome_return_pct).toBeCloseTo(5, 6); // last close 105
  });

  it('SELL: pfe tracks the lowest low (entry-anchored, negative)', () => {
    const out = computePfeOutcome(100, [bar(101, 96, 98), bar(99, 90, 92), bar(95, 93, 94)], 'SELL');
    expect(out!.pfe_pct).toBeCloseTo(-10, 6);          // (90-100)/100 — favorable for a short
    expect(out!.outcome_return_pct).toBeCloseTo(-6, 6); // last close 94
  });

  it('BUY that never exceeds entry → pfe_pct <= 0 (a loss)', () => {
    const out = computePfeOutcome(100, [bar(99, 95, 96), bar(98, 94, 97)], 'BUY');
    expect(out!.pfe_pct).toBeLessThanOrEqual(0);       // highest high 99 < entry
  });

  it('default-deny: invalid entry / empty window / NaN bar → null', () => {
    expect(computePfeOutcome(0, [bar(1, 1, 1)], 'BUY')).toBeNull();
    expect(computePfeOutcome(100, [], 'BUY')).toBeNull();
    expect(computePfeOutcome(100, [bar(NaN, 90, 95)], 'SELL')).toBeNull();
    expect(computePfeOutcome(100, [bar(110, 90, 0)], 'BUY')).toBeNull(); // bad outcome close
  });
});
