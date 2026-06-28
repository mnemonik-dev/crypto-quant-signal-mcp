/**
 * SCAN-DIGEST-MCP-PARITY-W1 CH1 — scan_trade_calls enriched output mode.
 *
 * Option A (architect-ratified 2026-06-28): the scorer ALWAYS computes the
 * canonical per-coin detail (price/indicators/reasoning); the cache holds it on
 * the (coin,exchange,timeframe) cell; `includeReasoning` chooses the OUTPUT
 * projection — bare `toScanCallItem` (default, byte-identical) vs enriched
 * `enrichScanCall`. The rank echo stays output-only via attachRank (composes).
 *
 * Asserts: enriched non-HOLD carries price+factors+reasoning(+window); HOLDs bare;
 * default byte-identical; enriched-then-bare leaves NO stale enrichment (the W1
 * cache-isolation property); {rankBy+includeReasoning} carries BOTH; quota units
 * unchanged; never outcome_* / raw indicators.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExchangeAsset } from '../../src/lib/exchange-universe.js';
import type { RankedAsset } from '../../src/lib/rank-metrics.js';
import type { SignalVerdict, RegimeType } from '../../src/types.js';

vi.mock('../../src/lib/exchange-universe.js', () => ({ getExchangeTopAssetsWithVolume: vi.fn() }));
vi.mock('../../src/lib/rank-metrics.js', () => ({ getRankedUniverse: vi.fn() }));

import { getExchangeTopAssetsWithVolume } from '../../src/lib/exchange-universe.js';
import { getRankedUniverse } from '../../src/lib/rank-metrics.js';
import { scanTradeCalls, _setScanScorerForTest, _clearScanCaches, type ScanScore } from '../../src/lib/trade-call-scanner.js';

const mockTopAssets = vi.mocked(getExchangeTopAssetsWithVolume);
const mockRanked = vi.mocked(getRankedUniverse);

function assets(coins: string[]): ExchangeAsset[] {
  return coins.map((coin, i) => ({ coin, notionalOI_usd: (coins.length - i) * 1e6, volume24h_usd: 1e6 }));
}

/** A scorer that returns the FULL canonical detail (mirrors the live defaultScorer
 *  under Option A). `call` defaults BUY; pass a per-coin spec for HOLDs. */
function detailScorer(spec: Record<string, SignalVerdict> = {}) {
  return async (coin: string, timeframe: string): Promise<ScanScore> => ({
    coin,
    timeframe,
    call: spec[coin] ?? 'BUY',
    confidence: 80,
    regime: 'TRENDING_UP' as RegimeType,
    price: 100,
    reasoning: 'Trending regime, upward bias. Funding mild.',
    indicators: {
      funding_rate: -0.0009,
      funding_state: 'ELEVATED',
      oi_change_pct: 5,
      oi_change_window: '24h',
      trend_persistence: 'HIGH',
      breakout_pending: 'INACTIVE',
    },
  });
}

beforeEach(() => {
  _clearScanCaches();
  _setScanScorerForTest(detailScorer());
  mockTopAssets.mockReset();
  mockRanked.mockReset();
  // NB: relies on the default 60s SCAN_SNAPSHOT_TTL_SEC — the enriched→bare cache-
  // isolation test does both scans within the test run (ms apart), so the 2nd hits
  // the cached detail cell. vitest forks isolate process.env across files.
});

