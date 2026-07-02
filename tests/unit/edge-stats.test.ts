import { describe, it, expect } from 'vitest';
import {
  wilsonInterval,
  benjaminiHochberg,
  bonferroni,
  dwrFromLabels,
  pesaranTimmermann,
} from '../../src/scripts/edge-stats.js';

// Known-answer tests per EDGE-DWR-METRIC-SOT-W1 R6.

describe('wilsonInterval', () => {
  it('226/400 → ≈[0.516, 0.613]', () => {
    const { lo, hi, pHat } = wilsonInterval(226, 400);
    expect(pHat).toBeCloseTo(0.565, 3);
    expect(lo).toBeCloseTo(0.516, 3);
    expect(hi).toBeCloseTo(0.613, 3);
  });

  it('n=0 → [0,1] with NaN pHat', () => {
    const { lo, hi, pHat } = wilsonInterval(0, 0);
    expect(lo).toBe(0);
    expect(hi).toBe(1);
    expect(Number.isNaN(pHat)).toBe(true);
  });
});

describe('benjaminiHochberg', () => {
  it('the 4 smallest survive at q=0.05, m=10 (0.045 rejected)', () => {
    const pvals = [0.001, 0.004, 0.011, 0.02, 0.045, 0.19, 0.28, 0.41, 0.55, 0.9];
    const { rejected, threshold } = benjaminiHochberg(pvals, 0.05);
    expect(rejected).toEqual([true, true, true, true, false, false, false, false, false, false]);
    expect(threshold).toBeCloseTo(0.02, 12); // p(4) is the cut
  });

  it('order-independent: shuffled input rejects the same p-values', () => {
    const shuffled = [0.9, 0.02, 0.55, 0.001, 0.28, 0.045, 0.011, 0.41, 0.004, 0.19];
    const { rejected } = benjaminiHochberg(shuffled, 0.05);
    const survivors = shuffled.filter((_, i) => rejected[i]).sort((a, b) => a - b);
    expect(survivors).toEqual([0.001, 0.004, 0.011, 0.02]);
  });
});

describe('bonferroni', () => {
  it('rejects only p ≤ q/m', () => {
    const pvals = [0.001, 0.004, 0.011, 0.02, 0.045];
    // thr = 0.05/5 = 0.01 → only 0.001 and 0.004 survive
    expect(bonferroni(pvals, 0.05)).toEqual([true, true, false, false, false]);
  });
});

describe('dwrFromLabels', () => {
  it('counts wins/losses/timeouts and excludes timeouts from the denominator', () => {
    const s = dwrFromLabels([1, 1, 1, -1, -1, 0, 0]);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.timeouts).toBe(2);
    expect(s.nDecided).toBe(5);
    expect(s.dwr).toBeCloseTo(0.6, 12);
  });

  it('all-timeout cell → NaN DWR (no decided calls)', () => {
    const s = dwrFromLabels([0, 0, 0]);
    expect(s.nDecided).toBe(0);
    expect(Number.isNaN(s.dwr)).toBe(true);
  });
});

describe('pesaranTimmermann', () => {
  // Constructed skill: 50 BUY / 50 SELL, each 45/50 correct → hit-rate 0.90,
  // P_x = P_y = 0.5 → P* = 0.5, S ≈ 8.0.
  it('constructed-skill sample → z > 2', () => {
    const predicted: number[] = [];
    const actual: number[] = [];
    for (let i = 0; i < 50; i++) {
      predicted.push(1); // BUY
      actual.push(i < 45 ? 1 : -1); // 45 up, 5 down
    }
    for (let i = 0; i < 50; i++) {
      predicted.push(-1); // SELL
      actual.push(i < 45 ? -1 : 1); // 45 down, 5 up
    }
    const r = pesaranTimmermann(predicted, actual);
    expect(r.na).toBeNull();
    expect(r.z).not.toBeNull();
    expect(r.z as number).toBeGreaterThan(2);
    expect(r.pHat).toBeCloseTo(0.9, 12);
    expect(r.p as number).toBeLessThan(0.01);
  });

  // Independent: pred period-2, actual period-4 → hit-rate 0.5 == P* → S = 0.
  it('independent sample → |z| < 1', () => {
    const predicted: number[] = [];
    const actual: number[] = [];
    for (let i = 0; i < 100; i++) {
      predicted.push(i % 2 === 0 ? 1 : -1);
      actual.push(i % 4 === 0 || i % 4 === 1 ? 1 : -1);
    }
    const r = pesaranTimmermann(predicted, actual);
    expect(r.na).toBeNull();
    expect(Math.abs(r.z as number)).toBeLessThan(1);
  });

  it('constant-side (all-BUY) → NA guard, z null', () => {
    const predicted = new Array(60).fill(1); // all BUY
    const actual = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const r = pesaranTimmermann(predicted, actual);
    expect(r.na).toBe('CONSTANT_SIDE');
    expect(r.z).toBeNull();
    expect(r.p).toBeNull();
  });
});
