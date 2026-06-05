/**
 * tests/binance-rate-limit.test.ts — OPS-BINANCE-RATELIMITER-W1
 *
 * Binance is consumer #2 of the cross-process `upstream-weight-budget` primitive
 * (HL was #1, OPS-HL-RATELIMITER-W2). Aggregate cross-process Binance load
 * (default-exchange get_trade_call + the 42-cell cross-asset-grid warmer + Binance
 * seed crons) blew past Binance's 2400 weight/min IP limit during the shadow ramp →
 * HTTP 418 IP-ban → the grid's slow-grid breaker spammed Telegram.
 *
 * Covers:
 *   1. weightForBinance maps each fapi path to its documented weight (all-symbol
 *      ticker/24hr = 40, premiumIndex all = 10, klines = 1-2, single = 1).
 *   2. HTTP 418 (and 429) → typed UpstreamRateLimitError('Binance') — NOT a generic
 *      retryable Error (the old behavior re-hammered the ban + never tripped the
 *      grid's UpstreamRateLimitError-only backoff).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BinanceAdapter, weightForBinance } from '../src/lib/adapters/binance.js';
import { UpstreamRateLimitError } from '../src/lib/errors.js';

describe('weightForBinance — fapi weight mapper (OPS-BINANCE-RATELIMITER-W1)', () => {
  it('maps all-symbol ticker/24hr to 40, single-symbol to 1', () => {
    expect(weightForBinance('/fapi/v1/ticker/24hr')).toBe(40);
    expect(weightForBinance('/fapi/v1/ticker/24hr', { symbol: 'BTCUSDT' })).toBe(1);
  });

  it('maps all-symbol premiumIndex to 10, single-symbol to 1', () => {
    expect(weightForBinance('/fapi/v1/premiumIndex')).toBe(10);
    expect(weightForBinance('/fapi/v1/premiumIndex', { symbol: 'BTCUSDT' })).toBe(1);
  });

  it('maps klines by limit (≤100→1, ≤500→2) and openInterest/fundingRate to 1', () => {
    expect(weightForBinance('/fapi/v1/klines', { symbol: 'BTCUSDT', interval: '15m', limit: 100 })).toBe(1);
    expect(weightForBinance('/fapi/v1/klines', { symbol: 'BTCUSDT', interval: '15m', limit: 500 })).toBe(2);
    expect(weightForBinance('/fapi/v1/openInterest', { symbol: 'BTCUSDT' })).toBe(1);
    expect(weightForBinance('/fapi/v1/fundingRate', { symbol: 'BTCUSDT' })).toBe(1);
  });

  it('defaults unknown paths to a conservative weight (never under-count)', () => {
    expect(weightForBinance('/fapi/v1/someFutureEndpoint')).toBeGreaterThanOrEqual(5);
  });
});

describe('Binance adapter — 418 IP-ban → typed UpstreamRateLimitError (OPS-BINANCE-RATELIMITER-W1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws UpstreamRateLimitError("Binance") on HTTP 418 (not a generic retryable Error)', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((async () =>
      new Response('I am a teapot', { status: 418, statusText: "I'm a teapot", headers: { 'Retry-After': '120' } })) as typeof fetch);
    const adapter = new BinanceAdapter();
    let thrown: unknown;
    try {
      await adapter.getCandles('BTC', '15m', Date.now() - 100 * 900_000);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UpstreamRateLimitError);
    expect((thrown as UpstreamRateLimitError).exchange).toBe('Binance');
    expect((thrown as UpstreamRateLimitError).retryAfterSeconds).toBe(120);
  });
});
