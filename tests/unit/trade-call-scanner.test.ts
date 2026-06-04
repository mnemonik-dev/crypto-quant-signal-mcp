/**
 * SCAN-TRADE-CALLS-W1 C2 — trade-call scanner module.
 *
 * Covers: ranking/clamps/minConfidence/includeHolds, per-coin coalescing
 * (2 concurrent → 1 score/coin), snapshot slice-vs-top-up, deadline→partial,
 * cell isolation, stale-universe-on-error, and the allow-list formatter's
 * forbidden-keys guarantee on a serialized result.
 *
 * The live universe fetch (`getExchangeTopAssetsWithVolume`) is module-mocked;
 * the scorer is injected via `_setScanScorerForTest`. No live API is hit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExchangeAsset } from '../../src/lib/exchange-universe.js';
import type { SignalVerdict, RegimeType } from '../../src/types.js';

vi.mock('../../src/lib/exchange-universe.js', () => ({
  getExchangeTopAssetsWithVolume: vi.fn(),
}));

import { getExchangeTopAssetsWithVolume } from '../../src/lib/exchange-universe.js';
import {
  scanTradeCalls,
  getTopCoinSet,
  toScanCallItem,
  _setScanScorerForTest,
  _clearScanCaches,
  _expireUniverseFresh,
  type ScanScore,
  type ScanTradeCallsResult,
} from '../../src/lib/trade-call-scanner.js';

const mockUniverse = vi.mocked(getExchangeTopAssetsWithVolume);

function makeAssets(n: number): ExchangeAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    coin: `COIN${i}`,
    notionalOI_usd: (n - i) * 1_000_000, // OI-desc order
    volume24h_usd: (n - i) * 500_000,
  }));
}

type Verdict = { call: SignalVerdict; confidence: number; regime?: RegimeType };
/** Scorer driven by a per-coin spec; unlisted coins are HOLD at a low confidence. */
function specScorer(spec: Record<string, Verdict>) {
  return async (coin: string, timeframe: string): Promise<ScanScore> => {
    const v = spec[coin] ?? { call: 'HOLD' as const, confidence: 5 };
    return { coin, timeframe, call: v.call, confidence: v.confidence, regime: v.regime ?? 'RANGING' };
  };
}

beforeEach(() => {
  _clearScanCaches();
  _setScanScorerForTest(null);
  mockUniverse.mockReset();
  delete process.env.SCAN_DEADLINE_MS;
  delete process.env.SCAN_SNAPSHOT_TTL_SEC;
  delete process.env.SCAN_CONCURRENCY;
  delete process.env.SCAN_UNIVERSE_TTL_SEC;
});

describe('scanTradeCalls — ranking, counts, clamps', () => {
  // 3 BUY + 2 SELL + 95 HOLD (mirrors the C3 quota fixture).
  const SPEC: Record<string, Verdict> = {
    COIN0: { call: 'BUY', confidence: 90 },
    COIN1: { call: 'BUY', confidence: 80 },
    COIN2: { call: 'BUY', confidence: 70 },
    COIN3: { call: 'SELL', confidence: 60 },
    COIN4: { call: 'SELL', confidence: 50 },
  };

  beforeEach(() => {
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    _setScanScorerForTest(specScorer(SPEC));
  });

  it('returns non-HOLD calls sorted by confidence desc, clamped to limit', async () => {
    const r = await scanTradeCalls({ topN: 100, timeframe: '15m', exchange: 'BINANCE', limit: 10 });
    expect(r.scanned).toBe(100);
    expect(r.holds).toBe(95);
    expect(r.errors).toBe(0);
    expect(r.partial).toBe(false);
    expect(r.calls.map((c) => c.coin)).toEqual(['COIN0', 'COIN1', 'COIN2', 'COIN3', 'COIN4']);
    expect(r.calls.map((c) => c.confidence)).toEqual([90, 80, 70, 60, 50]);
    expect(r.calls.every((c) => c.call !== 'HOLD')).toBe(true);
    expect(r.eligible_non_hold).toBe(5);
  });

  it('limit clamps the returned set', async () => {
    const r = await scanTradeCalls({ topN: 100, timeframe: '15m', exchange: 'BINANCE', limit: 3 });
    expect(r.calls).toHaveLength(3);
    expect(r.calls.map((c) => c.coin)).toEqual(['COIN0', 'COIN1', 'COIN2']);
    expect(r.eligible_non_hold).toBe(3);
  });

  it('minConfidence filters non-HOLD only', async () => {
    const r = await scanTradeCalls({ topN: 100, timeframe: '15m', exchange: 'BINANCE', minConfidence: 75, limit: 10 });
    expect(r.calls.map((c) => c.coin)).toEqual(['COIN0', 'COIN1']);
    expect(r.eligible_non_hold).toBe(2);
  });

  it('includeHolds appends HOLDs after non-HOLD, without inflating eligible_non_hold', async () => {
    const r = await scanTradeCalls({ topN: 100, timeframe: '15m', exchange: 'BINANCE', includeHolds: true, limit: 10 });
    expect(r.calls).toHaveLength(10);
    // First 5 are the non-HOLD calls; the remainder are HOLDs.
    expect(r.calls.slice(0, 5).every((c) => c.call !== 'HOLD')).toBe(true);
    expect(r.calls.slice(5).every((c) => c.call === 'HOLD')).toBe(true);
    expect(r.eligible_non_hold).toBe(5); // HOLDs never count toward the quota driver
  });

  it('clamps an out-of-range topN to <=100', async () => {
    const r = await scanTradeCalls({ topN: 9999, timeframe: '15m', exchange: 'BINANCE', limit: 10 });
    expect(r.scanned).toBe(100); // topN clamped to 100
  });
});

