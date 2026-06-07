// OPS-PERFSTATS-SQL-PUSHDOWN-W1 CH1 — byte-equivalence oracle gate.
//
// Proves the NEW pure path (aggregateRowsInJs → rollupStats) reconstructs the
// EXACT same PerformanceStats as the frozen oracle computeStats, on the live
// fixture AND hand-crafted edges. This is the gate the CH2 SQL path is held to.
//
// Q1 (architect): gate = deep VALUE equality with recursive canonical key-sort
// (byAsset/byExchange order is non-deterministic in the oracle itself — created_at
// is unix SECONDS, no id tiebreak — so raw JSON.stringify can't be the gate).
// Q2 (architect): recentSignals is EXCLUDED from the deep-compare and gated
// separately — (i) shared-id formatted fields identical, (ii) output IS a valid
// (created_at DESC, id DESC) top-20, (iii) zero outcome_* (PII).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateRowsInJs,
  rollupStats,
  canonicalizeForCompare,
  _computeStatsOracle,
} from '../../src/lib/performance-db.js';
import type { SignalRecord } from '../../src/types.js';

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'audits', 'perfstats-fixture-2026-06-07.json'), 'utf8'),
) as { top20: string[]; rows: SignalRecord[] };

// ── helpers ──
const canonJSON = (o: unknown) => JSON.stringify(canonicalizeForCompare(o));
const omitRecent = (s: Record<string, unknown>) => {
  const { recentSignals, ...rest } = s as { recentSignals: unknown };
  return rest;
};
// the deterministic (created_at DESC, id DESC) top-20 the SQL LIMIT query will use (Q2)
const top20Recent = (rows: SignalRecord[]) =>
  [...rows].sort((a, b) => (b.created_at - a.created_at) || ((b.id ?? 0) - (a.id ?? 0))).slice(0, 20);

function assertDeepEquivalent(label: string, rows: SignalRecord[], top20: Set<string> | null) {
  const oracle = _computeStatsOracle(rows, top20);
  const { groups, period } = aggregateRowsInJs(rows);
  const rolled = rollupStats(groups, period, top20, top20Recent(rows));
  // Q1: everything EXCEPT recentSignals, canonical value-equality
  expect(canonJSON(omitRecent(rolled as unknown as Record<string, unknown>)),
    `${label}: rollup != oracle (ex-recentSignals)`)
    .toBe(canonJSON(omitRecent(oracle as unknown as Record<string, unknown>)));
  return { oracle, rolled };
}

function assertRecentSignalsGate(label: string, rows: SignalRecord[], rolled: { recentSignals: Array<{ id: number; created_at: number }> }, oracle: { recentSignals: Array<{ id: number }> }) {
  const r = rolled.recentSignals;
  // (ii) IS a valid (created_at DESC, id DESC) top-20 of the input
  const expectedIds = top20Recent(rows).map(x => x.id);
  expect(r.map(x => x.id), `${label}: recentSignals not the valid top-20`).toEqual(expectedIds);
  for (let i = 1; i < r.length; i++) {
    const ok = r[i - 1].created_at > r[i].created_at ||
      (r[i - 1].created_at === r[i].created_at && (r[i - 1].id ?? 0) >= (r[i].id ?? 0));
    expect(ok, `${label}: recentSignals not sorted created_at DESC, id DESC at ${i}`).toBe(true);
  }
  // (i) shared-id formatted records byte-identical to the oracle's formatter
  const oracleById = new Map(oracle.recentSignals.map(x => [x.id, x] as const));
  for (const rec of r) {
    const o = oracleById.get(rec.id);
    if (o) expect(canonJSON(rec), `${label}: recentSignals[id=${rec.id}] fields differ`).toBe(canonJSON(o));
  }
  // (iii) PII — no outcome_* / pfe_* / confidence / call leaked into recentSignals
  expect(JSON.stringify(r)).not.toMatch(/outcome_|pfe_|mae_|confidence|"call"|signal_hash|merkle_/);
}

// ── SignalRecord factory for hand-crafted edges ──
let _id = 1;
function mkRow(p: Partial<SignalRecord> & { coin: string; signal: SignalRecord['signal']; timeframe: string }): SignalRecord {
  return {
    id: p.id ?? _id++,
    coin: p.coin, signal: p.signal, timeframe: p.timeframe,
    confidence: p.confidence ?? 75,
    price_at_signal: 100,
    price_after_15m: null, price_after_1h: null, price_after_4h: null, price_after_24h: null,
    return_pct_15m: null, return_pct_1h: null, return_pct_4h: null, return_pct_24h: null,
    outcome_price: null, outcome_return_pct: null,
    pfe_return_pct: p.pfe_return_pct ?? null,
    mae_return_pct: null, pfe_price: null, mae_price: null, pfe_candles: null, return_1candle: null,
    created_at: p.created_at ?? (1_700_000_000 + _id),
    exchange: p.exchange,
  };
}

