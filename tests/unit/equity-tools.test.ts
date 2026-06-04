/** Unit tests — EQUITIES-ENGINE-W1 C4 tool formatters, PFE aggregates, PII guard. */
import { describe, it, expect } from 'vitest';
import {
  formatEquityCall,
  formatEquityRegime,
  nearestByPrefix,
  type EquityCallOutput,
} from '../../src/lib/equities/equity-tool-formatters.js';
import { getEquityPerformance } from '../../src/lib/equities/equity-performance.js';
import type { PublicVerdictRow } from '../../src/lib/equities/equity-store.js';

const ROW: PublicVerdictRow = {
  symbol: 'AAPL', session_date: '2026-06-03', call: 'BUY', confidence: 0.57,
  regime: 'trending_up', factors: ['technical:ema20_above_ema50', 'regime:trending_up'],
  engine_version: 'equities-v1', pfe_horizon_sessions: 5,
};

/** The Data Integrity PII guard (extended to equity routes). */
const PII_RE = /"(outcome_return_pct|outcome_price)"\s*:\s*[-\d.]/;

describe('formatEquityCall (allow-list)', () => {
  it('emits exactly the public keys, no more', () => {
    const out = formatEquityCall(ROW, 12);
    expect(Object.keys(out).sort()).toEqual(
      ['_algovault', 'as_of_session', 'call', 'confidence', 'factors', 'regime', 'symbol', 'universe_rank'].sort()
    );
    expect(out.as_of_session).toBe('2026-06-03');
    expect(out.universe_rank).toBe(12);
    expect(out._algovault.tool).toBe('get_equity_call');
  });
  it('never leaks outcome fields even if present on the source object', () => {
    const dirty = { ...ROW, outcome_return_pct: 4.2, outcome_price: 999 } as PublicVerdictRow & Record<string, unknown>;
    const out = formatEquityCall(dirty, 1);
    expect(JSON.stringify(out)).not.toMatch(PII_RE);
    expect('outcome_return_pct' in out).toBe(false);
  });
});

describe('formatEquityRegime (allow-list)', () => {
  it('emits exactly the public keys', () => {
    const out = formatEquityRegime(ROW);
    expect(Object.keys(out).sort()).toEqual(['_algovault', 'as_of_session', 'confidence', 'regime', 'symbol'].sort());
    expect(JSON.stringify(out)).not.toMatch(PII_RE);
  });
});

describe('PII guard — positive-assertion canary', () => {
  it('the regex DOES catch a real leak (proves the guard works)', () => {
    expect('{"outcome_return_pct": 4.2}').toMatch(PII_RE);
    expect('{"outcome_price":-1.0}').toMatch(PII_RE);
  });
  it('does not false-positive on the forbidden-key NAME in prose', () => {
    expect('"forbidden_keys":["outcome_return_pct","outcome_price"]').not.toMatch(PII_RE);
  });
});

describe('nearestByPrefix', () => {
  it('ranks by shared prefix length then alpha', () => {
    const u = ['AAPL', 'AMZN', 'AMD', 'GOOGL', 'AABB'];
    // 'AAP': AAPL shares 3, AABB shares 2, AMD/AMZN share 1 (alpha → AMD).
    expect(nearestByPrefix('AAP', u, 3)).toEqual(['AAPL', 'AABB', 'AMD']);
  });
  it('caps at n', () => {
    expect(nearestByPrefix('A', ['A1', 'A2', 'A3', 'A4'], 2)).toHaveLength(2);
  });
});

describe('getEquityPerformance (PFE-only aggregate)', () => {
  const fakePool = (statsRows: unknown[], asof: string | null) =>
    ({ query: async (sql: string) => (/GROUP BY/.test(sql) ? { rows: statsRows } : { rows: [{ d: asof }] }) }) as never;

  it('graceful empty-state before any data', async () => {
    const p = await getEquityPerformance(fakePool([], null));
    expect(p.state).toBe('pre_data');
    expect(p.overall).toEqual({ totalCalls: 0, totalEvaluated: 0, pfeWinRate: null });
    expect(p.pfeHorizonSessions).toBe(5);
    expect(JSON.stringify(p)).not.toMatch(PII_RE);
  });

  it('computes overall + per-call PFE win rate when evaluated', async () => {
    const rows = [
      { call: 'BUY', total: 10, evaluated: 6, wins: 4 },
      { call: 'SELL', total: 8, evaluated: 5, wins: 3 },
    ];
    const p = await getEquityPerformance(fakePool(rows, '2026-06-03'));
    expect(p.state).toBe('live');
    expect(p.overall.totalCalls).toBe(18);
    expect(p.overall.totalEvaluated).toBe(11);
    expect(p.overall.pfeWinRate).toBeCloseTo(7 / 11, 6);
    expect(p.byCallType.BUY.pfeWinRate).toBeCloseTo(4 / 6, 6);
    expect(p.asOfSession).toBe('2026-06-03');
  });
});
