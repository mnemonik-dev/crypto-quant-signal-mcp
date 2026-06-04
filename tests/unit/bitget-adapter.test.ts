/**
 * OPS-BITGET-TICKER-SYMBOL-FILTER-W1 — Bitget adapter ticker-endpoint unit tests.
 *
 * Mocks `globalThis.fetch`. Asserts the HOTFIX:
 *   - getAssetContext + getCurrentPrice use the SINGULAR /api/v2/mix/market/ticker
 *     (the plural /tickers ignored ?symbol= → [0]=YGGUSDT for every coin).
 *   - Both methods read the per-symbol row (price / volume / prevDayPx) correctly.
 *   - A symbol MISMATCH on the returned row throws BITGET_TICKER_SYMBOL_MISMATCH
 *     (default-deny on drift) — getCurrentPrice catches it → null.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitgetAdapter } from '../../src/lib/adapters/bitget.js';

interface MockResponse { status?: number; body?: unknown; }
let mockResponses: Map<string, MockResponse>;
let fetchCalls: { url: string }[];
let originalFetch: typeof fetch;

function setMock(urlSubstring: string, body: unknown, status = 200): void {
  mockResponses.set(urlSubstring, { status, body });
}
function buildFetchMock(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url });
    for (const [substr, resp] of mockResponses.entries()) {
      if (url.includes(substr)) {
        const status = resp.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
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

const ok = (data: unknown) => ({ code: '00000', msg: 'success', data });
const tickerRow = (symbol: string, markPrice: string, opts: Partial<{ lastPr: string; open24h: string; quoteVolume: string }> = {}) => ({
  symbol, lastPr: opts.lastPr ?? markPrice, markPrice, open24h: opts.open24h ?? markPrice,
  high24h: markPrice, low24h: markPrice, baseVolume: '1', quoteVolume: opts.quoteVolume ?? '1000000',
  fundingRate: '0', nextFundingTime: '0',
});

beforeEach(() => {
  mockResponses = new Map();
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = buildFetchMock();
});
afterEach(() => { globalThis.fetch = originalFetch; });

describe('BitgetAdapter.getAssetContext — singular /ticker (symbol-correct)', () => {
  it('reads the requested symbol\'s own price/volume/prevDayPx', async () => {
    setMock('market/ticker?', ok([tickerRow('TSLAUSDT', '421.58', { open24h: '418.00', quoteVolume: '17640776.39' })]));
    setMock('open-interest', ok({ openInterestList: [{ size: '123' }] }));
    setMock('current-fund-rate', ok([{ fundingRate: '0.000049' }]));

    const ctx = await new BitgetAdapter().getAssetContext('TSLA');
    expect(ctx.markPx).toBeCloseTo(421.58);
    expect(ctx.volume24h).toBeCloseTo(17640776.39);
    expect(ctx.prevDayPx).toBeCloseTo(418.00);
    expect(ctx.funding).toBeCloseTo(0.000049);
    // It must hit the SINGULAR endpoint, not the plural.
    expect(fetchCalls.some(c => c.url.includes('/market/ticker?'))).toBe(true);
    expect(fetchCalls.some(c => c.url.includes('/market/tickers?'))).toBe(false);
  });

  it('throws BITGET_TICKER_SYMBOL_MISMATCH when the row is for a different symbol', async () => {
    // Simulate the old bug shape: endpoint returns YGGUSDT for a TSLA request.
    setMock('market/ticker?', ok([tickerRow('YGGUSDT', '0.03')]));
    setMock('open-interest', ok({ openInterestList: [{ size: '1' }] }));
    setMock('current-fund-rate', ok([{ fundingRate: '0' }]));

    await expect(new BitgetAdapter().getAssetContext('TSLA')).rejects.toThrow(/BITGET_TICKER_SYMBOL_MISMATCH/);
  });
});

describe('BitgetAdapter.getCurrentPrice — singular /ticker', () => {
  it('returns the requested symbol\'s markPrice', async () => {
    setMock('market/ticker?', ok([tickerRow('BTCUSDT', '63725.5')]));
    expect(await new BitgetAdapter().getCurrentPrice('BTC')).toBeCloseTo(63725.5);
  });

  it('returns null on a symbol mismatch (default-deny, never YGG\'s price)', async () => {
    setMock('market/ticker?', ok([tickerRow('YGGUSDT', '0.03')]));
    expect(await new BitgetAdapter().getCurrentPrice('BTC')).toBeNull();
  });
});
