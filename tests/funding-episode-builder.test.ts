import { describe, it, expect } from 'vitest';
import { buildEpisodes, type FundingPoint, type EpisodeConfig } from '../src/scripts/funding-episode-builder.js';

const H8 = 8 * 3600_000;

/** Build a funding series with fixed interval spacing (times don't affect logic beyond ordering). */
function mkSeries(rates: number[], intervalHours: number, startMs = 0): FundingPoint[] {
  return rates.map((r, k) => ({ time: startMs + k * intervalHours * 3600_000, fundingRate: r }));
}

const BASE: Omit<EpisodeConfig, 'floorApr'> = {
  intervalHours: 8,
  takerFee: 0.0005,
  halfSpread: 0.00005, // rtCost = 2*0.0005 + 2*0.00005 = 0.0011 (11 bp)
};

describe('funding-episode-builder — Step-0 worked-example fixture (AC4)', () => {
  // 42 real Binance BTCUSDT 8h funding rates from 2020-01-03T16:00Z (Step-0 audit worked example).
  const FIXTURE_RATES = [
    0.0001, 0.0001, 8.4e-7, 7.387e-5, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001,
    0.0001, 0.0001, 0.0001, 0.00012514, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001,
    0.0001, 0.0001, 0.0001, 0.00017846, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001, 0.0001,
    0.0001, 0.0001, 0.000259, 0.0001, 0.00049392, 0.00019497, 0.0001, 0.0001, 0.00041191,
    0.00031466, 0.0001, 0.00015027,
  ];
  const ENTRY_MS = 1578067200001;

  it('reproduces the audit arithmetic: 42 intervals, horizon exit, gross 0.005403 / net 0.004303 / net-APR 11.2%', () => {
    const eps = buildEpisodes(mkSeries(FIXTURE_RATES, 8, ENTRY_MS), { ...BASE, floorApr: 0.08 });
    expect(eps).toHaveLength(1);
    const e = eps[0];
    expect(e.entryMs).toBe(ENTRY_MS);
    expect(e.entrySign).toBe(1);
    expect(e.heldIntervals).toBe(42);
    expect(e.exitReason).toBe('horizon');
    expect(e.durDays).toBeCloseTo(14, 6);
    expect(e.rtCost).toBeCloseTo(0.0011, 9);
    expect(e.gross).toBeCloseTo(0.005403, 6);
    expect(e.net).toBeCloseTo(0.004303, 6);
    expect(e.grossApr).toBeCloseTo(0.141, 3);
    expect(e.netApr).toBeCloseTo(0.112, 3);
    expect(e.netPositive).toBe(true);
  });
});

describe('funding-episode-builder — exit precedence + debounce', () => {
  it('sign_flip exits BEFORE accruing the flipped interval', () => {
    // +,+ then flip to − ; APR(0.0002 @8h) = 0.219 > floor
    const eps = buildEpisodes(mkSeries([0.0002, 0.0002, -0.0002], 8), { ...BASE, floorApr: 0.08 });
    expect(eps).toHaveLength(1);
    expect(eps[0].exitReason).toBe('sign_flip');
    expect(eps[0].heldIntervals).toBe(2);
    expect(eps[0].gross).toBeCloseTo(0.0004, 9); // flipped interval NOT accrued
    expect(eps[0].entrySign).toBe(1);
  });

  it('decay exits after 2 CONSECUTIVE sub-(floor/2) intervals, not one', () => {
    // floor 0.08 → floor/2 = 0.04 (4% APR). 1e-6 @8h ≈ 0.11% APR (< 4%).
    const eps = buildEpisodes(mkSeries([0.0002, 1e-6, 1e-6, 0.0002], 8), { ...BASE, floorApr: 0.08 });
    expect(eps).toHaveLength(1);
    expect(eps[0].exitReason).toBe('decay');
    expect(eps[0].heldIntervals).toBe(3); // entry + 2 decayed intervals accrued
  });

  it('a single sub-(floor/2) interval does NOT trigger decay (counter resets)', () => {
    const eps = buildEpisodes(mkSeries([0.0002, 1e-6, 0.0002, 0.0002], 8), { ...BASE, floorApr: 0.08 });
    expect(eps).toHaveLength(1);
    expect(eps[0].exitReason).toBe('data_end'); // ran to end, no decay/flip/horizon
    expect(eps[0].heldIntervals).toBe(4);
  });

  it('cooldown ≥2 intervals suppresses re-entry immediately after an exit', () => {
    // ep1 enters idx0(+), flips at idx1(−) [held 1]; idx1 & idx2 are high-APR − but COOLDOWN-skipped;
    // ep2 enters at idx3 (proving 2 intervals were debounced).
    const eps = buildEpisodes(mkSeries([0.0002, -0.0002, -0.0002, -0.0002], 8), { ...BASE, floorApr: 0.08 });
    expect(eps).toHaveLength(2);
    expect(eps[0].exitReason).toBe('sign_flip');
    expect(eps[0].heldIntervals).toBe(1);
    expect(eps[1].entryMs).toBe(3 * H8); // NOT idx1 or idx2
    expect(eps[1].entrySign).toBe(-1);
  });
});

describe('funding-episode-builder — interval-awareness + floor boundary', () => {
  it('honors a 1h interval (Hyperliquid): durDays uses intervalHours, not a hard-coded 8h', () => {
    // APR(2e-5 @1h) = 2e-5 * 24 * 365 = 0.1752 > floor
    const eps = buildEpisodes(mkSeries([2e-5, 2e-5, 2e-5], 1), { ...BASE, intervalHours: 1, floorApr: 0.08 });
    expect(eps).toHaveLength(1);
    expect(eps[0].heldIntervals).toBe(3);
    expect(eps[0].durDays).toBeCloseTo(3 / 24, 9); // 0.125 d — NOT 3*8/24 = 1.0
  });

  it('floor is a STRICT inequality: just-below → no entry, just-above → entry', () => {
    const atFloorRate = 0.08 / (24 / 8 * 365); // rate whose |APR| == 0.08 exactly
    const below = buildEpisodes(mkSeries([atFloorRate * 0.999], 8), { ...BASE, floorApr: 0.08 });
    const above = buildEpisodes(mkSeries([atFloorRate * 1.001], 8), { ...BASE, floorApr: 0.08 });
    expect(below).toHaveLength(0);
    expect(above).toHaveLength(1);
  });

  it('fully-hedged ×2 cost model doubles rtCost and can flip netPositive', () => {
    const pts = mkSeries([0.0002, 0.0002, 0.0002], 8); // gross 0.0006
    const x1 = buildEpisodes(pts, { ...BASE, floorApr: 0.08, costMult: 1 })[0]; // rtCost 0.0011 → net −0.0005
    const x2 = buildEpisodes(pts, { ...BASE, floorApr: 0.08, costMult: 2 })[0]; // rtCost 0.0022 → net −0.0016
    expect(x1.rtCost).toBeCloseTo(0.0011, 9);
    expect(x2.rtCost).toBeCloseTo(0.0022, 9);
    expect(x2.net).toBeLessThan(x1.net);
  });

  it('empty / degenerate input returns no episodes', () => {
    expect(buildEpisodes([], { ...BASE, floorApr: 0.08 })).toEqual([]);
    expect(buildEpisodes(mkSeries([0, 0, 0], 8), { ...BASE, floorApr: 0.08 })).toEqual([]);
    expect(buildEpisodes(mkSeries([0.0002], 8), { ...BASE, intervalHours: 0, floorApr: 0.08 })).toEqual([]);
  });
});
