/**
 * EQUITIES-ENGINE-W1 — daily-bar indicator computation.
 *
 * Reuses the PURE crypto indicator math (src/lib/indicators.ts — OHLCV-only, no
 * venue coupling; C1-inventoried as portable) applied to session-only daily
 * bars. NO synthetic weekend/holiday bars exist (Databento ohlcv-1d is
 * session-only), so consecutive array elements are consecutive sessions.
 *
 * Calendar-aware via TRADFI-W1's market-sessions-constants (single SoT —
 * isUsMarketHoliday). Split handling: adjustment factors are NOT entitled on the
 * usage-based plan (C1 NO-GO), so an unexplained large overnight gap (a likely
 * unadjusted split/spinoff) quarantines the symbol rather than corrupting the
 * windows. Pure: no I/O.
 */
import { emaLast, rsi, adx, hurstExponent, detectSqueeze, detectPriceStructure } from '../indicators.js';
import { isUsMarketHoliday } from '../market-sessions-constants.js';
import type { EquityBar } from './equity-bars-provider.js';
import { GAP_QUARANTINE_PCT, QUARANTINE_REWARM_SESSIONS } from './equity-constants.js';

export interface EquityIndicators {
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  adx: number | null;
  plusDI: number | null;
  minusDI: number | null;
  adxSlope: number | null;
  hurst: number | null;
  squeeze: boolean;
  structure: 'HIGHER_HIGHS' | 'LOWER_LOWS' | 'MIXED';
  lastClose: number;
  sessions: number;
}

/** A YYYY-MM-DD is a real US trading session iff weekday and not a NYSE full-day holiday. */
export function isValidSession(isoDate: string): boolean {
  const d = new Date(isoDate + 'T00:00:00Z');
  const wd = d.getUTCDay();          // 0=Sun … 6=Sat
  return wd >= 1 && wd <= 5 && !isUsMarketHoliday(isoDate);
}

/** Compute the portable technical/regime indicators for a chronological bar series. */
export function computeEquityIndicators(bars: EquityBar[]): EquityIndicators | null {
  if (bars.length < 2) return null;
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const adxRes = adx(highs, lows, closes);
  const ps = detectPriceStructure(highs, lows, closes, volumes);
  return {
    ema20: emaLast(closes, 20),
    ema50: emaLast(closes, 50),
    rsi14: rsi(closes, 14),
    adx: adxRes?.adx ?? null,
    plusDI: adxRes?.plusDI ?? null,
    minusDI: adxRes?.minusDI ?? null,
    adxSlope: adxRes?.adxSlope ?? null,
    hurst: hurstExponent(closes),
    squeeze: detectSqueeze(highs, lows, closes),
    structure: ps.structure,
    lastClose: closes[closes.length - 1],
    sessions: bars.length,
  };
}

/**
 * True if any unexplained overnight gap > GAP_QUARANTINE_PCT occurred within the
 * last QUARANTINE_REWARM_SESSIONS sessions (a likely unadjusted split). Such a
 * symbol is suppressed to HOLD/quarantined until it re-warms with fresh sessions.
 */
export function isQuarantined(bars: EquityBar[]): boolean {
  const n = bars.length;
  const lookback = Math.min(QUARANTINE_REWARM_SESSIONS, n - 1);
  for (let k = 1; k <= lookback; k++) {
    const i = n - k;
    const prevClose = bars[i - 1].close;
    if (prevClose <= 0) continue;
    const gap = Math.abs(bars[i].open - prevClose) / prevClose;
    if (gap > GAP_QUARANTINE_PCT) return true;
  }
  return false;
}

/** Coarse regime label from trend strength + directional balance + compression. */
export function classifyRegime(ind: EquityIndicators): string {
  const trending = ind.adx !== null && ind.adx >= 25;
  const bullish = (ind.plusDI ?? 0) > (ind.minusDI ?? 0);
  if (trending && bullish) return 'trending_up';
  if (trending && !bullish) return 'trending_down';
  if (ind.squeeze) return 'compression';
  return 'ranging';
}
