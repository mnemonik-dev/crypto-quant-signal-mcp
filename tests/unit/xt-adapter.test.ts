/**
 * PILOT-ADAPTERS-W3B / C3 — XT.COM adapter unit tests.
 * Symbol btc_usdt (lowercase + underscore); 8h cadence x1095; live API at
 * /future/market/v1/public/... (NOT spec /future/api/v1/...).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  XtAdapter,
  toXtSymbol,
  fromXtSymbol,
  TRADFI_ALIASES,
} from '../../src/lib/adapters/xt.js';
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

describe('toXtSymbol / fromXtSymbol — lowercase + underscore', () => {
  it('crypto: BTC ⇄ btc_usdt', () => {
    expect(toXtSymbol('BTC')).toBe('btc_usdt');
    expect(fromXtSymbol('btc_usdt')).toBe('BTC');
  });

  it('TradFi GOLD ⇄ gold_usdt (identity-lowercase; XT lists gold_usdt direct, no alias)', () => {
    expect(toXtSymbol('GOLD')).toBe('gold_usdt');
    expect(fromXtSymbol('gold_usdt')).toBe('GOLD');
  });

  it('TradFi alias: PLATINUM → xpt_usdt, PALLADIUM → xpd_usdt, USOIL → cl_usdt', () => {
    expect(toXtSymbol('PLATINUM')).toBe('xpt_usdt');
    expect(toXtSymbol('PALLADIUM')).toBe('xpd_usdt');
    expect(toXtSymbol('USOIL')).toBe('cl_usdt');
    expect(fromXtSymbol('xpt_usdt')).toBe('PLATINUM');
    expect(fromXtSymbol('xpd_usdt')).toBe('PALLADIUM');
    expect(fromXtSymbol('cl_usdt')).toBe('USOIL');
  });

  it('TradFi DIRECT identity-lowercase (no alias): SILVER/SP500/NATGAS/COPPER/MSTR/MSFT/CL', () => {
    expect(toXtSymbol('SILVER')).toBe('silver_usdt');
    expect(toXtSymbol('SP500')).toBe('sp500_usdt');   // 2ND venue after Phemex with REAL S&P 500
    expect(toXtSymbol('NATGAS')).toBe('natgas_usdt');
    expect(toXtSymbol('COPPER')).toBe('copper_usdt');
    expect(toXtSymbol('MSTR')).toBe('mstr_usdt');
    expect(toXtSymbol('MSFT')).toBe('msft_usdt');
  });

  it('SP500 routes to real S&P 500 perp (XT is 2ND venue after Phemex; price $7400 live-verified)', () => {
    // Identity-lowercase via symbol mapper.
    expect(toXtSymbol('SP500')).toBe('sp500_usdt');
    // Sanity check on the canonical alias map: SP500 is NOT in TRADFI_ALIASES
    // (routes via identity-lowercase, no alias needed).
    expect(TRADFI_ALIASES).not.toHaveProperty('SP500');
  });

  it('SPX NOT aliased (memecoin trap; spx_usdt = $0.37 verified)', () => {
    expect(TRADFI_ALIASES).not.toHaveProperty('SPX');
    expect(toXtSymbol('SPX')).toBe('spx_usdt');
  });

  it('TRADFI_ALIASES has exactly 3 entries (PLATINUM/PALLADIUM/USOIL)', () => {
    expect(Object.keys(TRADFI_ALIASES).sort()).toEqual(['PALLADIUM', 'PLATINUM', 'USOIL']);
  });
});

describe('XtAdapter.getCandles', () => {
  it('parses XT kline rows with ms time (no conversion)', async () => {
    setMock('/future/market/v1/public/q/kline', {
      status: 200,
      body: {
        returnCode: 0, msgInfo: 'success', error: null,
        result: [
          { s: 'btc_usdt', p: 'btc_usdt', t: 1779285600000, o: '77175.3', c: '77266.9', h: '77537.1', l: '76856.4', a: '7702743', v: '59487261.20736' },
          { s: 'btc_usdt', p: 'btc_usdt', t: 1779282000000, o: '77590.2', c: '77175.2', h: '77617.1', l: '76929.8', a: '12522740', v: '96647737.41188' },
        ],
      },
    });
    const candles = await new XtAdapter().getCandles('BTC', '1h', 1779200000000);
    expect(candles).toHaveLength(2);
    // Sort oldest-first
    expect(candles[0].time).toBe(1779282000000);
    expect(candles[0]).toEqual({
      time: 1779282000000,
      open: 77590.2, high: 77617.1, low: 76929.8, close: 77175.2, volume: 12522740,
    });
  });

  it('passes symbol=btc_usdt (lowercase), interval=1h, limit=1000', async () => {
    setMock('/future/market/v1/public/q/kline', { status: 200, body: { returnCode: 0, result: [] } });
    await new XtAdapter().getCandles('BTC', '1h', 0);
    const call = fetchCalls.find(c => c.url.includes('kline'));
    expect(call?.url).toContain('symbol=btc_usdt');
    expect(call?.url).toContain('interval=1h');
    expect(call?.url).toContain('limit=1000');
  });

  it('uses live path /future/market/v1/public/... (NOT spec /future/api/v1/...)', async () => {
    setMock('/future/market/v1/public/q/kline', { status: 200, body: { returnCode: 0, result: [] } });
    await new XtAdapter().getCandles('BTC', '1h', 0);
    const call = fetchCalls.find(c => c.url.includes('kline'));
    expect(call?.url).toContain('/future/market/v1/public/');
    expect(call?.url).not.toContain('/future/api/v1/');
  });

  it('throws on non-OK envelope (returnCode != 0)', async () => {
    setMock('/future/market/v1/public/q/kline', {
      status: 200,
      body: { returnCode: 1, msgInfo: 'failure', error: { code: 'invalid_symbol', msg: 'invalid symbol' }, result: null },
    });
    await expect(new XtAdapter().getCandles('BTC', '1h', 0)).rejects.toThrow(/non-OK envelope/);
  });
});

describe('XtAdapter.getAssetContext (2-call fan-out: agg-ticker + funding-rate)', () => {
  it('combines agg-ticker (mark/index/last/24h) + funding-rate (8h cadence)', async () => {
    setMock('/future/market/v1/public/q/agg-ticker', {
      status: 200,
      body: {
        returnCode: 0, msgInfo: 'success', error: null,
        result: { t: 1779287133251, s: 'btc_usdt', c: '77301.1', h: '77709.4', l: '76123.0', a: '222180179', v: '1709086671.87693', o: '76418.7', r: '0.0115', i: '77324.18', m: '77307.0', bp: '77300.9', ap: '77301.2' },
      },
    });
    setMock('/future/market/v1/public/q/funding-rate', {
      status: 200,
      body: { returnCode: 0, msgInfo: 'success', error: null, result: { symbol: 'btc_usdt', fundingRate: 0.00007031, nextCollectionTime: 1779292800000, collectionInternal: 8 } },
    });
    const ctx = await new XtAdapter().getAssetContext('BTC');
    expect(ctx.coin).toBe('BTC');
    expect(ctx.funding).toBeCloseTo(0.00007031);
    expect(ctx.fundingAnnualized).toBeCloseTo(0.00007031 * 1095);   // 8h × 1095
    expect(ctx.openInterest).toBe(0);   // XT OI endpoint not surfaced
    expect(ctx.markPx).toBeCloseTo(77307.0);
    expect(ctx.oraclePx).toBeCloseTo(77324.18);
    expect(ctx.volume24h).toBeCloseTo(1709086671.87693);
    expect(ctx.prevDayPx).toBeCloseTo(76418.7);
  });

  it('routes SP500 (real S&P 500) via identity-lowercase → sp500_usdt', async () => {
    setMock('/future/market/v1/public/q/agg-ticker', {
      status: 200,
      body: { returnCode: 0, result: { t: 0, s: 'sp500_usdt', c: '7400', h: '7405', l: '7395', a: '0', v: '0', o: '7398', r: '0', i: '7400.1', m: '7400.1', bp: '7400', ap: '7400.2' } },
    });
    setMock('/future/market/v1/public/q/funding-rate', {
      status: 200,
      body: { returnCode: 0, result: { symbol: 'sp500_usdt', fundingRate: 0, nextCollectionTime: 0, collectionInternal: 8 } },
    });
    const ctx = await new XtAdapter().getAssetContext('SP500');
    expect(ctx.markPx).toBeCloseTo(7400.1);   // real S&P 500 magnitude
    expect(ctx.coin).toBe('SP500');
    const tickerCall = fetchCalls.find(c => c.url.includes('agg-ticker'));
    expect(tickerCall?.url).toContain('symbol=sp500_usdt');
  });

  it('throws when ticker or funding payload is null', async () => {
    setMock('/future/market/v1/public/q/agg-ticker', { status: 200, body: { returnCode: 0, result: null } });
    setMock('/future/market/v1/public/q/funding-rate', { status: 200, body: { returnCode: 0, result: { symbol: 'X', fundingRate: 0, nextCollectionTime: 0, collectionInternal: 8 } } });
    await expect(new XtAdapter().getAssetContext('UNKNOWN')).rejects.toThrow(/empty ticker.funding payload/);
  });
});

describe('XtAdapter.getCurrentPrice', () => {
  it('returns mark price from agg-ticker', async () => {
    setMock('/future/market/v1/public/q/agg-ticker', {
      status: 200,
      body: { returnCode: 0, result: { t: 0, s: 'btc_usdt', c: '0', h: '0', l: '0', a: '0', v: '0', o: '0', r: '0', i: '0', m: '77307.0', bp: '0', ap: '0' } },
    });
    expect(await new XtAdapter().getCurrentPrice('BTC')).toBeCloseTo(77307.0);
  });

  it('returns null on fetch error', async () => {
    setMock('/future/market/v1/public/q/agg-ticker', { status: 500, statusText: 'Server Error' });
    expect(await new XtAdapter().getCurrentPrice('UNKNOWN')).toBeNull();
  });
});

describe('XtAdapter.getPredictedFundings', () => {
  it('returns [] for shadow venue', async () => {
    expect(await new XtAdapter().getPredictedFundings()).toEqual([]);
  });
});

describe('XtAdapter.getFundingHistory', () => {
  it('returns single-record list from funding-rate endpoint', async () => {
    setMock('/future/market/v1/public/q/funding-rate', {
      status: 200,
      body: { returnCode: 0, result: { symbol: 'btc_usdt', fundingRate: 0.00007031, nextCollectionTime: 1779292800000, collectionInternal: 8 } },
    });
    const hist = await new XtAdapter().getFundingHistory('BTC', 0);
    expect(hist).toHaveLength(1);
    expect(hist[0].fundingRate).toBeCloseTo(0.00007031);
  });
});

describe('XtAdapter — 429 handling', () => {
  it('throws UpstreamRateLimitError with exchange="XT"', async () => {
    setMock('/future/market/v1/public/q/kline', {
      status: 429, statusText: 'Too Many Requests',
      headers: { 'Retry-After': '0' },
    });
    try {
      await new XtAdapter().getCandles('BTC', '1h', 0);
      throw new Error('expected UpstreamRateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamRateLimitError);
      expect((err as UpstreamRateLimitError).exchange).toBe('XT');
    }
  }, 10000);
});

describe('XtAdapter.getName', () => {
  it('returns "XT"', () => {
    expect(new XtAdapter().getName()).toBe('XT');
  });
});
