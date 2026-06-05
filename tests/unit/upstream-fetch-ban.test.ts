/**
 * tests/unit/upstream-fetch-ban.test.ts — OPS-ADAPTER-RATELIMIT-UNIFY-W1 (C1)
 *
 * The NEW behavior of the shared transport: HTTP ban statuses + response body-codes
 * map to a typed UpstreamRateLimitError thrown IMMEDIATELY (no retry — exactly 1
 * fetch), while transient failures still retry. Per the spec R3(iv) fixture.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { upstreamFetch, VENUE_FETCH_CONFIGS } from '../../src/lib/adapters/_upstream-fetch.js';
import { UpstreamRateLimitError } from '../../src/lib/errors.js';

function mockFetch(make: () => Response) {
  return vi.spyOn(global, 'fetch').mockImplementation((async () => make()) as typeof fetch);
}

describe('upstreamFetch — typed ban handling (no-retry)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.VITEST_FETCH_HITS;
  });

  it('throws UpstreamRateLimitError on a banStatus (418) — exactly 1 fetch, no retry', async () => {
    const spy = mockFetch(() => new Response('teapot', { status: 418, headers: { 'Retry-After': '30' } }));
    let thrown: unknown;
    try { await upstreamFetch(VENUE_FETCH_CONFIGS.BITMART, { url: 'https://x' }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(UpstreamRateLimitError);
    expect((thrown as UpstreamRateLimitError).exchange).toBe('Bitmart');
    expect((thrown as UpstreamRateLimitError).retryAfterSeconds).toBe(30);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('treats Bybit HTTP 403 ("access too frequent") as a typed ban — 1 fetch', async () => {
    const spy = mockFetch(() => new Response('forbidden', { status: 403 }));
    let thrown: unknown;
    try { await upstreamFetch(VENUE_FETCH_CONFIGS.BYBIT, { url: 'https://x' }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(UpstreamRateLimitError);
    expect((thrown as UpstreamRateLimitError).exchange).toBe('Bybit');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('treats a Bitget body-code (45001, HTTP 200) as a typed ban — 1 fetch', async () => {
    const spy = mockFetch(() => new Response(JSON.stringify({ code: '45001', msg: 'too frequent' }), { status: 200 }));
    let thrown: unknown;
    try { await upstreamFetch(VENUE_FETCH_CONFIGS.BITGET, { url: 'https://x' }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(UpstreamRateLimitError);
    expect((thrown as UpstreamRateLimitError).exchange).toBe('Bitget');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a non-ban body-code passes through (Bitget 00000 success returns the body)', async () => {
    mockFetch(() => new Response(JSON.stringify({ code: '00000', data: [1, 2] }), { status: 200 }));
    const body = await upstreamFetch<{ code: string; data: number[] }>(VENUE_FETCH_CONFIGS.BITGET, { url: 'https://x' });
    expect(body).toEqual({ code: '00000', data: [1, 2] });
  });

  it('retries a transient 5xx then throws generic — apiErrorName preserved (HL not Hyperliquid)', async () => {
    const spy = mockFetch(() => new Response('err', { status: 500, statusText: 'Internal Server Error' }));
    let thrown: unknown;
    try { await upstreamFetch(VENUE_FETCH_CONFIGS.HL, { url: 'https://x' }); } catch (e) { thrown = e; }
    expect(thrown).not.toBeInstanceOf(UpstreamRateLimitError);
    expect(String((thrown as Error).message)).toContain('HL API 500: Internal Server Error');
    expect(spy).toHaveBeenCalledTimes(2); // transientRetries = 1 → 2 attempts
  });
});