describe('includeReasoning:true — enriched non-HOLD calls', () => {
  it('non-HOLD calls carry price + factors + reasoning + oi_change_window', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC', 'ETH']));
    const r = await scanTradeCalls({ exchange: 'BINANCE', includeReasoning: true });
    expect(r.calls.length).toBe(2);
    for (const c of r.calls) {
      expect(c.price).toBe(100);
      expect((c.factors ?? []).map((f) => f.factor)).toEqual(['trend_persistence', 'funding_state', 'oi_change_pct']);
      expect(c.reasoning).toContain('Trending');
      expect(c.oi_change_window).toBe('24h');
    }
  });

  it('default (omitted) stays BYTE-IDENTICAL — exactly the 6 verdict keys, no enrichment', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC']));
    const r = await scanTradeCalls({ exchange: 'BINANCE' });
    expect(Object.keys(r.calls[0]).sort()).toEqual(['call', 'coin', 'confidence', 'exchange', 'regime', 'timeframe']);
  });

  it('includeReasoning:false is also bare', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC']));
    const r = await scanTradeCalls({ exchange: 'BINANCE', includeReasoning: false });
    expect(r.calls[0]).not.toHaveProperty('factors');
    expect(r.calls[0]).not.toHaveProperty('price');
    expect(r.calls[0]).not.toHaveProperty('reasoning');
  });

  it('HOLDs stay bare even in enriched mode (free + no factors)', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC', 'ETH']));
    _setScanScorerForTest(detailScorer({ ETH: 'HOLD' }));
    const r = await scanTradeCalls({ exchange: 'BINANCE', includeReasoning: true, includeHolds: true, limit: 10 });
    const buy = r.calls.find((c) => c.call === 'BUY')!;
    const hold = r.calls.find((c) => c.call === 'HOLD')!;
    expect(buy).toHaveProperty('factors');
    expect(hold).not.toHaveProperty('factors');
    expect(hold).not.toHaveProperty('price');
    expect(r.eligible_non_hold).toBe(1); // HOLD never counts
  });
});

describe('cache-isolation (W1 property) — enriched then bare leaves no stale enrichment', () => {
  it('enriched scan caches detail; a later bare scan of the SAME coin/tf projects bare', async () => {
    mockTopAssets.mockResolvedValue(assets(['SOL']));
    const e = await scanTradeCalls({ exchange: 'BYBIT', timeframe: '15m', includeReasoning: true });
    expect(e.calls[0].factors!.length).toBeGreaterThan(0);
    expect(e.calls[0].price).toBe(100);
    // bare scan reuses the SAME cached detail cell → enrichment must NOT leak.
    const b = await scanTradeCalls({ exchange: 'BYBIT', timeframe: '15m' });
    expect(b.calls[0]).not.toHaveProperty('factors');
    expect(b.calls[0]).not.toHaveProperty('price');
    expect(b.calls[0]).not.toHaveProperty('reasoning');
    expect(b.calls[0]).not.toHaveProperty('oi_change_window');
    expect(Object.keys(b.calls[0]).sort()).toEqual(['call', 'coin', 'confidence', 'exchange', 'regime', 'timeframe']);
  });
});

describe('composition with rankBy — both echoes coexist on one call', () => {
  it('{rankBy:funding_negative, includeReasoning:true} carries rank_value AND the enrichment', async () => {
    mockRanked.mockResolvedValue([
      { coin: 'SOL', rankBy: 'funding_negative', rank_value: -0.0009, funding_rate: -0.0009, funding_apr: -0.985 },
    ] as RankedAsset[]);
    const r = await scanTradeCalls({ exchange: 'OKX', rankBy: 'funding_negative', includeReasoning: true });
    const sol = r.calls.find((c) => c.coin === 'SOL')!;
    // rank echo
    expect(sol.rank_value).toBe(-0.0009);
    expect(sol.funding_rate).toBe(-0.0009);
    // enrichment
    expect(sol.factors!.length).toBeGreaterThan(0);
    expect(sol.price).toBe(100);
    expect(sol.reasoning).toContain('Trending');
  });
});

describe('billing-integrity + PII', () => {
  it('eligible_non_hold is identical bare vs enriched for the same universe', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC', 'ETH', 'SOL']));
    const bare = await scanTradeCalls({ exchange: 'BINANCE' });
    _clearScanCaches();
    _setScanScorerForTest(detailScorer());
    const enr = await scanTradeCalls({ exchange: 'BINANCE', includeReasoning: true });
    expect(enr.eligible_non_hold).toBe(bare.eligible_non_hold);
    expect(enr.eligible_non_hold).toBe(3);
  });

  it('enriched serialized output never contains outcome_* or raw indicators', async () => {
    mockTopAssets.mockResolvedValue(assets(['BTC', 'ETH']));
    const r = await scanTradeCalls({ exchange: 'BINANCE', includeReasoning: true, includeHolds: true });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/outcome_/);
    expect(json).not.toMatch(/"indicators"\s*:/);
    expect(json).not.toMatch(/"funding_24h_avg"\s*:/);
  });
});
