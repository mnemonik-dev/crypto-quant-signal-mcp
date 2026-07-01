/**
 * tests/unit/funding-venues.test.ts — OPS-FUNDING-ARB-EXPAND-W1 C1.
 *
 * The funding-arb venue SoT (FUNDING_VENUE_META) + interval-correct normalization via the SHARED
 * annualizeFunding primitive. Pins: the architect-ratified qualifying set, per-interval annualization
 * (8h/4h/1h), cross-venue equivalence, and the 0-regression identity the engine relies on
 * (annualized / 8760 === rate / intervalHours).
 */
import { describe, it, expect } from 'vitest';
import { annualizeFunding } from '../../src/lib/rank-constants.js';
import { FUNDING_VENUE_META, FUNDING_ARB_FETCH_ADAPTERS } from '../../src/lib/funding-venues.js';

describe('FUNDING_VENUE_META — the qualifying-venue SoT', () => {
  it('is exactly the 7 architect-ratified venues with correct intervals', () => {
    expect(Object.keys(FUNDING_VENUE_META).sort()).toEqual(
      ['AsterPerp', 'BinPerp', 'BybitPerp', 'GatePerp', 'HlPerp', 'KuCoinPerp', 'OKXPerp'].sort(),
    );
    expect(FUNDING_VENUE_META.HlPerp).toEqual({ exchangeId: 'HL', intervalHours: 1 }); // HL hourly
    expect(FUNDING_VENUE_META.BinPerp.intervalHours).toBe(8);
    // EXCLUDED: BITGET (no nextFundingTime → degraded urgency) + MEXC/HTX/BINGX/PHEMEX (empty feed)
    for (const excluded of ['BitgetPerp', 'MexcPerp', 'HtxPerp', 'BingxPerp', 'PhemexPerp']) {
      expect(FUNDING_VENUE_META).not.toHaveProperty(excluded);
    }
  });

  it('fetch-adapter set uses the HL aggregate for Bin/Bybit (no double-count)', () => {
    expect([...FUNDING_ARB_FETCH_ADAPTERS]).toEqual(['HL', 'GATE', 'KUCOIN', 'ASTER', 'OKX']);
  });
});

describe('annualizeFunding — interval-correct normalization (C1)', () => {
  it('annualizes 8h / 4h / 1h by the venue interval (rate × 24/h × 365)', () => {
    expect(annualizeFunding(0.0001, 8)).toBeCloseTo(0.0001 * 3 * 365, 12); // 8h → ×1095
    expect(annualizeFunding(0.0001, 4)).toBeCloseTo(0.0001 * 6 * 365, 12); // 4h → ×2190
    expect(annualizeFunding(0.0001, 1)).toBeCloseTo(0.0001 * 24 * 365, 12); // 1h → ×8760
  });

  it('cross-venue equivalence: identical daily funding annualizes identically across intervals', () => {
    // 0.01%/8h  ==  0.005%/4h  (both 0.03%/day) → same annualized APR
    expect(annualizeFunding(0.0001, 8)).toBeCloseTo(annualizeFunding(0.00005, 4)!, 12);
  });

  it('0-regression identity: annualized / 8760 === rate / intervalHours (the engine hourly rate)', () => {
    for (const [rate, h] of [[0.0001, 1], [0.0003, 8], [-0.0002, 8]] as const) {
      expect(annualizeFunding(rate, h)! / 8760).toBeCloseTo(rate / h, 15);
    }
  });

  it('returns null on an unknown/invalid interval (never guesses → no false spread)', () => {
    expect(annualizeFunding(0.0001, 0)).toBeNull();
    expect(annualizeFunding(0.0001, null)).toBeNull();
    expect(annualizeFunding(Number.NaN, 8)).toBeNull();
  });
});
