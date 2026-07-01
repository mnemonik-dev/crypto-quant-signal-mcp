/**
 * tests/unit/oi-sources.test.ts — SCAN-RANKBY-W3 CH2
 *
 * Per-venue OI sourcing. The load-bearing case: Binance's universe notionalOI_usd
 * is a VOLUME proxy, so fetchCurrentOiUsd must fetch REAL OI per-symbol
 * (openInterestHist sumOpenInterestValue) — NOT the proxy. The other 4 venues read
 * notionalOI_usd directly (it IS real OI). Plus the Bybit history × close join.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { fetchVenueUniverse } = vi.hoisted(() => ({ fetchVenueUniverse: vi.fn() }));
const { upstreamFetch } = vi.hoisted(() => ({ upstreamFetch: vi.fn() }));
const { getAdapter } = vi.hoisted(() => ({ getAdapter: vi.fn() }));

vi.mock('../../src/lib/exchange-universe.js', () => ({
  fetchVenueUniverse,
  // OPS-SCAN-UNIVERSE-EXPAND-W1: fetchCurrentOiUsd now consults OI_PROXY_VENUES to skip volume-proxy
  // venues (Aster/BingX). BINANCE is a proxy too but is exempt via its openInterestHist real-OI path.
  OI_PROXY_VENUES: new Set(['BINANCE', 'ASTER', 'BINGX']),
}));
vi.mock('../../src/lib/adapters/_upstream-fetch.js', () => ({
  upstreamFetch,
  VENUE_FETCH_CONFIGS: { BINANCE: { venueName: 'Binance' }, BYBIT: { venueName: 'Bybit' } },
}));
vi.mock('../../src/lib/exchange-adapter.js', () => ({ getAdapter }));
vi.mock('../../src/lib/performance-db.js', () => ({ dbQuery: vi.fn().mockResolvedValue([]) }));

import { fetchCurrentOiUsd, fetchOiHistoryUsd } from '../../src/lib/oi-sources.js';

beforeEach(() => {
  fetchVenueUniverse.mockReset();
  upstreamFetch.mockReset();
  getAdapter.mockReset();
});

describe('fetchCurrentOiUsd — venue OI sourcing', () => {
  it('BYBIT: reads notionalOI_usd directly (real OI), no per-symbol calls', async () => {
    fetchVenueUniverse.mockResolvedValue([
      { coin: 'BTC', notionalOI_usd: 5_000_000 },
      { coin: 'SOL', notionalOI_usd: 2_000_000 },
    ]);
    const rows = await fetchCurrentOiUsd('BYBIT', 60);
    expect(rows).toEqual([
      { coin: 'BTC', oi: 5_000_000 },
      { coin: 'SOL', oi: 2_000_000 },
    ]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('BINANCE: ignores the volume proxy, fetches REAL OI per-symbol (sumOpenInterestValue)', async () => {
    fetchVenueUniverse.mockResolvedValue([
      { coin: 'BTC', notionalOI_usd: 9_999_999_999 }, // volume proxy — must NOT be used as OI
      { coin: 'ETH', notionalOI_usd: 8_888_888_888 },
    ]);
    upstreamFetch.mockImplementation(async (_cfg: unknown, req: { url: string }) => {
      if (req.url.includes('BTCUSDT')) return [{ sumOpenInterestValue: '6314880853.08', timestamp: 1782565200000 }];
      if (req.url.includes('ETHUSDT')) return [{ sumOpenInterestValue: '3100000000.00', timestamp: 1782565200000 }];
      return [];
    });
    const rows = await fetchCurrentOiUsd('BINANCE', 60);
    expect(rows).toEqual([
      { coin: 'BTC', oi: 6314880853.08 },
      { coin: 'ETH', oi: 3100000000.0 },
    ]);
    expect(upstreamFetch).toHaveBeenCalledTimes(2);
    expect((upstreamFetch.mock.calls[0][1] as { url: string }).url).toMatch(/openInterestHist\?symbol=BTCUSDT/);
  });

  it('respects poolSize (slices the universe)', async () => {
    fetchVenueUniverse.mockResolvedValue([
      { coin: 'A', notionalOI_usd: 3 },
      { coin: 'B', notionalOI_usd: 2 },
      { coin: 'C', notionalOI_usd: 1 },
    ]);
    const rows = await fetchCurrentOiUsd('OKX', 2);
    expect(rows.map((r) => r.coin)).toEqual(['A', 'B']);
  });
});

describe('fetchOiHistoryUsd — backfill sources', () => {
  it('BINANCE: openInterestHist → USD points directly', async () => {
    upstreamFetch.mockResolvedValue([
      { sumOpenInterestValue: '100', timestamp: 1000 },
      { sumOpenInterestValue: '110', timestamp: 2000 },
    ]);
    const hist = await fetchOiHistoryUsd('BINANCE', 'BTC', 24);
    expect(hist).toEqual([
      { ts: 1000, oi: 100 },
      { ts: 2000, oi: 110 },
    ]);
  });

  it('BYBIT: OI contracts × hourly close → USD', async () => {
    const t0 = 1_800_000_000_000; // hour-aligned
    upstreamFetch.mockResolvedValue({
      result: { list: [{ openInterest: '10', timestamp: String(t0) }] },
    });
    getAdapter.mockReturnValue({
      getCandles: vi.fn().mockResolvedValue([{ time: t0, open: 0, high: 0, low: 0, close: 50, volume: 0 }]),
    });
    const hist = await fetchOiHistoryUsd('BYBIT', 'BTC', 24);
    expect(hist).toEqual([{ ts: t0, oi: 500 }]); // 10 contracts × $50
  });

  it('OKX / BITGET / HL: null (warm forward)', async () => {
    expect(await fetchOiHistoryUsd('OKX', 'BTC', 24)).toBeNull();
    expect(await fetchOiHistoryUsd('BITGET', 'BTC', 24)).toBeNull();
    expect(await fetchOiHistoryUsd('HL', 'BTC', 24)).toBeNull();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