describe('OPS-PERFSTATS-SQL-PUSHDOWN-W1 CH1 — rollupStats ≡ computeStats (byte-equivalence)', () => {
  it('live fixture (2000 rows, 17 ex × 9 tf × 162 coins, pfe==0 + null-pfe)', () => {
    const top20 = new Set(FIXTURE.top20);
    const { oracle, rolled } = assertDeepEquivalent('live', FIXTURE.rows, top20);
    assertRecentSignalsGate('live', FIXTURE.rows, rolled as never, oracle as never);
    // sanity: the fixture actually exercised the breakdowns
    expect(Object.keys((rolled as { byExchange: object }).byExchange).length).toBeGreaterThan(1);
    expect(Object.keys((rolled as { byTimeframe: object }).byTimeframe).length).toBeGreaterThan(1);
  });

  it('empty', () => { assertDeepEquivalent('empty', [], new Set()); });

  it('HOLD-only coin + BUY/SELL elsewhere (fixed-literal byCallType/byTier emit)', () => {
    const rows = [
      mkRow({ coin: 'ZZZHOLD', signal: 'HOLD', timeframe: '5m' }),
      mkRow({ coin: 'ZZZHOLD', signal: 'HOLD', timeframe: '1h', pfe_return_pct: 0.5 }), // pfe ignored for HOLD
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1.2 }),
      mkRow({ coin: 'SOL', signal: 'SELL', timeframe: '15m', pfe_return_pct: -0.8 }),
    ];
    const { oracle, rolled } = assertDeepEquivalent('hold-only', rows, new Set(['SOL']));
    // HOLD key MUST exist with count>0, evaluated 0, null WR
    expect((rolled as { byCallType: Record<string, { count: number; evaluated: number; pfeWinRate: number | null }> }).byCallType.HOLD)
      .toEqual({ count: 2, evaluated: 0, pfeWinRate: null });
    expect((oracle as { byCallType: Record<string, unknown> }).byCallType.HOLD)
      .toEqual({ count: 2, evaluated: 0, pfeWinRate: null });
  });

  it('pfe==0 BUY and SELL are NOT wins (strict >0 / <0)', () => {
    const rows = [
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 0 }),    // eval, not win
      mkRow({ coin: 'BTC', signal: 'SELL', timeframe: '5m', pfe_return_pct: 0 }),   // eval, not win
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 0.01 }), // win
      mkRow({ coin: 'BTC', signal: 'SELL', timeframe: '5m', pfe_return_pct: -0.01 }), // win
    ];
    assertDeepEquivalent('pfe0', rows, new Set());
  });

  it('null-pfe rows excluded from eval', () => {
    const rows = [
      mkRow({ coin: 'ETH', signal: 'BUY', timeframe: '1h', pfe_return_pct: null }),
      mkRow({ coin: 'ETH', signal: 'BUY', timeframe: '1h', pfe_return_pct: 2.0 }),
      mkRow({ coin: 'ETH', signal: 'SELL', timeframe: '1h', pfe_return_pct: null }),
    ];
    assertDeepEquivalent('null-pfe', rows, new Set());
  });

  it('single exchange + null-exchange coalesces to HL', () => {
    const rows = [
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, exchange: undefined }), // → HL
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, exchange: 'HL' }),       // → HL (merge)
    ];
    const { rolled } = assertDeepEquivalent('null-exchange', rows, new Set());
    expect(Object.keys((rolled as { byExchange: object }).byExchange)).toEqual(['HL']);
  });

  it('multi-tier (BTC=1, top20=2, TradFi=3, meme=4)', () => {
    const rows = [
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, exchange: 'BINANCE' }),
      mkRow({ coin: 'SOL', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, exchange: 'BINANCE' }),  // top20 → 2
      mkRow({ coin: 'TSLA', signal: 'SELL', timeframe: '1h', pfe_return_pct: -1, exchange: 'BINANCE' }), // TradFi → 3
      mkRow({ coin: 'WIF', signal: 'BUY', timeframe: '1h', pfe_return_pct: 0, exchange: 'BYBIT' }),     // meme → 4
    ];
    assertDeepEquivalent('multi-tier', rows, new Set(['SOL']));
  });

  it('aggregateRowsInJs groups carry max_ca/max_id for deterministic ordering (Q1)', () => {
    const rows = [
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, created_at: 100, id: 5 }),
      mkRow({ coin: 'BTC', signal: 'BUY', timeframe: '5m', pfe_return_pct: 1, created_at: 200, id: 9 }),
    ];
    const { groups } = aggregateRowsInJs(rows);
    const g = groups.find(x => x.coin === 'BTC' && x.signal === 'BUY' && x.timeframe === '5m')!;
    expect(g.cnt).toBe(2);
    expect(g.pfe_eval).toBe(2);
    expect(g.pfe_win).toBe(2);
    expect(g.max_ca).toBe(200);
    expect(g.max_id).toBe(9);
  });
});
