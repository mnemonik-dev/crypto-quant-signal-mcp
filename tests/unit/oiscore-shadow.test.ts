/**
 * SCAN-RANKBY-REFINEMENTS-W1 CH4 — oiscore-shadow store + OISCORE_SOURCE flag.
 *
 * dbQuery mocked (PG $N contract; SQLite-deferred). Asserts: idempotent ensure +
 * insert contract; the FIRE-AND-FORGET guarantee (a dbQuery throw is swallowed and
 * NEVER propagates → the live verdict can never be affected); the read-only divergence
 * summary (NO WR — that is the FLIP wave); and the default-deny OISCORE_SOURCE flag.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock('../../src/lib/performance-db.js', () => ({ dbQuery }));

import {
  recordOiScoreShadow,
  summarizeOiScoreShadow,
  _resetOiScoreShadowEnsure,
} from '../../src/lib/oiscore-shadow.js';
import { getOiScoreSource } from '../../src/lib/oiscore-source-flag.js';

const NOW = 1_800_000_000_000;

describe('recordOiScoreShadow (SQL/param contract + fire-and-forget)', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    dbQuery.mockResolvedValue([]);
    _resetOiScoreShadowEnsure();
  });

  it('ensures the table+index once, then inserts the shadow row (10 params)', async () => {
    const ok = await recordOiScoreShadow({
      coin: 'btc',
      exchange: 'OKX',
      timeframe: '15m',
      oiScorePrice: 60,
      oiScoreOi: -20,
      callPrice: 'BUY',
      callOi: 'HOLD',
      confPrice: 78,
      confOi: 41,
      ts: NOW,
    });
    expect(ok).toBe(true);
    expect(dbQuery.mock.calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS oiscore_shadow/);
    expect(dbQuery.mock.calls[1][0]).toMatch(/CREATE INDEX IF NOT EXISTS/);
    const [sql, params] = dbQuery.mock.calls[2];
    expect(sql).toMatch(/INSERT INTO oiscore_shadow/);
    expect(params).toEqual([NOW, 'OKX', 'BTC', '15m', 60, -20, 'BUY', 'HOLD', 78, 41]); // symbol upper-cased
  });

  it('FIRE-AND-FORGET: a dbQuery throw is swallowed → resolves false, NEVER rejects', async () => {
    dbQuery.mockRejectedValue(new Error('db down'));
    await expect(
      recordOiScoreShadow({
        coin: 'ETH',
        exchange: 'OKX',
        timeframe: '1h',
        oiScorePrice: 20,
        oiScoreOi: 20,
        callPrice: 'HOLD',
        callOi: 'HOLD',
        confPrice: 10,
        confOi: 10,
      }),
    ).resolves.toBe(false); // resolves (not rejects) ⇒ the live verdict is never affected
  });
});

describe('summarizeOiScoreShadow (read-only divergence harness)', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    _resetOiScoreShadowEnsure();
  });

  it('counts flips + transitions + mean |conf delta| (NO WR — that is the FLIP wave)', async () => {
    dbQuery.mockResolvedValue([
      { call_price: 'BUY', call_oi: 'HOLD', conf_price: 78, conf_oi: 41 }, // flip, |Δ|=37
      { call_price: 'HOLD', call_oi: 'HOLD', conf_price: 10, conf_oi: 12 }, // no flip, |Δ|=2
      { call_price: 'SELL', call_oi: 'BUY', conf_price: 60, conf_oi: 55 }, // flip, |Δ|=5
    ]);
    const s = await summarizeOiScoreShadow(undefined, NOW);
    expect(s.total).toBe(3);
    expect(s.flips).toBe(2);
    expect(s.byTransition).toEqual({ 'BUY→HOLD': 1, 'SELL→BUY': 1 });
    expect(s.meanAbsConfDelta).toBeCloseTo((37 + 2 + 5) / 3, 6);
  });
});

describe('getOiScoreSource (OISCORE_SOURCE firewall — default-deny)', () => {
  const orig = process.env.OISCORE_SOURCE;
  afterEach(() => {
    if (orig === undefined) delete process.env.OISCORE_SOURCE;
    else process.env.OISCORE_SOURCE = orig;
  });
  it("defaults to 'price' when unset (byte-identical live verdict)", () => {
    delete process.env.OISCORE_SOURCE;
    expect(getOiScoreSource()).toBe('price');
  });
  it("'oi' enables the OI source (the FLIP wave sets this)", () => {
    process.env.OISCORE_SOURCE = 'oi';
    expect(getOiScoreSource()).toBe('oi');
  });
  it("any other value default-denies to 'price'", () => {
    process.env.OISCORE_SOURCE = 'OI';
    expect(getOiScoreSource()).toBe('price');
    process.env.OISCORE_SOURCE = 'yes';
    expect(getOiScoreSource()).toBe('price');
  });
});
