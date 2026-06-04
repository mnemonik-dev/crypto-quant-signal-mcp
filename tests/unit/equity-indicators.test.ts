/** Unit tests — EQUITIES-ENGINE-W1 C3 indicators + session/quarantine helpers. */
import { describe, it, expect } from 'vitest';
import {
  isValidSession,
  computeEquityIndicators,
  isQuarantined,
  classifyRegime,
  type EquityIndicators,
} from '../../src/lib/equities/equity-indicators.js';
import type { EquityBar } from '../../src/lib/equities/equity-bars-provider.js';

function bar(session_date: string, open: number, close: number): EquityBar {
  return { symbol: 'T', session_date, open, high: Math.max(open, close) * 1.005, low: Math.min(open, close) * 0.995, close, volume: 1_000_000 };
}

describe('isValidSession', () => {
  it('weekdays that are not holidays are valid', () => {
    expect(isValidSession('2026-06-05')).toBe(true);   // Friday
    expect(isValidSession('2026-05-26')).toBe(true);   // Tuesday after Memorial Day
  });
  it('weekends are invalid', () => {
    expect(isValidSession('2026-06-06')).toBe(false);  // Saturday
    expect(isValidSession('2026-06-07')).toBe(false);  // Sunday
  });
  it('NYSE full-day holidays are invalid (TRADFI-W1 calendar SoT)', () => {
    expect(isValidSession('2026-05-25')).toBe(false);  // Memorial Day
    expect(isValidSession('2026-01-19')).toBe(false);  // MLK Day
    expect(isValidSession('2026-12-25')).toBe(false);  // Christmas
  });
});

describe('computeEquityIndicators', () => {
  it('returns null for too-few bars', () => {
    expect(computeEquityIndicators([bar('2024-01-02', 10, 10)])).toBeNull();
  });
  it('computes EMAs over a sufficient series', () => {
    const bars: EquityBar[] = [];
    for (let i = 0; i < 80; i++) bars.push(bar('2024-01-02', 100 + i, 100 + i + 0.5));
    const ind = computeEquityIndicators(bars);
    expect(ind).not.toBeNull();
    expect(ind!.ema20).not.toBeNull();
    expect(ind!.ema50).not.toBeNull();
    expect(ind!.sessions).toBe(80);
  });
});

describe('isQuarantined', () => {
  const flat: EquityBar[] = [];
  for (let i = 0; i < 40; i++) flat.push(bar('2024-01-02', 100, 100));

  it('no large gap → not quarantined', () => {
    expect(isQuarantined(flat)).toBe(false);
  });
  it('a >18% overnight gap within the last 20 sessions → quarantined', () => {
    const b = flat.map((x) => ({ ...x }));
    b[38] = bar('2024-01-02', 125, 126);    // open jumps 25% off prev close 100
    expect(isQuarantined(b)).toBe(true);
  });
  it('a >18% gap older than the re-warm window → released', () => {
    const b = flat.map((x) => ({ ...x }));
    b[5] = bar('2024-01-02', 125, 126);     // 34 sessions before the end (>20) → released
    expect(isQuarantined(b)).toBe(false);
  });
});

describe('classifyRegime', () => {
  const base: EquityIndicators = {
    ema20: 1, ema50: 1, rsi14: 50, adx: 30, plusDI: 30, minusDI: 10, adxSlope: 0,
    hurst: 0.5, squeeze: false, structure: 'MIXED', lastClose: 1, sessions: 80,
  };
  it('strong ADX + bullish DI → trending_up', () => {
    expect(classifyRegime(base)).toBe('trending_up');
  });
  it('strong ADX + bearish DI → trending_down', () => {
    expect(classifyRegime({ ...base, plusDI: 10, minusDI: 30 })).toBe('trending_down');
  });
  it('weak ADX + squeeze → compression', () => {
    expect(classifyRegime({ ...base, adx: 15, squeeze: true })).toBe('compression');
  });
  it('weak ADX, no squeeze → ranging', () => {
    expect(classifyRegime({ ...base, adx: 15 })).toBe('ranging');
  });
});
