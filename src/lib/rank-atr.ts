/**
 * SCAN-RANKBY-W2 — pure ATRP (Average True Range Percent) for the `volatility` lens.
 *
 * Leaf module (Candle type only; no I/O, no state) → test-importable per the CLAUDE.md
 * pure-constants rule, like `rank-constants.ts` / `candle-guard.ts`.
 *
 * **ATRP, not raw ATR (LAW):** raw ATR is price-scaled — BTC's ATR dwarfs a sub-$1
 * alt's — so a mixed-price basket must be ranked by ATR ÷ price (relative range),
 * never raw ATR. ATRP = ATR(14) ÷ last close × 100.
 *
 * ATR uses Wilder smoothing (the canonical definition): seed = SMA of the first 14
 * True Ranges, then `ATRᵢ = (ATRᵢ₋₁·(P−1) + TRᵢ) / P`. `TR = max(h−l, |h−c₋₁|, |l−c₋₁|)`.
 */

import type { Candle } from '../types.js';

export const ATR_PERIOD = 14;

/**
 * ATRP for `candles` (MUST be oldest-first — the caller sorts by `time`). Returns
 * `null` when there are fewer than `ATR_PERIOD + 1` candles (ATR(14) needs 14 TRs =
 * 15 closes), any OHLC value is non-finite, or the last close is non-positive — the
 * caller drops a null-ATRP coin from the ranking rather than guessing.
 */
export function computeATRP(candles: Candle[]): number | null {
  if (!Array.isArray(candles) || candles.length < ATR_PERIOD + 1) return null;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevClose = candles[i - 1].close;
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(prevClose)) return null;
    trs.push(Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose)));
  }
  if (trs.length < ATR_PERIOD) return null;

  // Wilder seed: SMA of the first ATR_PERIOD TRs, then recursive smoothing.
  let atr = trs.slice(0, ATR_PERIOD).reduce((sum, tr) => sum + tr, 0) / ATR_PERIOD;
  for (let i = ATR_PERIOD; i < trs.length; i++) {
    atr = (atr * (ATR_PERIOD - 1) + trs[i]) / ATR_PERIOD;
  }

  const lastClose = candles[candles.length - 1].close;
  if (!Number.isFinite(atr) || !Number.isFinite(lastClose) || lastClose <= 0) return null;
  return (atr / lastClose) * 100;
}
