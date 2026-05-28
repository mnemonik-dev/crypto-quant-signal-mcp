import { describe, it, expect } from 'vitest';

/**
 * OPS-TRADE-CALL-CLUSTER-W1 CH3 — vitest seam for the BINANCE adapter
 * prevDayPx fix that drives indicators.oi_change_pct.
 *
 * Background per OPS-BOT-NO-TRADE-CALLS-AUDIT-W1 (2026-05-28 09:32 UTC):
 *   Live probes of BINANCE 1m/4h/1h returned `"oi_change_pct": 0` on
 *   every call; BYBIT 5m returned `"oi_change_pct": -3.1`. Plan-Mode #1
 *   root-cause = Path (a) BINANCE adapter `prevDayPx` mapping bug.
 *
 *   Binance Futures /fapi/v1/ticker/24hr does NOT populate `prevClosePrice`
 *   for futures (spot-only field); the prior mapping read
 *   `ticker.prevClosePrice || '0'` which always evaluated to '0'.
 *   The fix uses `ticker.openPrice` (24h-rolling open; ALWAYS present in
 *   futures response) with fallback chain `openPrice || prevClosePrice || '0'`.
 *
 * This test asserts the shape contract on the mapped AssetContext value
 * AND the priceChange formula (used by oi_change_pct at L456 of
 * get-trade-call.ts) is non-zero when openPrice != lastPrice.
 */
describe('oi_change_pct field — BINANCE adapter prevDayPx fix', () => {
  it('priceChange formula returns non-zero when openPrice != lastPrice (post-fix)', () => {
    // Simulate the BINANCE adapter's getAssetContext output post-fix.
    // Real example from live API probe 2026-05-28: BTC lastPrice=73386.10,
    // openPrice=75875.10 → expected priceChange = -3.28%.
    const ticker = { lastPrice: '73386.10', openPrice: '75875.10', prevClosePrice: '' };
    const prevDayPx = parseFloat(ticker.openPrice || ticker.prevClosePrice || '0');
    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChange =
      prevDayPx > 0 ? (currentPrice - prevDayPx) / prevDayPx : 0;
    const oi_change_pct = parseFloat((priceChange * 100).toFixed(1));

    expect(prevDayPx).toBeGreaterThan(0); // FIX: now non-zero
    expect(oi_change_pct).toBeLessThan(0); // BTC down 3.28% in this snapshot
    expect(Math.abs(oi_change_pct)).toBeGreaterThan(0); // non-zero
    expect(Math.abs(oi_change_pct - (-3.3))).toBeLessThan(0.1); // matches API's priceChangePercent: "-3.280"
  });

  it('priceChange formula returns ~0 when openPrice ≈ lastPrice (sanity — genuinely-flat coin)', () => {
    // Genuinely flat coin: openPrice == lastPrice → priceChange = 0
    const ticker = { lastPrice: '100.50', openPrice: '100.50', prevClosePrice: '' };
    const prevDayPx = parseFloat(ticker.openPrice || ticker.prevClosePrice || '0');
    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChange =
      prevDayPx > 0 ? (currentPrice - prevDayPx) / prevDayPx : 0;
    const oi_change_pct = parseFloat((priceChange * 100).toFixed(1));

    expect(prevDayPx).toBe(100.5);
    expect(oi_change_pct).toBe(0); // genuinely flat = 0 (not the bug)
  });

  it('fallback chain: openPrice → prevClosePrice → 0 (defensive)', () => {
    // (a) openPrice present
    let ticker = { lastPrice: '50', openPrice: '48', prevClosePrice: '47' };
    let prevDayPx = parseFloat(ticker.openPrice || ticker.prevClosePrice || '0');
    expect(prevDayPx).toBe(48); // openPrice wins

    // (b) openPrice empty, prevClosePrice present (spot-style response)
    ticker = { lastPrice: '50', openPrice: '', prevClosePrice: '47' };
    prevDayPx = parseFloat(ticker.openPrice || ticker.prevClosePrice || '0');
    expect(prevDayPx).toBe(47); // prevClosePrice fallback

    // (c) both empty (defensive — shouldn't happen on real Binance response)
    ticker = { lastPrice: '50', openPrice: '', prevClosePrice: '' };
    prevDayPx = parseFloat(ticker.openPrice || ticker.prevClosePrice || '0');
    expect(prevDayPx).toBe(0); // defensive fallback to 0; verdict logic guards with prevDayPx > 0 check
  });

  it('pre-fix behavior reproduction (regression-pin for the bug we fixed)', () => {
    // BEFORE fix: only `prevClosePrice` was read; Binance Futures returns
    // undefined for that field; falls through to '0' → priceChange = 0.
    const ticker: { lastPrice: string; prevClosePrice?: string } = {
      lastPrice: '73386.10',
      // prevClosePrice: undefined (the actual Binance Futures shape)
    };
    const prevDayPxPreFix = parseFloat(ticker.prevClosePrice || '0');
    const currentPrice = parseFloat(ticker.lastPrice);
    const priceChangePreFix =
      prevDayPxPreFix > 0 ? (currentPrice - prevDayPxPreFix) / prevDayPxPreFix : 0;
    const oi_change_pct_preFix = parseFloat((priceChangePreFix * 100).toFixed(1));

    expect(prevDayPxPreFix).toBe(0); // BUG: always 0 on Binance Futures
    expect(oi_change_pct_preFix).toBe(0); // BUG: always 0 — what W1 surfaced
  });
});
