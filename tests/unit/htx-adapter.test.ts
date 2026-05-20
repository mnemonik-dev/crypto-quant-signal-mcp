/**
 * PILOT-ADAPTERS-W3A / C3 — HTX adapter unit tests.
 *
 * Mocks `globalThis.fetch`. Asserts:
 *   - Symbol round-trip (toHtxSymbol / fromHtxSymbol) including TRADFI_ALIASES.
 *   - GOLD → XAU alias (HTX has BOTH XAU + XAUT; prefer XAU spot per Gate canonical).
 *   - SPX NOT in alias map (memecoin trap — 4th sighting; HTX SPX-USDT = $0.36).
 *   - Stocks/oil route DIRECT (META/NVDA/MSFT/GOOGL/AAPL/BRENTOIL/USOIL/NATGAS/COPPER).
 *   - getCandles parses HTX row with `id` (unix sec) → time × 1000, sorts oldest-first.
 *   - getAssetContext 3-call fan-out via Promise.all (merged + funding + OI).
 *   - Funding cadence × 1095 annualization (8h, settlement_period=8).
 *   - getCurrentPrice extracts close (last trade) from merged ticker.
 *   - getPredictedFundings + getFundingHistory return [] for shadow venue.
 *   - 429 throws UpstreamRateLimitError with exchange="HTX".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  HTXAdapter,
  toHtxSymbol,
  fromHtxSymbol,
  TRADFI_ALIASES,
} from '../../src/lib/adapters/htx.js';
import { UpstreamRateLimitError } from '../../src/lib/errors.js';

interface MockResponse {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

let mockResponses: Map<string, MockResponse>;
let fetchCalls: { url: string }[];
let originalFetch: typeof fetch;

function setMock(urlSubstring: string, response: MockResponse): void {
  mockResponses.set(urlSubstring, response);
}

function buildFetchMock(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url });
    for (const [substr, resp] of mockResponses.entries()) {
      if (url.includes(substr)) {
        return {
          ok: (resp.status ?? 200) >= 200 && (resp.status ?? 200) < 300,
          status: resp.status ?? 200,
          statusText: resp.statusText ?? 'OK',
          headers: {
            get: (name: string) => resp.headers?.[name.toLowerCase()] ?? resp.headers?.[name] ?? null,
          },
          json: async () => resp.body,
          text: async () => JSON.stringify(resp.body),
        } as unknown as Response;
      }
    }
    throw new Error(`[mock-fetch] unhandled URL: ${url}`);
  }) as typeof fetch;
}

beforeEach(() => {
  mockResponses = new Map();
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = buildFetchMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ── Symbol round-trip + TRADFI_ALIASES ───────────────────────────────────

describe('toHtxSymbol / fromHtxSymbol — HTX-native contract_code mapping', () => {
  it('crypto: BTC ⇄ BTC-USDT (hyphen, mirrors BingX)', () => {
    expect(toHtxSymbol('BTC')).toBe('BTC-USDT');
    expect(fromHtxSymbol('BTC-USDT')).toBe('BTC');
  });

  it('crypto: ETH ⇄ ETH-USDT', () => {
    expect(toHtxSymbol('ETH')).toBe('ETH-USDT');
  });

  it('TradFi metal alias: GOLD ⇄ XAU-USDT (HTX has BOTH XAU + XAUT; prefer XAU spot per Gate canonical)', () => {
    expect(toHtxSymbol('GOLD')).toBe('XAU-USDT');
    expect(fromHtxSymbol('XAU-USDT')).toBe('GOLD');
  });

  it('TradFi metal aliases: SILVER ⇄ XAG-USDT, PLATINUM ⇄ XPT-USDT, PALLADIUM ⇄ XPD-USDT', () => {
    expect(toHtxSymbol('SILVER')).toBe('XAG-USDT');
    expect(toHtxSymbol('PLATINUM')).toBe('XPT-USDT');
    expect(toHtxSymbol('PALLADIUM')).toBe('XPD-USDT');
    expect(fromHtxSymbol('XAG-USDT')).toBe('SILVER');
    expect(fromHtxSymbol('XPT-USDT')).toBe('PLATINUM');
    expect(fromHtxSymbol('XPD-USDT')).toBe('PALLADIUM');
  });

  it('TradFi DIRECT (identity, no alias row): BRENTOIL/USOIL/NATGAS/COPPER + 5 stocks', () => {
    expect(toHtxSymbol('BRENTOIL')).toBe('BRENTOIL-USDT');   // HTX literal canonical name
    expect(toHtxSymbol('USOIL')).toBe('USOIL-USDT');
    expect(toHtxSymbol('NATGAS')).toBe('NATGAS-USDT');
    expect(toHtxSymbol('COPPER')).toBe('COPPER-USDT');
    expect(toHtxSymbol('META')).toBe('META-USDT');
    expect(toHtxSymbol('NVDA')).toBe('NVDA-USDT');
    expect(toHtxSymbol('MSFT')).toBe('MSFT-USDT');
    expect(toHtxSymbol('GOOGL')).toBe('GOOGL-USDT');
    expect(toHtxSymbol('AAPL')).toBe('AAPL-USDT');
  });

  it('SPX intentionally NOT in TRADFI_ALIASES (memecoin trap — 4th sighting; HTX SPX-USDT = $0.36)', () => {
    expect(TRADFI_ALIASES).not.toHaveProperty('SPX');
    expect(TRADFI_ALIASES).not.toHaveProperty('SP500');
    // SPX input → no alias → SPX-USDT (memecoin). HTX does NOT list real S&P 500
    // (only Phemex among W3A venues lists SP500USDT). Caller's choice; semantic-
    // fingerprint probe is the safety net.
    expect(toHtxSymbol('SPX')).toBe('SPX-USDT');
  });

  it('TRADFI_ALIASES has exactly 4 entries (GOLD/SILVER/PLATINUM/PALLADIUM)', () => {
    expect(Object.keys(TRADFI_ALIASES).sort()).toEqual(['GOLD', 'PALLADIUM', 'PLATINUM', 'SILVER']);
  });
});

// ── getCandles ───────────────────────────────────────────────────────────

describe('HTXAdapter.getCandles', () => {
  it('parses HTX row with id (unix sec) → time × 1000, uses amount as base volume', async () => {
    setMock('/linear-swap-ex/market/history/kline', {
      status: 200,
      body: {
        ch: 'market.BTC-USDT.kline.60min', ts: 0, status: 'ok',
        data: [
          // newest-first per HTX convention
          { id: 1779242400, open: 76785.6, close: 76825.0, high: 76924.9, low: 76545.0, amount: 291.068, vol: 291068, trade_turnover: 22336228, count: 7665 },
          { id: 1779238800, open: 76825.1, close: 76685.0, high: 76905.7, low: 76614.5, amount: 184.484, vol: 184484, trade_turnover: 14154850, count: 4749 },
        ],
      },
    });
    const candles = await new HTXAdapter().getCandles('BTC', '1h', 1779000000000);
    expect(candles).toHaveLength(2);
    // Oldest-first sort
    expect(candles[0]).toEqual({
      time: 1779238800000,    // unix-sec × 1000 → ms
      open: 76825.1,
      high: 76905.7,
      low: 76614.5,
      close: 76685.0,
      volume: 184.484,    // amount (base) not vol (contract count)
    });
    expect(candles[1].time).toBe(1779242400000);
  });

  it('filters candles by startTime (sec compare via Math.floor)', async () => {
    setMock('/linear-swap-ex/market/history/kline', {
      status: 200,
      body: {
        ch: '', ts: 0, status: 'ok',
        data: [
          { id: 1779000000, open: 76, close: 76.5, high: 77, low: 75, amount: 1, vol: 1, trade_turnover: 76, count: 1 },   // == startTime sec; included
          { id: 1779003600, open: 76.5, close: 77, high: 77.5, low: 76, amount: 2, vol: 2, trade_turnover: 154, count: 2 },  // > startTime; included
          { id: 1778996400, open: 75, close: 75.5, high: 76, low: 74, amount: 3, vol: 3, trade_turnover: 226, count: 3 },    // < startTime; dropped
        ],
      },
    });
    const candles = await new HTXAdapter().getCandles('BTC', '1h', 1779000000000);
    expect(candles).toHaveLength(2);
    expect(candles.map(c => c.time)).toEqual([1779000000000, 1779003600000]);
  });

  it('passes contract_code, period (HTX format like "60min" not "1h"), size=1000', async () => {
    setMock('/linear-swap-ex/market/history/kline', { status: 200, body: { ch: '', ts: 0, status: 'ok', data: [] } });
    await new HTXAdapter().getCandles('BTC', '1h', 0);
    const call = fetchCalls.find(c => c.url.includes('kline'));
    expect(call?.url).toContain('contract_code=BTC-USDT');
    expect(call?.url).toContain('period=60min');     // HTX-specific "60min" not "1h"
    expect(call?.url).toContain('size=1000');
  });

  it('falls back to nearest available period for unsupported timeframes (3m → 5min, 2h → 60min, 8h → 4hour, 12h → 4hour)', async () => {
    setMock('/linear-swap-ex/market/history/kline', { status: 200, body: { ch: '', ts: 0, status: 'ok', data: [] } });
    const adapter = new HTXAdapter();
    for (const [tf, expected] of [['3m', '5min'], ['2h', '60min'], ['8h', '4hour'], ['12h', '4hour']] as const) {
      fetchCalls = [];
      await adapter.getCandles('BTC', tf, 0);
      const call = fetchCalls.find(c => c.url.includes('kline'));
      expect(call?.url, `tf=${tf}`).toContain(`period=${expected}`);
    }
  });

  it('throws on non-OK envelope (status != "ok")', async () => {
    setMock('/linear-swap-ex/market/history/kline', {
      status: 200,
      body: { ch: '', ts: 0, status: 'error', 'err-code': 'invalid-parameter', data: null },
    });
    await expect(new HTXAdapter().getCandles('BTC', '1h', 0)).rejects.toThrow(/non-OK envelope/);
  });
});

// ── getAssetContext (3-call fan-out: merged + funding + OI) ──────────────

describe('HTXAdapter.getAssetContext', () => {
  it('combines merged ticker (close+open+24h vol) + swap_funding_rate (funding) + swap_open_interest (OI USDT) via Promise.all', async () => {
    setMock('/linear-swap-ex/market/detail/merged', {
      status: 200,
      body: {
        ch: 'market.BTC-USDT.detail.merged', status: 'ok',
        tick: {
          amount: '7572.43', ask: [76666.7, 3508], bid: [76666.6, 2602],
          close: '76666.6', count: 132002, high: '77069.9', id: 1779247221,
          low: '76420.2', open: '76518.1', trade_turnover: '581655887.3476',
          ts: 1779247221803, vol: '7572430',
        },
        ts: 1779247221803,
      },
    });
    setMock('/linear-swap-api/v1/swap_funding_rate', {
      status: 200,
      body: {
        status: 'ok',
        data: {
          estimated_rate: null,
          funding_rate: '0.000100000000000000',
          contract_code: 'BTC-USDT',
          symbol: 'BTC',
          fee_asset: 'USDT',
          funding_time: '1779264000000',
          next_funding_time: null,
          trade_partition: 'USDT',
        },
        ts: 0,
      },
    });
    setMock('/linear-swap-api/v1/swap_open_interest', {
      status: 200,
      body: {
        status: 'ok',
        data: [{
          volume: 34174571, amount: 34174.571, symbol: 'BTC', value: 2620048165.0286,
          contract_code: 'BTC-USDT', trade_amount: 7572.43, trade_volume: 7572430,
          trade_turnover: 581655887.3476, business_type: 'swap', pair: 'BTC-USDT',
          contract_type: 'swap', trade_partition: 'USDT',
        }],
        ts: 0,
      },
    });

    const ctx = await new HTXAdapter().getAssetContext('BTC');
    expect(ctx.coin).toBe('BTC');
    expect(ctx.funding).toBeCloseTo(0.0001);
    expect(ctx.fundingAnnualized).toBeCloseTo(0.0001 * 1095); // 8h × 1095
    expect(ctx.openInterest).toBeCloseTo(2620048165.0286);    // USDT-value of OI
    expect(ctx.markPx).toBeCloseTo(76666.6);                  // HTX merged endpoint's `close` used as mark for shadow venue
    expect(ctx.volume24h).toBeCloseTo(581655887.3476);        // trade_turnover in USDT
    expect(ctx.prevDayPx).toBeCloseTo(76518.1);               // 24h open
  });

  it('routes GOLD via TRADFI_ALIASES → XAU-USDT (HTX has BOTH XAU + XAUT; prefer XAU spot)', async () => {
    const goldMerged = {
      ch: '', status: 'ok',
      tick: {
        amount: '0', ask: [4467, 0], bid: [4466, 0], close: '4467.31', count: 0,
        high: '4500', id: 0, low: '4400', open: '4460', trade_turnover: '0', ts: 0, vol: '0',
      },
      ts: 0,
    };
    setMock('/linear-swap-ex/market/detail/merged', { status: 200, body: goldMerged });
    setMock('/linear-swap-api/v1/swap_funding_rate', {
      status: 200,
      body: { status: 'ok', data: { estimated_rate: null, funding_rate: '0', contract_code: 'XAU-USDT', symbol: 'XAU', fee_asset: 'USDT', funding_time: '0', next_funding_time: null, trade_partition: 'USDT' }, ts: 0 },
    });
    setMock('/linear-swap-api/v1/swap_open_interest', {
      status: 200,
      body: { status: 'ok', data: [{ volume: 0, amount: 0, symbol: 'XAU', value: 0, contract_code: 'XAU-USDT', trade_amount: 0, trade_volume: 0, trade_turnover: 0, business_type: 'swap', pair: 'XAU-USDT', contract_type: 'swap', trade_partition: 'USDT' }], ts: 0 },
    });

    const ctx = await new HTXAdapter().getAssetContext('GOLD');
    expect(ctx.markPx).toBeCloseTo(4467.31);      // real spot gold
    expect(ctx.coin).toBe('GOLD');
    const mergedCall = fetchCalls.find(c => c.url.includes('detail/merged'));
    expect(mergedCall?.url).toContain('contract_code=XAU-USDT');
  });

  it('throws when merged.tick or funding.data is empty', async () => {
    setMock('/linear-swap-ex/market/detail/merged', { status: 200, body: { ch: '', status: 'error', tick: null, ts: 0 } });
    setMock('/linear-swap-api/v1/swap_funding_rate', { status: 200, body: { status: 'ok', data: { estimated_rate: null, funding_rate: '0', contract_code: 'X', symbol: 'X', fee_asset: 'USDT', funding_time: '0', next_funding_time: null, trade_partition: 'USDT' }, ts: 0 } });
    setMock('/linear-swap-api/v1/swap_open_interest', { status: 200, body: { status: 'ok', data: [], ts: 0 } });
    await expect(new HTXAdapter().getAssetContext('UNKNOWN')).rejects.toThrow(/empty ticker.funding payload/);
  });
});

// ── getCurrentPrice ──────────────────────────────────────────────────────

describe('HTXAdapter.getCurrentPrice', () => {
  it('returns close (last trade) from merged ticker', async () => {
    setMock('/linear-swap-ex/market/detail/merged', {
      status: 200,
      body: {
        ch: '', status: 'ok',
        tick: { amount: '0', ask: [0, 0], bid: [0, 0], close: '76666.6', count: 0, high: '0', id: 0, low: '0', open: '0', trade_turnover: '0', ts: 0, vol: '0' },
        ts: 0,
      },
    });
    expect(await new HTXAdapter().getCurrentPrice('BTC')).toBeCloseTo(76666.6);
  });

  it('returns null on fetch error (silent degradation)', async () => {
    setMock('/linear-swap-ex/market/detail/merged', { status: 500, statusText: 'Server Error' });
    expect(await new HTXAdapter().getCurrentPrice('UNKNOWN')).toBeNull();
  });
});

// ── getPredictedFundings + getFundingHistory (shadow returns []) ─────────

describe('HTXAdapter.getPredictedFundings + getFundingHistory', () => {
  it('getPredictedFundings returns [] for shadow venue (cross-venue fanout fires only for promoted)', async () => {
    const fundings = await new HTXAdapter().getPredictedFundings();
    expect(fundings).toEqual([]);
    expect(fetchCalls).toHaveLength(0);
  });

  it('getFundingHistory returns [] for shadow venue (HTX historical endpoint is auth-gated)', async () => {
    const history = await new HTXAdapter().getFundingHistory('BTC', 0);
    expect(history).toEqual([]);
    expect(fetchCalls).toHaveLength(0);
  });
});

// ── 429 rate-limit error ─────────────────────────────────────────────────

describe('HTXAdapter — 429 handling', () => {
  it('throws UpstreamRateLimitError with exchange="HTX"', async () => {
    setMock('/linear-swap-ex/market/history/kline', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '0' },
    });
    try {
      await new HTXAdapter().getCandles('BTC', '1h', 0);
      throw new Error('expected UpstreamRateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamRateLimitError);
      expect((err as UpstreamRateLimitError).exchange).toBe('HTX');
    }
  }, 10000);
});

// ── Adapter identity ─────────────────────────────────────────────────────

describe('HTXAdapter.getName', () => {
  it('returns "HTX"', () => {
    expect(new HTXAdapter().getName()).toBe('HTX');
  });
});
