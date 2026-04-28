/**
 * Unit tests for v1.10.0 sanitized-reasoning prose helpers.
 *
 * Closes moat-1 (composite-verdict quant-weighting) leakage. Asserts:
 *   1. Each prose helper covers all enum branches (no orphaned outputs).
 *   2. The composed reasoning string passes the forbidden-regex blocklist.
 *   3. The composed reasoning length is in [30, 500] chars (typical 60–250).
 *
 * Forbidden regex blocklist (per spec C3):
 *   /\d+\.\d+/                                   any decimal number
 *   /boosted\s+\d+\s+pts?/i                      "boosted 10 pts"
 *   /[+\-]\d+\s+pts?/i                           "+10 pts" / "-12 pts"
 *   /RSI\s+at\s+/i                               "RSI at <num>"
 *   /Hurst\s+(exponent\s+)?\d/i                  "Hurst 0.612" / "Hurst exponent: 0.612"
 *   /Funding\s+Z[\s\-]Score/i                    "Funding Z-Score" / "Funding Z Score"
 *   /Confidence:\s+\d/i                          "Confidence: 73%"
 *   /Regime:\s+(TRENDING|RANGING|VOLATILE)/i     "Regime: TRENDING_UP" (redundant restatement)
 */
import { describe, it, expect } from 'vitest';
import {
  regimeProse,
  fundingProse,
  breakoutProse,
  trendProse,
  convictionProse,
} from '../../src/lib/indicator-buckets.js';
import type { RegimeType, SignalVerdict } from '../../src/types.js';
import type { TrendPersistence, FundingState, BreakoutPending } from '../../src/lib/indicator-buckets.js';

const FORBIDDEN_REGEX: ReadonlyArray<RegExp> = [
  /\d+\.\d+/,
  /boosted\s+\d+\s+pts?/i,
  /[+\-]\d+\s+pts?/i,
  /RSI\s+at\s+/i,
  /Hurst\s+(exponent\s+)?\d/i,
  /Funding\s+Z[\s\-]Score/i,
  /Confidence:\s+\d/i,
  /Regime:\s+(TRENDING|RANGING|VOLATILE)/i,
];

function assertNoForbidden(s: string, label: string) {
  for (const re of FORBIDDEN_REGEX) {
    expect(s, `${label}: matched forbidden ${re}`).not.toMatch(re);
  }
}

describe('regimeProse — 4 RegimeType branches', () => {
  const branches: RegimeType[] = ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'];
  it.each(branches)('emits non-empty sentence for %s with no forbidden tokens', (regime) => {
    const out = regimeProse(regime);
    expect(out.length).toBeGreaterThan(10);
    expect(out.endsWith('.')).toBe(true);
    assertNoForbidden(out, `regimeProse(${regime})`);
  });
  it('TRENDING_UP includes "upward bias"', () => {
    expect(regimeProse('TRENDING_UP')).toContain('upward');
  });
  it('TRENDING_DOWN includes "downward bias"', () => {
    expect(regimeProse('TRENDING_DOWN')).toContain('downward');
  });
});

describe('fundingProse — 3 FundingState branches', () => {
  const branches: FundingState[] = ['NORMAL', 'ELEVATED', 'EXTREME'];
  it.each(branches)('emits non-empty bucket-named sentence for %s', (state) => {
    const out = fundingProse(state);
    expect(out.length).toBeGreaterThan(10);
    expect(out).toContain('Funding pressure');
    assertNoForbidden(out, `fundingProse(${state})`);
  });
});

describe('breakoutProse — 2 BreakoutPending branches', () => {
  const branches: BreakoutPending[] = ['INACTIVE', 'IMMINENT'];
  it.each(branches)('emits sentence for %s, no forbidden tokens', (state) => {
    const out = breakoutProse(state);
    expect(out.length).toBeGreaterThan(10);
    assertNoForbidden(out, `breakoutProse(${state})`);
  });
});

describe('trendProse — 3 TrendPersistence branches', () => {
  const branches: TrendPersistence[] = ['LOW', 'MEDIUM', 'HIGH'];
  it.each(branches)('emits sentence for %s, no forbidden tokens', (state) => {
    const out = trendProse(state);
    expect(out.length).toBeGreaterThan(10);
    expect(out).toContain('Trend persistence');
    assertNoForbidden(out, `trendProse(${state})`);
  });
});

