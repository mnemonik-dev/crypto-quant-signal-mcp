/**
 * OPS-MCP-DEFENSE-IN-DEPTH-W1 R3 — row-identity asserts on Bybit + Gate
 * single-entity ticker reads (List-endpoint single-entity-read rule).
 *
 * A `?symbol=`/`?contract=`-filtered list endpoint can silently ignore its filter
 * and return a wrong-but-plausible `[0]` row for EVERY query (Bitget did exactly
 * this — bitget.ts:166 carries the precedent assert). Bybit (`BybitTicker.symbol`)
 * and Gate (`GateTicker.contract` — per-venue identity field divergence) now assert
 * the returned row IS the requested instrument:
 *   - getAssetContext: mismatch → typed throw (venue scored as failed, not wrong).
 *   - getCurrentPrice: mismatch → throw inside the existing try/catch → null
 *     (fail-soft preserved; a wrong-symbol price can no longer leak through).
 *
 * Mock pattern mirrors tests/unit/kucoin-adapter.test.ts (globalThis.fetch).
 * Inline-assert count is now 3 venues (Bitget/Bybit/Gate) — extraction deferred to
 * OPS-SHARED-TICKER-IDENTITY-ASSERT-EXTRACTION-W1 per the 3-example threshold.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BybitAdapter } from '../../src/lib/adapters/bybit.js';
import { GateAdapter } from '../../src/lib/adapters/gateio.js';

interface MockResponse {
  status?: number;
  body?: unknown;
}

let mockResponses: Map<string, MockResponse>;
let originalFetch: typeof fetch;

function setMock(urlSubstring: string, response: MockResponse): void {
  mockResponses.set(urlSubstring, response);
}

function buildFetchMock(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [substr, resp] of mockResponses.entries()) {
      if (url.includes(substr)) {
        return {
          ok: (resp.status ?? 200) >= 200 && (resp.status ?? 200) < 300,
          status: resp.status ?? 200,
          statusText: 'OK',
          headers: { get: () => null },
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
  originalFetch = globalThis.fetch;
  globalThis.fetch = buildFetchMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── fixtures ─────────────────────────────────────────────────────────────

function bybitTicker(symbol: string) {
  return {
    symbol,
    lastPrice: '100', markPrice: '100', indexPrice: '100',
    fundingRate: '0.0001', nextFundingTime: '0',
    prevPrice24h: '95', turnover24h: '1000000', volume24h: '10000',
  };
}

function bybitTickersResponse(symbol: string) {
  return { retCode: 0, retMsg: 'OK', result: { list: [bybitTicker(symbol)] } };
}

const bybitOiResponse = { retCode: 0, retMsg: 'OK', result: { list: [{ openInterest: '500', timestamp: '1' }] } };

function gateTicker(contract: string) {
  return {
    contract,
    last: '100', low_24h: '90', high_24h: '110', change_percentage: '5',
    mark_price: '100', index_price: '100', funding_rate: '0.0001',
    total_size: '500', volume_24h_quote: '1000000',
  };
}

// ── Bybit ────────────────────────────────────────────────────────────────

describe('BybitAdapter row-identity assert (BYBIT_TICKER_SYMBOL_MISMATCH)', () => {
  it('getAssetContext THROWS when the filtered list returns a different symbol', async () => {
    setMock('/v5/market/tickers', { body: bybitTickersResponse('YGGUSDT') }); // filter ignored
    setMock('/v5/market/open-interest', { body: bybitOiResponse });
    await expect(new BybitAdapter().getAssetContext('BTC'))
      .rejects.toThrow(/BYBIT_TICKER_SYMBOL_MISMATCH: requested BTCUSDT, got YGGUSDT/);
  });

  it('getAssetContext passes on the matching row (no false-trip)', async () => {
    setMock('/v5/market/tickers', { body: bybitTickersResponse('BTCUSDT') });
    setMock('/v5/market/open-interest', { body: bybitOiResponse });
    const ctx = await new BybitAdapter().getAssetContext('BTC');
    expect(ctx.coin).toBe('BTC');
    expect(ctx.markPx).toBeCloseTo(100);
    expect(ctx.prevDayPx).toBeCloseTo(95);
  });

  it('getAssetContext THROWS (typed) on an empty list', async () => {
    setMock('/v5/market/tickers', { body: { retCode: 0, retMsg: 'OK', result: { list: [] } } });
    setMock('/v5/market/open-interest', { body: bybitOiResponse });
    await expect(new BybitAdapter().getAssetContext('BTC'))
      .rejects.toThrow(/BYBIT_TICKER_SYMBOL_MISMATCH: requested BTCUSDT, got none/);
  });

  it('getCurrentPrice returns NULL (fail-soft) on a wrong-symbol row — never the wrong price', async () => {
    setMock('/v5/market/tickers', { body: bybitTickersResponse('YGGUSDT') });
    expect(await new BybitAdapter().getCurrentPrice('BTC')).toBeNull();
  });

  it('getCurrentPrice returns the price on the matching row', async () => {
    setMock('/v5/market/tickers', { body: bybitTickersResponse('BTCUSDT') });
    expect(await new BybitAdapter().getCurrentPrice('BTC')).toBeCloseTo(100);
  });
});

// ── Gate ─────────────────────────────────────────────────────────────────

describe('GateAdapter row-identity assert (GATE_TICKER_CONTRACT_MISMATCH)', () => {
  it('getAssetContext THROWS when the filtered list returns a different contract', async () => {
    setMock('/api/v4/futures/usdt/tickers', { body: [gateTicker('YGG_USDT')] }); // filter ignored
    await expect(new GateAdapter().getAssetContext('BTC'))
      .rejects.toThrow(/GATE_TICKER_CONTRACT_MISMATCH: requested BTC_USDT, got YGG_USDT/);
  });

  it('getAssetContext passes on the matching row (no false-trip)', async () => {
    setMock('/api/v4/futures/usdt/tickers', { body: [gateTicker('BTC_USDT')] });
    const ctx = await new GateAdapter().getAssetContext('BTC');
    expect(ctx.coin).toBe('BTC');
    expect(ctx.markPx).toBeCloseTo(100);
  });

  it('getAssetContext THROWS (typed) on an empty list', async () => {
    setMock('/api/v4/futures/usdt/tickers', { body: [] });
    await expect(new GateAdapter().getAssetContext('BTC'))
      .rejects.toThrow(/GATE_TICKER_CONTRACT_MISMATCH: requested BTC_USDT, got none/);
  });

  it('getCurrentPrice returns NULL (fail-soft) on a wrong-contract row — never the wrong price', async () => {
    setMock('/api/v4/futures/usdt/tickers', { body: [gateTicker('YGG_USDT')] });
    expect(await new GateAdapter().getCurrentPrice('BTC')).toBeNull();
  });

  it('getCurrentPrice returns the price on the matching row', async () => {
    setMock('/api/v4/futures/usdt/tickers', { body: [gateTicker('BTC_USDT')] });
    expect(await new GateAdapter().getCurrentPrice('BTC')).toBeCloseTo(100);
  });
});
