/**
 * PILOT-ADAPTERS-W2 / C1 — Gate.io adapter unit tests.
 *
 * Mocks `globalThis.fetch`. Asserts:
 *   - Symbol round-trip (toGateSymbol / fromGateSymbol) including TRADFI_ALIASES.
 *   - SPX NOT in alias map (memecoin trap per semantic-fingerprint probe).
 *   - getCandles parses Gate's row-wise {o, h, l, c, v, sum, t} response into
 *     Candle[] with time × 1000 (seconds → ms).
 *   - getAssetContext bundles all 5 capabilities from single tickers call.
 *   - Funding cadence × 1095 annualization (8h, Binance-compatible).
 *   - getCurrentPrice extracts mark_price.
 *   - getPredictedFundings reads from /contracts list + reverses TRADFI_ALIASES.
 *   - 429 throws UpstreamRateLimitError with exchange="Gate".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  GateAdapter,
  toGateSymbol,
  fromGateSymbol,
  TRADFI_ALIASES,
} from '../../src/lib/adapters/gateio.js';
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

describe('toGateSymbol / fromGateSymbol — Gate-native symbol mapping', () => {
  it('crypto: BTC ⇄ BTC_USDT', () => {
    expect(toGateSymbol('BTC')).toBe('BTC_USDT');
    expect(fromGateSymbol('BTC_USDT')).toBe('BTC');
  });

  it('TradFi metal alias: GOLD ⇄ XAU_USDT (matches Binance canonical, NOT XAUT)', () => {
    expect(toGateSymbol('GOLD')).toBe('XAU_USDT');
    expect(fromGateSymbol('XAU_USDT')).toBe('GOLD');
  });

  it('TradFi metal alias: SILVER ⇄ XAG_USDT', () => {
    expect(toGateSymbol('SILVER')).toBe('XAG_USDT');
    expect(fromGateSymbol('XAG_USDT')).toBe('SILVER');
  });

  it('TradFi metal alias: COPPER ⇄ XCU_USDT, NATGAS ⇄ NG_USDT', () => {
    expect(toGateSymbol('COPPER')).toBe('XCU_USDT');
    expect(toGateSymbol('NATGAS')).toBe('NG_USDT');
    expect(fromGateSymbol('XCU_USDT')).toBe('COPPER');
    expect(fromGateSymbol('NG_USDT')).toBe('NATGAS');
  });

  it('TradFi metals: PLATINUM ⇄ XPT_USDT, PALLADIUM ⇄ XPD_USDT', () => {
    expect(toGateSymbol('PLATINUM')).toBe('XPT_USDT');
    expect(toGateSymbol('PALLADIUM')).toBe('XPD_USDT');
  });

  it('TradFi direct (literal canonical name = native): CL/VIX/TSM/MSFT/AMD/EWJ', () => {
    expect(toGateSymbol('CL')).toBe('CL_USDT');
    expect(toGateSymbol('VIX')).toBe('VIX_USDT');
    expect(toGateSymbol('TSM')).toBe('TSM_USDT');
    expect(toGateSymbol('MSFT')).toBe('MSFT_USDT');
    expect(toGateSymbol('EWJ')).toBe('EWJ_USDT');
  });

  it('SPX is INTENTIONALLY not in TRADFI_ALIASES (memecoin trap)', () => {
    expect(TRADFI_ALIASES).not.toHaveProperty('SP500');
    expect(TRADFI_ALIASES).not.toHaveProperty('SPX');
    // SP500 input → no alias → becomes SP500_USDT (which Gate.io does NOT list).
    // Adapter will return Gate API 4xx; caller sees clear error vs silent memecoin route.
    expect(toGateSymbol('SP500')).toBe('SP500_USDT');
  });
});

// ── getCandles ───────────────────────────────────────────────────────────

describe('GateAdapter.getCandles', () => {
  it('parses Gate row-wise {o,h,l,c,v,sum,t} response with time × 1000 (sec→ms)', async () => {
    setMock('/api/v4/futures/usdt/candlesticks', {
      status: 200,
      body: [
        { t: 1779166800, o: '76888', h: '76974.4', l: '76592.4', c: '76870.1', v: 14481859, sum: '111243132.12673' },
        { t: 1779170400, o: '76870', h: '77000', l: '76800', c: '76950', v: 5000, sum: '385000000' },
      ],
    });
    const candles = await new GateAdapter().getCandles('BTC', '1h', 1779000000000);
    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({
      time: 1779166800000,    // seconds × 1000 = ms
      open: 76888,
      high: 76974.4,
      low: 76592.4,
      close: 76870.1,
      volume: 14481859,
    });
  });

  it('passes startTime in SECONDS (Gate convention), not ms', async () => {
    setMock('/api/v4/futures/usdt/candlesticks', { status: 200, body: [] });
    await new GateAdapter().getCandles('BTC', '1h', 1779000000000);
    const call = fetchCalls.find(c => c.url.includes('candlesticks'));
    expect(call?.url).toContain('from=1779000000');     // ms → sec floor
    expect(call?.url).toContain('contract=BTC_USDT');
    expect(call?.url).toContain('interval=1h');
  });

  it('falls back to nearest available interval for unsupported timeframes (3m → 5m, 2h → 1h, 12h → 8h)', async () => {
    setMock('/api/v4/futures/usdt/candlesticks', { status: 200, body: [] });
    const adapter = new GateAdapter();
    for (const [tf, expected] of [['3m', '5m'], ['2h', '1h'], ['12h', '8h']] as const) {
      fetchCalls = [];
      await adapter.getCandles('BTC', tf, 0);
      const call = fetchCalls.find(c => c.url.includes('candlesticks'));
      expect(call?.url, `tf=${tf}`).toContain(`interval=${expected}`);
    }
  });
});

// ── getAssetContext (all-in-one ticker) ──────────────────────────────────

describe('GateAdapter.getAssetContext', () => {
  it('bundles funding + mark + index + OI + 24h ticker from single tickers call', async () => {
    setMock('/api/v4/futures/usdt/tickers', {
      status: 200,
      body: [{
        contract: 'BTC_USDT',
        last: '76963.5',
        low_24h: '76020.6',
        high_24h: '77750',
        volume_24h: '757531447',
        volume_24h_quote: '5817565144',
        volume_24h_base: '75753',
        change_percentage: '0.14',
        funding_rate: '0.000017',
        funding_rate_indicative: '0.000017',
        mark_price: '76963.6',
        index_price: '76999.52',
        total_size: '597898352',
      }],
    });
    const ctx = await new GateAdapter().getAssetContext('BTC');
    expect(ctx.coin).toBe('BTC');
    expect(ctx.funding).toBeCloseTo(0.000017);
    expect(ctx.fundingAnnualized).toBeCloseTo(0.000017 * 1095); // 8h × 1095
    expect(ctx.openInterest).toBeCloseTo(597898352);
    expect(ctx.markPx).toBeCloseTo(76963.6);
    expect(ctx.oraclePx).toBeCloseTo(76999.52);
    expect(ctx.volume24h).toBeCloseTo(5817565144);
  });

  it('routes GOLD via TRADFI_ALIASES → XAU_USDT (not memecoin)', async () => {
    setMock('/api/v4/futures/usdt/tickers', {
      status: 200,
      body: [{ contract: 'XAU_USDT', mark_price: '4555.43', funding_rate: '0.00001', index_price: '4555', total_size: '0', volume_24h_quote: '0', last: '4555', change_percentage: '0' }],
    });
    const ctx = await new GateAdapter().getAssetContext('GOLD');
    expect(ctx.markPx).toBeCloseTo(4555.43);
    expect(ctx.coin).toBe('GOLD');
    const tickerCall = fetchCalls.find(c => c.url.includes('tickers'));
    expect(tickerCall?.url).toContain('contract=XAU_USDT');
  });

  it('throws on empty ticker payload (not silent null) — OPS-MCP-DEFENSE-IN-DEPTH-W1: the contract-identity assert subsumes the old empty-check', async () => {
    setMock('/api/v4/futures/usdt/tickers', { status: 200, body: [] });
    await expect(new GateAdapter().getAssetContext('UNKNOWN')).rejects.toThrow(/GATE_TICKER_CONTRACT_MISMATCH: requested UNKNOWN_USDT, got none/);
  });
});

// ── getCurrentPrice ──────────────────────────────────────────────────────

describe('GateAdapter.getCurrentPrice', () => {
  it('returns mark_price from tickers endpoint', async () => {
    setMock('/api/v4/futures/usdt/tickers', {
      status: 200,
      body: [{ contract: 'BTC_USDT', mark_price: '76963.6', funding_rate: '0', index_price: '0', total_size: '0', volume_24h_quote: '0', last: '0', change_percentage: '0' }],
    });
    expect(await new GateAdapter().getCurrentPrice('BTC')).toBeCloseTo(76963.6);
  });

  it('returns null on fetch error (silent degradation)', async () => {
    setMock('/api/v4/futures/usdt/tickers', { status: 500, statusText: 'Server Error' });
    expect(await new GateAdapter().getCurrentPrice('UNKNOWN')).toBeNull();
  });
});

// ── getPredictedFundings ─────────────────────────────────────────────────

describe('GateAdapter.getPredictedFundings', () => {
  it('reads from /contracts list + reverses TRADFI_ALIASES (XAU → GOLD)', async () => {
    setMock('/api/v4/futures/usdt/contracts', {
      status: 200,
      body: [
        { name: 'BTC_USDT', type: 'direct', mark_price: '77000', funding_rate: '0.0001', funding_interval: 28800, funding_next_apply: 1779177600 },
        { name: 'XAU_USDT', type: 'direct', mark_price: '4555', funding_rate: '0.00002', funding_interval: 28800, funding_next_apply: 1779177600 },
        { name: 'NOT_USDT_PAIR', type: 'direct', mark_price: '0', funding_rate: '0', funding_interval: 28800, funding_next_apply: 0 },
      ],
    });
    const fundings = await new GateAdapter().getPredictedFundings();
    expect(fundings).toHaveLength(2);  // filters out non-_USDT entries
    const goldEntry = fundings.find(f => f.coin === 'GOLD');
    expect(goldEntry).toBeDefined();
    expect(goldEntry!.venues[0].fundingRate).toBeCloseTo(0.00002);
    expect(goldEntry!.venues[0].nextFundingTime).toBe(1779177600 * 1000);  // sec → ms
  });
});

// ── 429 rate-limit error ─────────────────────────────────────────────────

describe('GateAdapter — 429 handling', () => {
  it('throws UpstreamRateLimitError with exchange="Gate"', async () => {
    setMock('/api/v4/futures/usdt/candlesticks', {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'Retry-After': '0' },
    });
    try {
      await new GateAdapter().getCandles('BTC', '1h', 0);
      throw new Error('expected UpstreamRateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamRateLimitError);
      expect((err as UpstreamRateLimitError).exchange).toBe('Gate');
    }
  }, 10000);
});

// ── Adapter identity ─────────────────────────────────────────────────────

describe('GateAdapter.getName', () => {
  it('returns "Gate"', () => {
    expect(new GateAdapter().getName()).toBe('Gate');
  });
});
