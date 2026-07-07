import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/exchange-adapter.js', () => ({ getAdapter: vi.fn() }));

import { scanFundingArb, _resetScanFundingArbCaches, _setLiquidityOverrideForTest, _carryOrderForTest, _kendallTauForTest, _carryAllowlistForTest } from '../../src/tools/scan-funding-arb.js';
import { _setCarryScoresForTest, carryKey, type CarryScores } from '../../src/lib/carry-rank-reader.js';
import { getAdapter } from '../../src/lib/exchange-adapter.js';
import { resetLicenseCache } from '../../src/lib/license.js';
import type { ExchangeAdapter, FundingData } from '../../src/types.js';

const FUNDINGS: FundingData[] = [
  { coin: 'DOGE', venues: [
    { venue: 'HlPerp', fundingRate: 0.0001, nextFundingTime: 1712345600000 },
    { venue: 'BinPerp', fundingRate: 0.0016, nextFundingTime: 1712348400000 }, // 1bp/h spread — qualifies at minSpreadBps=1
  ] },
  { coin: 'BTC', venues: [
    { venue: 'HlPerp', fundingRate: 0.0002, nextFundingTime: 1712345600000 },
    { venue: 'BinPerp', fundingRate: 0.0003, nextFundingTime: 1712348400000 },
  ] },
  { coin: 'ETH', venues: [
    { venue: 'HlPerp', fundingRate: -0.0001, nextFundingTime: 1712345600000 },
    { venue: 'BinPerp', fundingRate: 0.0010, nextFundingTime: 1712348400000 },
  ] },
];

const mockAdapter = (): ExchangeAdapter => ({
  getName: () => 'MockExchange',
  getCandles: vi.fn().mockResolvedValue([]),
  getAssetContext: vi.fn().mockResolvedValue({}),
  getPredictedFundings: vi.fn().mockResolvedValue(FUNDINGS),
  getFundingHistory: vi.fn().mockResolvedValue([]),
  getCurrentPrice: vi.fn().mockResolvedValue(3000),
} as unknown as ExchangeAdapter);

const scores = (m: Record<string, number>, version = 'v1'): CarryScores => ({
  byVenueSymbol: new Map(Object.entries(m)),
  artifactVersion: version,
  scoredCount: Object.keys(m).length,
});

