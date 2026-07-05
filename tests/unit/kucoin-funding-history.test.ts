import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared transport to serve a FIXED 300-point 8h funding grid via the batch endpoint,
// so we can prove the adapter pages BACKWARD via `to` to deep history (EDGE-CARRY-BACKFILL-W1 CH1).
const EIGHT_H = 8 * 3600_000;
const SYN_END = 1_700_000_000_000; // ~2023-11-14
const SYN_START = SYN_END - 299 * EIGHT_H; // 300 grid points [SYN_START .. SYN_END]
const calls: string[] = [];
let failFrom = Number.POSITIVE_INFINITY; // page index at which to start throwing

vi.mock('../../src/lib/adapters/_upstream-fetch.js', () => ({
  VENUE_FETCH_CONFIGS: { KUCOIN: {} },
  upstreamFetch: vi.fn(async (_cfg: unknown, req: { url: string }) => {
    if (calls.length >= failFrom) throw new Error('simulated transport ban (418)');
    calls.push(req.url);
    const toRaw = Number(new URL(req.url).searchParams.get('to'));
    const to = Math.min(toRaw, SYN_END);
    // return the <=100 fixed-grid points with timepoint <= `to`, DESC (newest-first).
    const data: { symbol: string; fundingRate: number; timepoint: number }[] = [];
    let k = Math.floor((to - SYN_START) / EIGHT_H);
    for (let i = 0; i < 100 && k >= 0; i++, k--) {
      data.push({ symbol: 'XBTUSDTM', fundingRate: 0.0001, timepoint: SYN_START + k * EIGHT_H });
    }
    return { code: '200000', data };
  }),
}));

import { KuCoinAdapter } from '../../src/lib/adapters/kucoin.js';

beforeEach(() => {
  calls.length = 0;
  failFrom = Number.POSITIVE_INFINITY;
});

describe('KuCoinAdapter.getFundingHistory — batch endpoint deep paging (CH1 upgrade)', () => {
  it('pages BACKWARD via `to` to cover the full [startTime, now] window, ascending + deduped', async () => {
    const out = await new KuCoinAdapter().getFundingHistory('BTC', SYN_START);
    // 300 grid points collected across 3 data pages + 1 empty terminator = 4 transport calls.
    expect(out).toHaveLength(300);
    expect(calls.length).toBe(4);
    expect(calls.every((u) => u.includes('/contract/funding-rates'))).toBe(true);
    expect(out[0].time).toBe(SYN_START);
    expect(out[out.length - 1].time).toBe(SYN_END);
    // strictly ascending + no duplicate timepoints
    expect(out.every((p, i) => i === 0 || p.time > out[i - 1].time)).toBe(true);
    expect(new Set(out.map((p) => p.time)).size).toBe(out.length);
  });

  it('a recent startTime collects only the recent window (fewer pages)', async () => {
    const startTime = SYN_END - 50 * EIGHT_H;
    const out = await new KuCoinAdapter().getFundingHistory('BTC', startTime);
    expect(out.length).toBe(51); // inclusive [SYN_END-50*8h .. SYN_END]
    expect(out.every((p) => p.time >= startTime)).toBe(true);
    expect(calls.length).toBeLessThan(4); // stopped early once the window was covered
  });

  it('best-effort: a transport ban mid-paging returns the partial series, never throws', async () => {
    failFrom = 1; // succeed page 1 (check 0>=1 false), throw on page 2 (check 1>=1 true)
    const out = await new KuCoinAdapter().getFundingHistory('BTC', SYN_START);
    expect(out.length).toBe(100); // just the first page
    expect(out.every((p, i) => i === 0 || p.time > out[i - 1].time)).toBe(true);
  });
});
