/** Unit tests — EQUITIES-ENGINE-W1 C3 composite verdict (golden fixtures). */
import { describe, it, expect } from 'vitest';
import { computeEquityVerdict } from '../../src/lib/equities/equity-verdict.js';
import type { EquityBar } from '../../src/lib/equities/equity-bars-provider.js';

/**
 * Deterministic bar generator. `closes[i]` is the close; open defaults to the
 * prior close (continuous) unless overridden via `opens`. Dates advance over
 * weekdays only (skips Sat/Sun) so session_dates are realistic; a `skip` set of
 * ISO dates is also stepped over (holiday-week fixture).
 */
function makeBars(closes: number[], startDate = '2024-01-02', opens?: Record<number, number>, skip: Set<string> = new Set()): EquityBar[] {
  const bars: EquityBar[] = [];
  const d = new Date(startDate + 'T00:00:00Z');
  const advance = () => {
    do { d.setUTCDate(d.getUTCDate() + 1); }
    while ([0, 6].includes(d.getUTCDay()) || skip.has(d.toISOString().slice(0, 10)));
  };
  // position d on a valid first day
  while ([0, 6].includes(d.getUTCDay()) || skip.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const open = opens?.[i] ?? (i > 0 ? closes[i - 1] : c);
    bars.push({
      symbol: 'TEST', session_date: d.toISOString().slice(0, 10),
      open, high: Math.max(open, c) * 1.004, low: Math.min(open, c) * 0.996, close: c, volume: 1_000_000 + i * 137,
    });
    if (i < closes.length - 1) advance();
  }
  return bars;
}

const uptrend = Array.from({ length: 80 }, (_, i) => 100 + i * 1.5);
const downtrend = Array.from({ length: 80 }, (_, i) => 220 - i * 1.5);

describe('computeEquityVerdict — directional', () => {
  it('a clean uptrend yields BUY with bullish technical factors', () => {
    const v = computeEquityVerdict(makeBars(uptrend));
    expect(v.call).toBe('BUY');
    expect(v.confidence).toBeGreaterThan(0);
    expect(v.factors).toContain('technical:ema20_above_ema50');
  });
  it('a clean downtrend yields SELL', () => {
    const v = computeEquityVerdict(makeBars(downtrend));
    expect(v.call).toBe('SELL');
    expect(v.factors).toContain('technical:ema20_below_ema50');
  });
});

describe('computeEquityVerdict — guards', () => {
  it('insufficient history → HOLD/insufficient_data', () => {
    const v = computeEquityVerdict(makeBars(uptrend.slice(0, 20)));
    expect(v).toMatchObject({ call: 'HOLD', regime: 'insufficient_data' });
    expect(v.factors).toContain('data:insufficient_history');
  });
  it('a recent >18% split gap → HOLD/quarantined', () => {
    // override the open of the 78th bar to gap +25% off the prior close
    const opens = { 78: uptrend[77] * 1.25 };
    const v = computeEquityVerdict(makeBars(uptrend, '2024-01-02', opens));
    expect(v).toMatchObject({ call: 'HOLD', regime: 'quarantined' });
    expect(v.factors).toContain('quarantine:overnight_gap_gt_18pct');
  });
  it('a split gap older than the re-warm window → NOT quarantined', () => {
    const opens = { 5: uptrend[4] * 1.25 };   // 74 sessions before the end
    const v = computeEquityVerdict(makeBars(uptrend, '2024-01-02', opens));
    expect(v.regime).not.toBe('quarantined');
  });
});

describe('computeEquityVerdict — holiday-week fixture', () => {
  it('computes normally across a session sequence that skips Memorial Day', () => {
    // 2026-05-25 is Memorial Day; makeBars steps over it.
    const bars = makeBars(uptrend, '2026-02-02', undefined, new Set(['2026-05-25']));
    expect(bars.some((b) => b.session_date === '2026-05-25')).toBe(false);
    const v = computeEquityVerdict(bars);
    expect(['BUY', 'SELL', 'HOLD']).toContain(v.call);
    expect(v.regime).not.toBe('insufficient_data');
  });
});

describe('computeEquityVerdict — honesty + golden snapshot', () => {
  it('never emits perp-specific factor families (funding/OI/cross-venue/sentiment)', () => {
    for (const series of [uptrend, downtrend]) {
      const v = computeEquityVerdict(makeBars(series));
      for (const f of v.factors) {
        expect(f).not.toMatch(/funding|open_interest|oi_|cross_venue|sentiment/i);
        expect(f).toMatch(/^(technical|regime|data|quarantine):/);
      }
    }
  });
  it('golden snapshot for a fixed oscillating-uptrend series', () => {
    const closes = Array.from({ length: 90 }, (_, i) => 100 + i * 1.2 + Math.round(Math.sin(i / 3) * 30) / 10);
    const v = computeEquityVerdict(makeBars(closes));
    expect(v).toMatchSnapshot();
  });
});
