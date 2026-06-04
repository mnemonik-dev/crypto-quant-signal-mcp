/**
 * EQUITIES-ENGINE-W1 — composite daily-bar verdict.
 *
 * Fuses the portable technical + regime indicators into a BUY/SELL/HOLD call
 * with a confidence and an honest `factors[]` array. v1 uses ONLY technical:*
 * and regime:* families — funding / open-interest / cross-venue / sentiment are
 * perp-specific and deliberately ABSENT (they would be dishonest for equities).
 *
 * computeEquityVerdict is PURE + deterministic (golden-snapshot tested).
 * computeVerdictsForUniverse is the nightly batch (reads bars from postgres).
 */
import type { Pool } from 'pg';
import type { EquityBar } from './equity-bars-provider.js';
import {
  computeEquityIndicators,
  isQuarantined,
  classifyRegime,
  type EquityIndicators,
} from './equity-indicators.js';
import { ENGINE_VERSION } from './equity-constants.js';
import { getActiveUniverse, getRecentBars } from './equity-store.js';

export interface EquityVerdict {
  call: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;   // 0..1, 2dp
  regime: string;
  factors: string[];    // technical:* / regime:* / data:* / quarantine:*
}

/** Minimum sessions for ema50 + adx warmup before a directional call is honest. */
const MIN_SESSIONS = 55;
/** Score magnitude (out of ~7) at/above which a directional call fires. */
const CALL_THRESHOLD = 3;

function hold(regime: string, factor: string): EquityVerdict {
  return { call: 'HOLD', confidence: 0, regime, factors: [factor] };
}

/** Pure composite verdict for a chronological (oldest→newest) bar series. */
export function computeEquityVerdict(bars: EquityBar[]): EquityVerdict {
  if (bars.length < MIN_SESSIONS) return hold('insufficient_data', 'data:insufficient_history');
  if (isQuarantined(bars)) return hold('quarantined', 'quarantine:overnight_gap_gt_18pct');

  const ind = computeEquityIndicators(bars);
  if (!ind || ind.ema20 === null || ind.ema50 === null || ind.rsi14 === null ||
      ind.adx === null || ind.plusDI === null || ind.minusDI === null) {
    return hold('insufficient_data', 'data:indicator_warmup');
  }

  const factors: string[] = [];
  let score = 0;

  // Trend: EMA20 vs EMA50.
  if (ind.ema20 > ind.ema50) { score += 2; factors.push('technical:ema20_above_ema50'); }
  else { score -= 2; factors.push('technical:ema20_below_ema50'); }

  // Price vs EMA20.
  if (ind.lastClose > ind.ema20) { score += 1; factors.push('technical:price_above_ema20'); }
  else { score -= 1; factors.push('technical:price_below_ema20'); }

  // Momentum: RSI.
  if (ind.rsi14 >= 70) { score -= 1; factors.push('technical:rsi_overbought'); }
  else if (ind.rsi14 <= 30) { score += 1; factors.push('technical:rsi_oversold'); }
  else if (ind.rsi14 > 50) { score += 1; factors.push('technical:rsi_bullish'); }
  else { score -= 1; factors.push('technical:rsi_bearish'); }

  // Directional strength: ADX + DI.
  const trending = ind.adx >= 25;
  if (ind.plusDI > ind.minusDI) {
    score += trending ? 2 : 1;
    factors.push(trending ? 'technical:adx_strong_bull' : 'technical:adx_weak_bull');
  } else {
    score -= trending ? 2 : 1;
    factors.push(trending ? 'technical:adx_strong_bear' : 'technical:adx_weak_bear');
  }

  // Structure.
  if (ind.structure === 'HIGHER_HIGHS') { score += 1; factors.push('technical:structure_higher_highs'); }
  else if (ind.structure === 'LOWER_LOWS') { score -= 1; factors.push('technical:structure_lower_lows'); }

  // Regime label + conviction modifiers.
  const regime = classifyRegime(ind);
  factors.push(`regime:${regime}`);
  if (ind.hurst !== null) {
    if (ind.hurst > 0.55) factors.push('regime:trending_persistent');
    else if (ind.hurst < 0.45) factors.push('regime:mean_reverting');
  }
  if (ind.squeeze) factors.push('regime:volatility_squeeze');

  // Map score → call.
  let call: EquityVerdict['call'];
  if (score >= CALL_THRESHOLD) call = 'BUY';
  else if (score <= -CALL_THRESHOLD) call = 'SELL';
  else call = 'HOLD';

  // Confidence: |score|/7, dampened in mean-reverting regimes, boosted when persistent.
  let conf = Math.min(1, Math.abs(score) / 7);
  if (ind.hurst !== null) {
    if (ind.hurst < 0.45) conf *= 0.7;
    else if (ind.hurst > 0.55) conf = Math.min(1, conf * 1.15);
  }
  conf = Math.round(conf * 100) / 100;

  return { call, confidence: conf, regime, factors };
}

/** A verdict row ready to persist into equity_verdicts. */
export interface EquityVerdictRow extends EquityVerdict {
  symbol: string;
  session_date: string;
  engine_version: string;
}

/**
 * Nightly batch: for every active universe symbol, read its recent bars up to
 * `sessionDate` and compute the verdict. Reads only; the caller persists.
 */
export async function computeVerdictsForUniverse(
  pool: Pool,
  sessionDate: string,
  lookback = 260
): Promise<EquityVerdictRow[]> {
  const universe = await getActiveUniverse(pool);
  const rows: EquityVerdictRow[] = [];
  for (const u of universe) {
    const bars = await getRecentBars(pool, u.symbol, sessionDate, lookback);
    if (bars.length === 0) continue;
    const v = computeEquityVerdict(bars);
    rows.push({ symbol: u.symbol, session_date: sessionDate, engine_version: ENGINE_VERSION, ...v });
  }
  return rows;
}

export type { EquityIndicators };