describe('per-coin coalescing', () => {
  it('two concurrent identical scans score each coin exactly once', async () => {
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    let scorerCalls = 0;
    _setScanScorerForTest(async (coin, timeframe) => {
      scorerCalls++;
      // tiny async gap so both scans overlap in the fan-out window
      await new Promise((r) => setTimeout(r, 5));
      return { coin, timeframe, call: 'HOLD' as const, confidence: 10, regime: 'RANGING' as const };
    });
    const [a, b] = await Promise.all([
      scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE' }),
      scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE' }),
    ]);
    expect(a.scanned).toBe(5);
    expect(b.scanned).toBe(5);
    expect(scorerCalls).toBe(5); // 5 coins scored once, not 10
  });
});

describe('snapshot slice-vs-top-up', () => {
  it('smaller topN slices the snapshot; larger topN tops up only missing coins', async () => {
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    let scorerCalls = 0;
    _setScanScorerForTest(async (coin, timeframe) => {
      scorerCalls++;
      return { coin, timeframe, call: 'HOLD' as const, confidence: 10, regime: 'RANGING' as const };
    });

    await scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE' });
    expect(scorerCalls).toBe(5); // COIN0..4 freshly scored

    await scanTradeCalls({ topN: 3, timeframe: '15m', exchange: 'BINANCE' });
    expect(scorerCalls).toBe(5); // COIN0..2 served from snapshot — no new scores

    await scanTradeCalls({ topN: 8, timeframe: '15m', exchange: 'BINANCE' });
    expect(scorerCalls).toBe(8); // only COIN5,6,7 topped up
  });
});

describe('deadline → partial', () => {
  it('returns accumulated cells with partial:true when the deadline elapses', async () => {
    process.env.SCAN_DEADLINE_MS = '30';
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    _setScanScorerForTest(async (coin, timeframe) => {
      await new Promise((r) => setTimeout(r, 120)); // slower than the 30ms deadline
      return { coin, timeframe, call: 'BUY' as const, confidence: 50, regime: 'RANGING' as const };
    });
    const r = await scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE' });
    expect(r.partial).toBe(true);
    expect(r.calls.length).toBeLessThan(5);
  });
});

describe('cell isolation', () => {
  it('a per-coin scorer throw is skipped + tallied, not propagated', async () => {
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    _setScanScorerForTest(async (coin, timeframe) => {
      if (coin === 'COIN2') throw new Error('insufficient candles');
      return { coin, timeframe, call: 'BUY' as const, confidence: 50, regime: 'RANGING' as const };
    });
    const r = await scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE', limit: 10 });
    expect(r.errors).toBe(1);
    expect(r.scanned).toBe(5);
    expect(r.calls.map((c) => c.coin)).not.toContain('COIN2');
    expect(r.calls).toHaveLength(4);
  });
});

describe('getTopCoinSet — stale-universe-on-error', () => {
  it('serves the last-known-good set when a refetch throws', async () => {
    mockUniverse
      .mockResolvedValueOnce(makeAssets(3))
      .mockRejectedValue(new Error('universe down'));

    const first = await getTopCoinSet('BINANCE', 3);
    expect(first).toEqual(['COIN0', 'COIN1', 'COIN2']);

    _expireUniverseFresh(); // force a refetch on the next call
    const second = await getTopCoinSet('BINANCE', 3);
    expect(second).toEqual(['COIN0', 'COIN1', 'COIN2']); // stale served
    expect(mockUniverse).toHaveBeenCalledTimes(2);
  });

  it('propagates the error when there is no prior good set', async () => {
    mockUniverse.mockRejectedValue(new Error('universe down'));
    await expect(getTopCoinSet('OKX', 10)).rejects.toThrow('universe down');
  });
});

describe('allow-list formatter — forbidden keys', () => {
  it('toScanCallItem emits exactly the allow-listed keys', () => {
    const item = toScanCallItem(
      { coin: 'BTC', timeframe: '15m', call: 'BUY', confidence: 77, regime: 'TRENDING_UP' },
      'BINANCE',
    );
    expect(Object.keys(item).sort()).toEqual(['call', 'coin', 'confidence', 'exchange', 'regime', 'timeframe']);
  });

  it('a serialized result has zero forbidden-key hits', async () => {
    mockUniverse.mockImplementation((_ex, n: number) => Promise.resolve(makeAssets(n)));
    _setScanScorerForTest(async (coin, timeframe) => ({
      coin,
      timeframe,
      call: 'BUY' as const,
      confidence: 60,
      regime: 'RANGING' as const,
    }));
    const r: ScanTradeCallsResult = await scanTradeCalls({ topN: 5, timeframe: '15m', exchange: 'BINANCE', includeHolds: true, limit: 100 });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/"(outcome_return_pct|outcome_price|price_at_signal)"\s*:/);
    expect(json).not.toMatch(/"(reasoning|indicators|price)"\s*:/);
  });
});
