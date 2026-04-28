/**
 * Unit tests for v1.10.2 UpstreamRateLimitError + structured-error helper.
 *
 * Asserts:
 *   - UpstreamRateLimitError carries `code`, `exchange`, `retryAfterSeconds`
 *   - `instanceof` check survives transpile (CJS prototype chain)
 *   - EXCHANGE_FALLBACKS map covers every exchange the adapters know about
 *   - Each fallback list excludes its own exchange (no self-fallback suggestions)
 */
import { describe, it, expect } from 'vitest';
import { UpstreamRateLimitError, EXCHANGE_FALLBACKS } from '../../src/lib/errors.js';

describe('UpstreamRateLimitError', () => {
  it('carries the stable error_code "UPSTREAM_RATE_LIMIT"', () => {
    const e = new UpstreamRateLimitError('Hyperliquid', 30);
    expect(e.code).toBe('UPSTREAM_RATE_LIMIT');
  });

  it('exposes exchange + retryAfterSeconds fields', () => {
    const e = new UpstreamRateLimitError('Binance', 60);
    expect(e.exchange).toBe('Binance');
    expect(e.retryAfterSeconds).toBe(60);
  });

  it('accepts null retryAfterSeconds when upstream omits Retry-After', () => {
    const e = new UpstreamRateLimitError('OKX', null);
    expect(e.retryAfterSeconds).toBeNull();
  });

  it('survives `instanceof Error` and `instanceof UpstreamRateLimitError` after transpile', () => {
    const e = new UpstreamRateLimitError('Bybit', 5);
    expect(e instanceof Error).toBe(true);
    expect(e instanceof UpstreamRateLimitError).toBe(true);
  });

  it('error message includes the exchange name (debuggable in stack traces)', () => {
    const e = new UpstreamRateLimitError('Bitget', 10);
    expect(e.message).toContain('Bitget');
    expect(e.message).toMatch(/429|rate.?limit/i);
  });
});

describe('EXCHANGE_FALLBACKS', () => {
  const expectedExchanges = ['Hyperliquid', 'Binance', 'Bybit', 'OKX', 'Bitget'];

  it.each(expectedExchanges)('has a fallback list for %s', (ex) => {
    expect(EXCHANGE_FALLBACKS[ex]).toBeDefined();
    expect(Array.isArray(EXCHANGE_FALLBACKS[ex])).toBe(true);
    expect(EXCHANGE_FALLBACKS[ex].length).toBeGreaterThan(0);
  });

  it.each(expectedExchanges)('fallback list for %s does not contain itself', (ex) => {
    const list = EXCHANGE_FALLBACKS[ex];
    // Hyperliquid alias check: exchange-name "Hyperliquid" maps to enum "HL"
    // in the public-facing arg, but the fallback array entries SHOULD use the
    // enum form (HL/BINANCE/BYBIT/OKX/BITGET) to match what an MCP agent would
    // pass back as the `exchange` arg on a fallback call.
    if (ex === 'Hyperliquid') {
      expect(list).not.toContain('HL');
    } else {
      // Binance fallbacks shouldn't suggest BINANCE, etc.
      expect(list).not.toContain(ex.toUpperCase());
    }
  });

  it('every fallback list contains at least 4 alternatives (5-exchange suite)', () => {
    for (const ex of expectedExchanges) {
      expect(EXCHANGE_FALLBACKS[ex].length).toBeGreaterThanOrEqual(4);
    }
  });
});
