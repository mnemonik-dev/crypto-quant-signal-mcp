/**
 * SCAN-RANKBY-W2 CH1 — pure ATRP (computeATRP).
 */
import { describe, it, expect } from 'vitest';
import { computeATRP, ATR_PERIOD } from '../../src/lib/rank-atr.js';
import type { Candle } from '../../src/types.js';

/**
 * n candles with a CONSTANT bar (high=price+d, low=price−d, close=price), so every
 * True Range = max(2d, d, d) = 2d, ATR = 2d, and ATRP = 2d/price×100 = `atrpTarget`.
 */
function flatCandles(atrpTarget: number, price: number, n = 20): Candle[] {
  const d = (atrpTarget * price) / 200;
  return Array.from({ length: n }, (_, i) => ({
    open: price,
    high: price + d,
    low: price - d,
    close: price,
    volume: 1,
    time: i,
  }));
}

describe('computeATRP', () => {
  it('flat constant-range candles → exact ATRP (2d/price×100)', () => {
    expect(computeATRP(flatCandles(2, 100))).toBeCloseTo(2, 9);
    expect(computeATRP(flatCandles(0.5, 100))).toBeCloseTo(0.5, 9);
  });

  it('ATRP, NOT raw ATR — same relative range at 100× price → identical ATRP', () => {
    const cheap = computeATRP(flatCandles(3, 1)); // price $1, raw ATR ≈ 0.03
    const dear = computeATRP(flatCandles(3, 60000)); // price $60k, raw ATR ≈ 1800
    expect(cheap).toBeCloseTo(3, 6);
    expect(dear).toBeCloseTo(3, 6);
    expect(cheap).toBeCloseTo(dear!, 6); // price-normalized: raw ATR would differ 60000×
  });

  it('exactly ATR_PERIOD+1 candles is the minimum that computes', () => {
    expect(computeATRP(flatCandles(2, 100, ATR_PERIOD + 1))).toBeCloseTo(2, 9);
  });

  it('fewer than ATR_PERIOD+1 candles → null', () => {
    expect(computeATRP(flatCandles(2, 100, ATR_PERIOD))).toBeNull();
    expect(computeATRP([])).toBeNull();
  });

  it('non-finite OHLC → null (never guess)', () => {
    const bad = flatCandles(2, 100);
    bad[5].high = NaN;
    expect(computeATRP(bad)).toBeNull();
  });

  it('non-positive last close → null', () => {
    const c = flatCandles(2, 100);
    c[c.length - 1].close = 0;
    expect(computeATRP(c)).toBeNull();
  });

  it('Wilder smoothing: a single late TR spike is damped, not averaged raw', () => {
    // 20 flat bars (TR=2, ATRP base 2) then widen the last bar's range.
    const c = flatCandles(2, 100, 20);
    c[19] = { ...c[19], high: 100 + 20, low: 100 - 20 }; // TR jumps to 40 on the last bar
    const atrp = computeATRP(c)!;
    // Wilder: atr_new = (atr_prev*13 + 40)/14 from a base ~2 → ~4.7%, far below the raw 40.
    expect(atrp).toBeGreaterThan(2);
    expect(atrp).toBeLessThan(10);
  });
});