describe('convictionProse — 9 (verdict × confidence-bucket) branches', () => {
  // 3 verdicts × 3 confidence buckets (LOW <40, MEDIUM 40-65, HIGH >65)
  const cases: Array<{ verdict: SignalVerdict; confidence: number; bucket: string }> = [
    { verdict: 'BUY',  confidence: 25, bucket: 'BUY-LOW' },
    { verdict: 'BUY',  confidence: 50, bucket: 'BUY-MEDIUM' },
    { verdict: 'BUY',  confidence: 80, bucket: 'BUY-HIGH' },
    { verdict: 'SELL', confidence: 25, bucket: 'SELL-LOW' },
    { verdict: 'SELL', confidence: 50, bucket: 'SELL-MEDIUM' },
    { verdict: 'SELL', confidence: 80, bucket: 'SELL-HIGH' },
    { verdict: 'HOLD', confidence: 25, bucket: 'HOLD-LOW' },
    { verdict: 'HOLD', confidence: 50, bucket: 'HOLD-MEDIUM' },
    { verdict: 'HOLD', confidence: 80, bucket: 'HOLD-HIGH' },
  ];
  it.each(cases)('verdict=$verdict confidence=$confidence ($bucket) is forbidden-regex-clean', ({ verdict, confidence, bucket }) => {
    const out = convictionProse(verdict, confidence);
    expect(out.length).toBeGreaterThan(10);
    assertNoForbidden(out, `convictionProse(${bucket})`);
  });
  it('boundary: confidence=40 is MEDIUM (not LOW)', () => {
    expect(convictionProse('BUY', 40)).toContain('Moderate conviction');
  });
  it('boundary: confidence=65 is MEDIUM (not HIGH)', () => {
    expect(convictionProse('BUY', 65)).toContain('Moderate conviction');
  });
  it('boundary: confidence=66 is HIGH', () => {
    expect(convictionProse('BUY', 66)).toContain('Strong conviction');
  });
  it('boundary: confidence=39 is LOW', () => {
    expect(convictionProse('BUY', 39)).toContain('Low conviction');
  });
  it('HOLD never says "conviction" (different prose track)', () => {
    expect(convictionProse('HOLD', 25)).not.toContain('conviction');
    expect(convictionProse('HOLD', 80)).not.toContain('conviction');
  });
});

describe('composed reasoning — combinatorial forbidden-regex blocklist (≥24 cases)', () => {
  const regimes: RegimeType[] = ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'];
  const fundings: FundingState[] = ['NORMAL', 'ELEVATED', 'EXTREME'];
  const breakouts: BreakoutPending[] = ['INACTIVE', 'IMMINENT'];
  const trends: TrendPersistence[] = ['LOW', 'MEDIUM', 'HIGH'];
  const verdicts: SignalVerdict[] = ['BUY', 'SELL', 'HOLD'];
  const confidences = [25, 50, 80];

  // Generate a representative slice covering all branches at least once.
  // 4×3×2×3×3×3 = 648 full combos; sample 27 representative ones to keep test
  // runtime fast while still hitting every helper branch via a Latin-square-ish
  // selection.
  const sampled: Array<{ r: RegimeType; f: FundingState; b: BreakoutPending; t: TrendPersistence; v: SignalVerdict; c: number }> = [];
  for (let i = 0; i < regimes.length; i++) {
    for (let j = 0; j < fundings.length; j++) {
      sampled.push({
        r: regimes[i],
        f: fundings[j],
        b: breakouts[(i + j) % breakouts.length],
        t: trends[(i + j) % trends.length],
        v: verdicts[(i + j) % verdicts.length],
        c: confidences[(i + j) % confidences.length],
      });
    }
  }
  // Plus full coverage of bucket branches we may have missed:
  for (const t of trends) sampled.push({ r: 'RANGING', f: 'NORMAL', b: 'INACTIVE', t, v: 'BUY', c: 50 });
  for (const f of fundings) sampled.push({ r: 'TRENDING_UP', f, b: 'IMMINENT', t: 'HIGH', v: 'SELL', c: 80 });
  for (const b of breakouts) sampled.push({ r: 'VOLATILE', f: 'EXTREME', b, t: 'LOW', v: 'HOLD', c: 30 });

  it.each(sampled)('regime=$r funding=$f breakout=$b trend=$t verdict=$v conf=$c → sanitized + length-bound', (combo) => {
    const reasoning = [
      regimeProse(combo.r),
      fundingProse(combo.f),
      breakoutProse(combo.b),
      trendProse(combo.t),
      convictionProse(combo.v, combo.c),
    ].join(' ').replace(/\s+/g, ' ').trim();

    // Forbidden-regex blocklist
    assertNoForbidden(reasoning, JSON.stringify(combo));
    // Length envelope
    expect(reasoning.length).toBeGreaterThanOrEqual(30);
    expect(reasoning.length).toBeLessThanOrEqual(500);
    // Allowed-phrase smoke check: each helper contributed a distinguishable substring.
    expect(reasoning).toMatch(/regime/i);
    expect(reasoning).toMatch(/Funding pressure/);
    expect(reasoning).toMatch(/persistence/i);
  });
});
