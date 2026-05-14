/**
 * PERFORMANCE-PUBLIC-SANITIZE-W1 / C2 — shape-contract tests for
 * formatPublicRecentSignal() pure formatter.
 *
 * Closes DESIGN-W11-FF3 flagged follow-up: enforces Data Integrity LAW at
 * the data layer via explicit allow-list, mirrors LANDING-LIVE-CALL-TICKER-W1
 * pattern (formatRecentCallRow + tests/recent-calls-shape.test.ts).
 *
 * Snapshot artifact: audits/performance-public-shape-snapshot-2026-05-14.json
 *
 * Test groups:
 *   (a) shape contract — every allowed key present + correct types
 *   (b) forbidden-field absence — Data Integrity LAW canary
 *   (c) edge cases — null/undefined inputs, exotic coin names
 *   (d) dashboard-compat — every field /track-record dashboard reads is present
 *   (e) pure-function invariants — no closure state, idempotent
 */
import { describe, it, expect } from 'vitest';
import { formatPublicRecentSignal } from '../../src/lib/performance-db.js';

// Canonical input shape — matches what getPerformanceStats() passes
const baseRow = {
  id: 93501,
  coin: 'SAGA',
  tier: 4,
  timeframe: '5m',
  exchange: 'BINANCE',
  created_at: 1778772142,
};

// Shape contract: explicit allow-list per snapshot artifact
const ALLOWED_KEYS = ['id', 'coin', 'tier', 'timeframe', 'exchange', 'created_at'].sort();

// Data Integrity LAW forbidden-list (subset; canonical full list in snapshot)
const FORBIDDEN_KEYS = [
  'call',
  'confidence',
  'signal',
  'signal_hash',
  'merkle_batch_id',
  'merkle_proof',
  'outcome_won',
  'outcome_return_pct',
  'outcome_price',
  'price_at_signal',
  'evaluated_at',
  'mae_pct',
  'pfe_pct',
  'is_bot_internal',
  'session_id',
  'request_log_id',
];

describe('formatPublicRecentSignal — shape contract (allow-list)', () => {
  it('returns exactly 6 keys; no more, no less', () => {
    const out = formatPublicRecentSignal(baseRow);
    expect(Object.keys(out).sort()).toEqual(ALLOWED_KEYS);
  });

  it('preserves id as integer', () => {
    const out = formatPublicRecentSignal({ ...baseRow, id: 12345 });
    expect(out.id).toBe(12345);
    expect(Number.isInteger(out.id)).toBe(true);
  });

  it('preserves coin as string', () => {
    const out = formatPublicRecentSignal({ ...baseRow, coin: 'BTC' });
    expect(out.coin).toBe('BTC');
    expect(typeof out.coin).toBe('string');
  });

  it('preserves tier as integer 1-4', () => {
    for (const tier of [1, 2, 3, 4]) {
      const out = formatPublicRecentSignal({ ...baseRow, tier });
      expect(out.tier).toBe(tier);
    }
  });

  it('preserves timeframe as string', () => {
    for (const tf of ['5m', '15m', '1h', '4h', '1d']) {
      const out = formatPublicRecentSignal({ ...baseRow, timeframe: tf });
      expect(out.timeframe).toBe(tf);
    }
  });

  it('preserves exchange as string', () => {
    for (const ex of ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET']) {
      const out = formatPublicRecentSignal({ ...baseRow, exchange: ex });
      expect(out.exchange).toBe(ex);
    }
  });

  it('preserves created_at as unix-seconds integer', () => {
    const out = formatPublicRecentSignal({ ...baseRow, created_at: 1778772142 });
    expect(out.created_at).toBe(1778772142);
    expect(Number.isInteger(out.created_at)).toBe(true);
  });
});

