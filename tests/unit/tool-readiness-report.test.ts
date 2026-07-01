/**
 * tests/unit/tool-readiness-report.test.ts — EQUITY-READINESS-REPORT-W1.
 *
 * Pure renderToolReadiness / directionalStatus + loadEquityReadinessInput shape:
 * ACCUMULATING vs READY-FOR-AUDIT tokens, HOLD marker, classifier "no PFE gate"
 * line, single-derivation gate constants, and PFE-WR-only (no
 * outcome_return_pct / Phase-E leakage into the rendered card).
 */
import { describe, it, expect } from 'vitest';
import {
  renderToolReadiness,
  directionalStatus,
  loadEquityReadinessInput,
  EQUITY_N_THRESHOLD,
  EQUITY_S_THRESHOLD,
  EQUITY_PUBLIC_COPY_HOLD,
  type ToolReadinessInput,
} from '../../src/scripts/tool-readiness-report.js';

function readyInput(overrides: Partial<ToolReadinessInput> = {}): ToolReadinessInput {
  return {
    assetClassLabel: 'Equities',
    nextStep: 'EQUITY-CALIBRATION-AUDIT-W1 → Mr.1 public-copy flip',
    holdInForce: true,
    directional: {
      tool: 'get_equity_call',
      n: 4799,
      s: 14,
      wr: 0.882,
      miss7d: 0,
      nTarget: EQUITY_N_THRESHOLD,
      sTarget: EQUITY_S_THRESHOLD,
      buckets: [
        { bucket: '1-50', wr: 0.902, matured: 439 },
        { bucket: '51-100', wr: 0.887, matured: 495 },
        { bucket: '101-500', wr: 0.88, matured: 3773 },
        { bucket: 'etf', wr: 0.848, matured: 92 },
      ],
    },
    classifier: {
      tool: 'get_equity_regime',
      sessions: 14,
      lastSession: '2026-06-30',
      coveragePct: 99.8,
      latestSymbols: 500,
      universeActive: 501,
    },
    ...overrides,
  };
}

describe('directionalStatus (single-derivation gate: n≥150 ∧ s≥3)', () => {
  it('READY-FOR-AUDIT when both thresholds met', () => {
    expect(directionalStatus(4799, 14, 150, 3)).toEqual({ glyph: '✅', label: 'READY-FOR-AUDIT' });
    expect(directionalStatus(150, 3, 150, 3)).toEqual({ glyph: '✅', label: 'READY-FOR-AUDIT' });
  });
  it('ACCUMULATING when n<target OR s<target', () => {
    expect(directionalStatus(149, 14, 150, 3).label).toBe('ACCUMULATING');
    expect(directionalStatus(4799, 2, 150, 3).label).toBe('ACCUMULATING');
    expect(directionalStatus(0, 0, 150, 3).label).toBe('ACCUMULATING');
  });
});

describe('renderToolReadiness (equity card, same visual grammar as venue block)', () => {
  it('renders READY-FOR-AUDIT + HOLD marker + live PFE WR + bucket one-liner', () => {
    const text = renderToolReadiness(readyInput());
    expect(text).toContain('🛠 *Tool Promotion Readiness — Equities*');
    expect(text).toContain('Next: EQUITY-CALIBRATION-AUDIT-W1 → Mr.1 public-copy flip');
    expect(text).toContain('✅ get_equity_call — READY-FOR-AUDIT');
    expect(text).toContain('sample 4799/150');
    expect(text).toContain('sessions 14/3');
    expect(text).toContain('PFE WR 88.2%');
    expect(text).toContain('🔒 HOLD — pending Mr.1 flip');
    // per-rank-bucket one-liner
    expect(text).toContain('1-50 90.2%(439)');
    expect(text).toContain('101-500 88.0%(3773)');
    expect(text).toContain('etf 84.8%(92)');
    expect(text).toContain('out-of-universe(7d) 0');
    // gate semantics: AUDIT, not auto-promote; no venue 0.80 auto-gate
    expect(text).toContain('calibration AUDIT (not auto-promote)');
    expect(text).toContain('not an auto-gate here');
  });

  it('renders the classifier line with an explicit "no PFE gate" label and NO fabricated WR', () => {
    const text = renderToolReadiness(readyInput());
    expect(text).toContain('🧭 get_equity_regime — classifier · no PFE gate');
    expect(text).toContain('14 sessions, last 2026-06-30');
    expect(text).toContain('regime coverage 99.8% (500/501 universe)');
    // the classifier line must not carry a PFE win-rate token
    const regimeLine = text.split('\n').find((l) => l.includes('get_equity_regime'))!;
    expect(regimeLine).not.toMatch(/PFE WR/);
  });

  it('renders ⏳ ACCUMULATING while the sample is below the gate', () => {
    const text = renderToolReadiness(
      readyInput({ directional: { ...readyInput().directional, n: 42, s: 1, wr: 0.7 } }),
    );
    expect(text).toContain('⏳ get_equity_call — ACCUMULATING');
    expect(text).toContain('sample 42/150');
  });

  it('omits the HOLD marker when the public-copy HOLD is lifted', () => {
    const text = renderToolReadiness(readyInput({ holdInForce: false }));
    expect(text).not.toContain('🔒 HOLD');
  });

  it('never leaks outcome_return_pct / Phase-E / outcome_price into the card', () => {
    const text = renderToolReadiness(readyInput());
    expect(text).not.toMatch(/outcome_return_pct|outcome_price|phase_e|phaseE/i);
  });

  it('reflects the shipped HOLD constant (equities INTERNAL until Mr.1 flips)', () => {
    expect(EQUITY_PUBLIC_COPY_HOLD).toBe(true);
  });
});

describe('loadEquityReadinessInput (shape from the verbatim latch queries)', () => {
  it('derives wr = wins/n, orders buckets canonically, computes coverage %', async () => {
    const fakeQuery = (async (sql: string) => {
      if (sql.includes('FROM equity_verdicts WHERE call'))
        return [{ n: '4799', s: '14', wins: '4234', miss7d: '0' }];
      if (sql.includes('equity_pfe_by_rank_bucket'))
        return [
          // deliberately out of display order to prove canonical re-ordering
          { bucket: 'etf', matured_calls: '92', pfe_win_rate: '0.848' },
          { bucket: '101-500', matured_calls: '3773', pfe_win_rate: '0.8802' },
          { bucket: '1-50', matured_calls: '439', pfe_win_rate: '0.9021' },
          { bucket: '51-100', matured_calls: '495', pfe_win_rate: '0.8869' },
        ];
      if (sql.includes('universe_active'))
        return [
          { sessions: '14', last_session: '2026-06-30', latest_symbols: '500', universe_active: '501' },
        ];
      return [];
    }) as <T>(sql: string, params?: unknown[]) => Promise<T[]>;

    const input = await loadEquityReadinessInput(fakeQuery);
    expect(input.directional.n).toBe(4799);
    expect(input.directional.s).toBe(14);
    expect(input.directional.wr).toBeCloseTo(4234 / 4799, 6);
    expect(input.directional.buckets.map((b) => b.bucket)).toEqual([
      '1-50',
      '51-100',
      '101-500',
      'etf',
    ]);
    expect(input.classifier?.coveragePct).toBeCloseTo((100 * 500) / 501, 6);
    expect(input.classifier?.lastSession).toBe('2026-06-30');
    expect(input.holdInForce).toBe(EQUITY_PUBLIC_COPY_HOLD);
    // the rendered card from live-shaped input still leaks nothing
    expect(renderToolReadiness(input)).not.toMatch(/outcome_return_pct|outcome_price/i);
  });
});