describe('scan_funding_arb carry re-rank (EDGE-CARRY-SERVING-W1, DARK)', () => {
  beforeEach(() => {
    _resetScanFundingArbCaches();
    resetLicenseCache();
    _setLiquidityOverrideForTest(() => Infinity);
    vi.mocked(getAdapter).mockReturnValue(mockAdapter());
    process.env.CQS_API_KEY = 'test-key';
    delete process.env.CARRY_RANKER_SOURCE;
    delete process.env.CARRY_RANKER_ENABLED;
    delete process.env.CARRY_RANKER_VENUES;
  });
  afterEach(() => {
    _setCarryScoresForTest(undefined);
    _setLiquidityOverrideForTest(null);
    delete process.env.CQS_API_KEY;
    delete process.env.CARRY_RANKER_SOURCE;
    delete process.env.CARRY_RANKER_ENABLED;
    delete process.env.CARRY_RANKER_VENUES;
  });

  it('AC1 grep-test: both flags are UNSET by default in this process', () => {
    expect(process.env.CARRY_RANKER_SOURCE).toBeUndefined();
    expect(process.env.CARRY_RANKER_ENABLED).toBeUndefined();
  });

  it('flags OFF → response byte-identical to legacy even with divergent scores present', async () => {
    _setCarryScoresForTest(null);
    const legacy = await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    _resetScanFundingArbCaches();
    resetLicenseCache();
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.99 })); // would promote ETH if applied
    const dark = await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    expect(legacy.opportunities.length).toBeGreaterThan(0); // non-vacuous comparison
    expect(dark.opportunities).toEqual(legacy.opportunities); // same order, same content
    expect(dark.scannedPairs).toBe(legacy.scannedPairs);
  });

  it('flags ON (both) → scored items first by score, unscored keep legacy relative order', async () => {
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    process.env.CARRY_RANKER_ENABLED = 'true';
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.9, [carryKey('BINANCE', 'BTC')]: 0.4 }));
    const res = await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    const coins = res.opportunities.map(o => o.coin);
    expect(coins[0]).toBe('ETH'); // highest carry score
    expect(coins[1]).toBe('BTC'); // second scored
    expect(coins[2]).toBe('DOGE'); // unscored → after, legacy order
  });

  it('outer flag alone is NOT enough (inner off → legacy order)', async () => {
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    // score a NON-legacy-top coin high: carry order would promote BTC to first if applied
    _setCarryScoresForTest(scores({ [carryKey('BINANCE', 'BTC')]: 0.9 }));
    const res = await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    expect(res.opportunities.map(o => o.coin)[0]).toBe('ETH'); // legacy top (highest spread) unchanged
  });

  it('flags ON but scores stale/unavailable → fail-open to legacy order', async () => {
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    process.env.CARRY_RANKER_ENABLED = 'true';
    _setCarryScoresForTest(null);
    const res = await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    expect(res.opportunities.length).toBeGreaterThan(0); // legacy path served
  });

  it('divergence log line emitted on EVERY scan with flags OFF (the flip evidence)', async () => {
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.9 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });
    const line = log.mock.calls.map(c => String(c[0])).find(l => l.startsWith('[carry-divergence]'));
    log.mockRestore();
    expect(line).toBeTruthy();
    const payload = JSON.parse(line!.replace('[carry-divergence] ', ''));
    expect(payload).toMatchObject({ applied: false, artifact_version: 'v1' });
    expect(payload.n).toBeGreaterThan(0);
    expect(typeof payload.kendall_tau).toBe('number');
    expect(String(payload.top5_overlap)).toMatch(/^\d+\/\d+$/);
    // W2 attribution fields (full-reach n_scored + scoped n_allowlist_scored + venue_scope)
    expect(payload.n_scored).toBe(1);            // ETH scored via HL, full reach
    expect(payload.n_allowlist_scored).toBe(0);  // allowlist empty ⇒ nothing scoped
    expect(payload.n_unscored).toBe(payload.n - payload.n_scored);
    expect(payload.venue_scope).toBe('');        // empty allowlist
  });

  it('kendall tau known answers', () => {
    expect(_kendallTauForTest(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(_kendallTauForTest(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(-1);
    expect(_kendallTauForTest(['a'], ['a'])).toBe(1);
  });

  it('carryOrder is a pure permutation (same members, no mutation of input)', () => {
    const items = [{ coin: 'A', rates: { HlPerp: 1 } }, { coin: 'B', rates: { HlPerp: 1 } }] as never[];
    const input = [...items];
    const { ordered, nScored } = _carryOrderForTest(items, scores({ [carryKey('HL', 'B')]: 0.5 }));
    expect(new Set(ordered)).toEqual(new Set(items));
    expect(items).toEqual(input);
    expect(nScored).toBe(1);
    expect((ordered[0] as { coin: string }).coin).toBe('B');
  });
});

describe('scan_funding_arb per-venue allowlist + three-key ignition (EDGE-CARRY-SERVING-W2, DARK)', () => {
  beforeEach(() => {
    _resetScanFundingArbCaches();
    resetLicenseCache();
    _setLiquidityOverrideForTest(() => Infinity);
    vi.mocked(getAdapter).mockReturnValue(mockAdapter());
    process.env.CQS_API_KEY = 'test-key';
    delete process.env.CARRY_RANKER_SOURCE;
    delete process.env.CARRY_RANKER_ENABLED;
    delete process.env.CARRY_RANKER_VENUES;
  });
  afterEach(() => {
    _setCarryScoresForTest(undefined);
    _setLiquidityOverrideForTest(null);
    delete process.env.CQS_API_KEY;
    delete process.env.CARRY_RANKER_SOURCE;
    delete process.env.CARRY_RANKER_ENABLED;
    delete process.env.CARRY_RANKER_VENUES;
  });

  const run = () => scanFundingArb({ minSpreadBps: 1, license: { tier: 'pro', key: 'test-key' } });

  it('_carryAllowlistForTest: unset/empty ⇒ empty set; comma list trimmed + uppercased', () => {
    delete process.env.CARRY_RANKER_VENUES;
    expect(_carryAllowlistForTest().size).toBe(0);
    process.env.CARRY_RANKER_VENUES = '';
    expect(_carryAllowlistForTest().size).toBe(0);
    process.env.CARRY_RANKER_VENUES = ' hl , bybit ';
    expect(_carryAllowlistForTest()).toEqual(new Set(['HL', 'BYBIT']));
  });

  it('carryOrder(allowlist) scopes scoring to allowlisted legs only', () => {
    const items = [{ coin: 'A', rates: { HlPerp: 1 } }, { coin: 'B', rates: { BinPerp: 1 } }] as never[];
    const sc = scores({ [carryKey('HL', 'A')]: 0.9, [carryKey('BINANCE', 'B')]: 0.8 });
    expect(_carryOrderForTest(items, sc).nScored).toBe(2);                       // full reach ⇒ both
    const scopedHL = _carryOrderForTest(items, sc, new Set(['HL']));
    expect(scopedHL.nScored).toBe(1);                                            // only A (HL leg)
    expect((scopedHL.ordered[0] as { coin: string }).coin).toBe('A');
    expect(_carryOrderForTest(items, sc, new Set(['OKX'])).nScored).toBe(0);     // venue nobody quotes
  });

  it('three-key: flags ON + allowlist EMPTY ⇒ byte-identical legacy (scoped re-rank hits nothing)', async () => {
    _setCarryScoresForTest(null);
    const legacy = await run();
    _resetScanFundingArbCaches(); resetLicenseCache();
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    process.env.CARRY_RANKER_ENABLED = 'true';
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.99 })); // would promote ETH if in scope
    const res = await run();
    expect(legacy.opportunities.length).toBeGreaterThan(0);
    expect(res.opportunities).toEqual(legacy.opportunities);
  });

  it('three-key venue-IN: flags ON + allowlist=HL + HL score inverts legacy ⇒ real reorder applied', async () => {
    _setCarryScoresForTest(null);
    const legacyCoins = (await run()).opportunities.map(o => o.coin);
    expect(legacyCoins.length).toBe(3);
    _resetScanFundingArbCaches(); resetLicenseCache();
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    process.env.CARRY_RANKER_ENABLED = 'true';
    process.env.CARRY_RANKER_VENUES = 'HL';
    // Score the legacy-LAST coin highest via HL → carry MUST promote it to #1 (a guaranteed change).
    const last = legacyCoins[legacyCoins.length - 1];
    _setCarryScoresForTest(scores({ [carryKey('HL', last)]: 0.99 }));
    const coins = (await run()).opportunities.map(o => o.coin);
    expect(coins[0]).toBe(last);                 // HL-scored coin promoted to first
    expect(coins).not.toEqual(legacyCoins);      // order actually changed (non-vacuous)
  });

  it('venue-OUT: allowlist=BYBIT while scores live under HL keys ⇒ byte-identical legacy', async () => {
    _setCarryScoresForTest(null);
    const legacy = await run();
    _resetScanFundingArbCaches(); resetLicenseCache();
    process.env.CARRY_RANKER_SOURCE = 'postgres';
    process.env.CARRY_RANKER_ENABLED = 'true';
    process.env.CARRY_RANKER_VENUES = 'BYBIT'; // no mock coin quotes BYBIT
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.99 }));
    expect((await run()).opportunities).toEqual(legacy.opportunities);
  });

  it('flags OFF + allowlist SET ⇒ still byte-identical (flags-off dominates the three keys)', async () => {
    _setCarryScoresForTest(null);
    const legacy = await run();
    _resetScanFundingArbCaches(); resetLicenseCache();
    process.env.CARRY_RANKER_VENUES = 'HL'; // allowlist set, but flags OFF
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.99 }));
    expect((await run()).opportunities).toEqual(legacy.opportunities);
  });

  it('divergence payload: n_allowlist_scored tracks the SCOPED subset; venue_scope is the sorted allowlist', async () => {
    process.env.CARRY_RANKER_VENUES = 'HL'; // flags OFF (dark); evidence stays full-reach
    _setCarryScoresForTest(scores({ [carryKey('HL', 'ETH')]: 0.9, [carryKey('BINANCE', 'BTC')]: 0.5 }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await run();
    const line = log.mock.calls.map(c => String(c[0])).find(l => l.startsWith('[carry-divergence]'));
    log.mockRestore();
    const p = JSON.parse(line!.replace('[carry-divergence] ', ''));
    expect(p.n_scored).toBe(2);           // full reach: ETH(HL) + BTC(BINANCE)
    expect(p.n_allowlist_scored).toBe(1); // HL scope: only ETH
    expect(p.venue_scope).toBe('HL');
    expect(p.applied).toBe(false);
  });
});