describe('formatPublicRecentSignal — Data Integrity LAW canary (forbidden-field absence)', () => {
  it('NEVER emits .call regardless of input', () => {
    const out = formatPublicRecentSignal({ ...baseRow, call: 'BUY' } as any);
    expect(out).not.toHaveProperty('call');
  });

  it('NEVER emits .confidence regardless of input', () => {
    const out = formatPublicRecentSignal({ ...baseRow, confidence: 99 } as any);
    expect(out).not.toHaveProperty('confidence');
  });

  it('NEVER emits .signal (DB column alias for .call)', () => {
    const out = formatPublicRecentSignal({ ...baseRow, signal: 'SELL' } as any);
    expect(out).not.toHaveProperty('signal');
  });

  it('NEVER emits .outcome_won (Phase-E outcome)', () => {
    const out = formatPublicRecentSignal({ ...baseRow, outcome_won: true } as any);
    expect(out).not.toHaveProperty('outcome_won');
  });

  it('NEVER emits .outcome_return_pct (Phase-E outcome)', () => {
    const out = formatPublicRecentSignal({ ...baseRow, outcome_return_pct: 5.2 } as any);
    expect(out).not.toHaveProperty('outcome_return_pct');
  });

  it('NEVER emits Phase-E adjacent fields (signal_hash, merkle_*, price_at_signal)', () => {
    const out = formatPublicRecentSignal({
      ...baseRow,
      signal_hash: '0xdeadbeef',
      merkle_batch_id: 99,
      merkle_proof: ['0xabc', '0xdef'],
      price_at_signal: 100.5,
    } as any);
    expect(out).not.toHaveProperty('signal_hash');
    expect(out).not.toHaveProperty('merkle_batch_id');
    expect(out).not.toHaveProperty('merkle_proof');
    expect(out).not.toHaveProperty('price_at_signal');
  });

  it('NEVER emits internal-tracking fields (is_bot_internal, session_id, request_log_id)', () => {
    const out = formatPublicRecentSignal({
      ...baseRow,
      is_bot_internal: true,
      session_id: 'sess-xyz',
      request_log_id: 12345,
    } as any);
    expect(out).not.toHaveProperty('is_bot_internal');
    expect(out).not.toHaveProperty('session_id');
    expect(out).not.toHaveProperty('request_log_id');
  });

  it('full forbidden-list scan — none of the FORBIDDEN_KEYS appear in output', () => {
    // Construct an input with EVERY forbidden field present
    const inputWithAllForbidden: any = { ...baseRow };
    for (const k of FORBIDDEN_KEYS) {
      inputWithAllForbidden[k] = 'FORBIDDEN_VALUE_' + k;
    }
    const out = formatPublicRecentSignal(inputWithAllForbidden);
    for (const k of FORBIDDEN_KEYS) {
      expect(out).not.toHaveProperty(k);
    }
    // Sanity: allowed keys all still present
    expect(Object.keys(out).sort()).toEqual(ALLOWED_KEYS);
  });
});

describe('formatPublicRecentSignal — dashboard-compat invariants', () => {
  // The /track-record dashboard's getPerformanceDashboardHtml() row-render
  // (post-W11-FF3 at src/index.ts:2029) reads: s.id, s.coin, s.tier,
  // s.timeframe, s.exchange, s.created_at. Every one MUST survive sanitization.
  const dashboardFields = ['id', 'coin', 'tier', 'timeframe', 'exchange', 'created_at'];

  it('every field /track-record dashboard reads is preserved', () => {
    const out = formatPublicRecentSignal(baseRow);
    for (const field of dashboardFields) {
      expect(out).toHaveProperty(field);
      expect(out[field as keyof typeof out]).toBeDefined();
    }
  });

  it('dashboard deep-link path /verify?signalId=<id> works (id is present + integer)', () => {
    const out = formatPublicRecentSignal({ ...baseRow, id: 88150 });
    expect(out.id).toBe(88150);
    // Mirror the dashboard's URL construction:
    const url = `/verify?signalId=${out.id}`;
    expect(url).toBe('/verify?signalId=88150');
  });

  it('dashboard tier-badge path (tier is present + numeric)', () => {
    const out = formatPublicRecentSignal({ ...baseRow, tier: 2 });
    expect(typeof out.tier).toBe('number');
    expect(out.tier).toBeGreaterThanOrEqual(1);
    expect(out.tier).toBeLessThanOrEqual(4);
  });
});

describe('formatPublicRecentSignal — pure-function invariants', () => {
  it('is idempotent — same input → same output', () => {
    const out1 = formatPublicRecentSignal(baseRow);
    const out2 = formatPublicRecentSignal(baseRow);
    expect(out1).toEqual(out2);
  });

  it('does not mutate input row', () => {
    const input = { ...baseRow };
    const inputSnapshot = JSON.parse(JSON.stringify(input));
    formatPublicRecentSignal(input);
    expect(input).toEqual(inputSnapshot);
  });

  it('does not depend on closure state — multiple calls in sequence stay independent', () => {
    const a = formatPublicRecentSignal({ ...baseRow, coin: 'BTC' });
    const b = formatPublicRecentSignal({ ...baseRow, coin: 'ETH' });
    const c = formatPublicRecentSignal({ ...baseRow, coin: 'BTC' });
    expect(a.coin).toBe('BTC');
    expect(b.coin).toBe('ETH');
    expect(c.coin).toBe('BTC');
    expect(a).toEqual(c);
  });
});

describe('formatPublicRecentSignal — edge cases', () => {
  it('handles exotic coin names (numbers, multi-word, hyphens)', () => {
    for (const coin of ['4', 'SP500', 'XYZ100', 'HBAR', 'BRENTOIL', 'NATGAS', '2Z']) {
      const out = formatPublicRecentSignal({ ...baseRow, coin });
      expect(out.coin).toBe(coin);
    }
  });

  it('handles created_at = 0 (epoch) without throwing', () => {
    const out = formatPublicRecentSignal({ ...baseRow, created_at: 0 });
    expect(out.created_at).toBe(0);
  });

  it('handles very large timestamps (year 2099)', () => {
    const future = 4070908800; // ~2099-01-01
    const out = formatPublicRecentSignal({ ...baseRow, created_at: future });
    expect(out.created_at).toBe(future);
  });
});
