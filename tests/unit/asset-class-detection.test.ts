/**
 * Unit tests for the cross-venue asset-class detection engine
 * (OPS-TIER-CLASSIFIER-XVENUE-W1, C1).
 *
 * Three layers, all offline + deterministic:
 *  1. symbol normalization (stripQuote / deToken) — the cross-venue matching spine.
 *  2. engine behavior via INJECTED detectors — union build, venue + union-fallback
 *     lookup, crypto deny-list, per-venue fail-open, STATIC seed floor.
 *  3. REAL detector field-parsing via a mocked `upstreamFetch` — proves each venue's
 *     authoritative field is read correctly (Gate contract_type, Binance underlyingType,
 *     Bitget isRwa, BingX NC* naming) before the live post-deploy AC.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { AssetClass } from '../../src/lib/market-sessions-constants.js';

vi.mock('../../src/lib/adapters/_upstream-fetch.js', () => ({
  VENUE_FETCH_CONFIGS: new Proxy({} as Record<string, unknown>, {
    get: () => ({ venueName: 'test', exchangeId: 'TEST', banStatuses: [], timeoutMs: 1, transientRetries: 0 }),
  }),
  upstreamFetch: vi.fn(),
}));
vi.mock('../../src/lib/oi-ranking.js', () => ({
  getXyzSymbolSet: vi.fn(async () => new Set<string>(['TSLA', 'GOLD'])),
}));

import {
  stripQuote,
  deToken,
  getTradFiClass,
  warmAssetClasses,
  _warmForTest,
  _setDetectorsForTest,
  _clearAssetClassCache,
  _getAssetClassState,
  type TradFiDetector,
} from '../../src/lib/asset-class-detection.js';
import { upstreamFetch } from '../../src/lib/adapters/_upstream-fetch.js';

const m = (...pairs: Array<[string, AssetClass]>): Map<string, AssetClass> => new Map(pairs);
const detect = (map: Map<string, AssetClass>): TradFiDetector => async () => map;

beforeEach(() => {
  _clearAssetClassCache();
  (upstreamFetch as unknown as Mock).mockReset();
});

describe('asset-class normalization — stripQuote', () => {
  it('strips venue-native quote suffixes / dex prefixes to the bare symbol', () => {
    expect(stripQuote('BTC_USDT')).toBe('BTC');
    expect(stripQuote('ASML-USDT-SWAP')).toBe('ASML');   // OKX
    expect(stripQuote('AAPLUSDTM')).toBe('AAPL');         // KuCoin
    expect(stripQuote('xyz:TSLA')).toBe('TSLA');          // HL
    expect(stripQuote('cmt_aaplusdt')).toBe('AAPL');      // WEEX
    expect(stripQuote('SPYUSD')).toBe('SPY');             // EdgeX
    expect(stripQuote('AAPL_PERP')).toBe('AAPL');         // WhiteBit
    expect(stripQuote('VRTUSDT')).toBe('VRT');            // Bitget
  });
  it('unwinds the BingX NC* wrapper to the underlying ticker', () => {
    expect(stripQuote('NCSKTSLA2USD-USDT')).toBe('TSLA');
    expect(stripQuote('NCSKASML2USD')).toBe('ASML');
    expect(stripQuote('NCSINIKKEI2252USD')).toBe('NIKKEI225');
    expect(stripQuote('NCCOGOLD2USD')).toBe('GOLD');
    expect(stripQuote('NCFXEUR2USD')).toBe('EUR');
  });
});

describe('asset-class normalization — deToken (X-suffix guard)', () => {
  it('de-tokenizes a tokenized stock to its underlying ticker', () => {
    expect(deToken('AAPLX')).toBe('AAPL');
    expect(deToken('MSTRX')).toBe('MSTR');
    expect(deToken('AMDSTOCK')).toBe('AMD');
    expect(deToken('SNDKSTOCK')).toBe('SNDK');
  });
  it('leaves crypto majors that legitimately end in X intact (<4 chars before X)', () => {
    // The spec-cited collisions: DYDX/AVAX/FLUX/IMX/GMX end in X but are crypto.
    for (const c of ['DYDX', 'AVAX', 'FLUX', 'IMX', 'GMX', 'QNTX']) expect(deToken(c)).toBe(c);
  });
});

describe('asset-class engine — injected detectors (ratified matrix)', () => {
  async function warmMatrix() {
    _setDetectorsForTest({
      GATE: detect(m(['SNDK', 'EQUITY'], ['AAPLX', 'EQUITY'])),
      MEXC: detect(m(['SNDKSTOCK', 'EQUITY'])),
      BITGET: detect(m(['VRT', 'EQUITY'])),
      BYBIT: detect(m(['SNDK', 'EQUITY'])),
      BINGX: detect(m(['ASML', 'EQUITY'], ['NIKKEI225', 'INDEX'], ['GOLD', 'COMMODITY'])),
    });
    await warmAssetClasses();
  }

  it('classifies each venue by its own authoritative field; crypto → null', async () => {
    await warmMatrix();
    expect(getTradFiClass('SNDK', 'GATE')).toBe('EQUITY');
    expect(getTradFiClass('BTC', 'GATE')).toBeNull();
    expect(getTradFiClass('SNDKSTOCK', 'MEXC')).toBe('EQUITY');
    expect(getTradFiClass('TNSR', 'MEXC')).toBeNull();
    expect(getTradFiClass('VRT', 'BITGET')).toBe('EQUITY');
    expect(getTradFiClass('TNSR', 'BITGET')).toBeNull();
    expect(getTradFiClass('SNDK', 'BYBIT')).toBe('EQUITY');
  });

  it('preserves INDEX + FX + COMMODITY sub-classes from the naming/field', async () => {
    await warmMatrix();
    expect(getTradFiClass('ASML', 'BINGX')).toBe('EQUITY');
    expect(getTradFiClass('NIKKEI225', 'BINGX')).toBe('INDEX');
    expect(getTradFiClass('GOLD', 'BINGX')).toBe('COMMODITY');
  });

  it('de-tokenized form resolves too (AAPLX ⇒ AAPL)', async () => {
    await warmMatrix();
    expect(getTradFiClass('AAPLX', 'GATE')).toBe('EQUITY');
    expect(getTradFiClass('AAPL', 'GATE')).toBe('EQUITY'); // via the union/de-token form
  });
});

describe('asset-class engine — cross-venue union fallback + deny-list', () => {
  it('a no-field venue (OKX/Aster) resolves via the cross-venue union', async () => {
    _setDetectorsForTest({
      BINANCE: detect(m(['ASML', 'EQUITY'], ['AAPL', 'EQUITY'])),
      GATE: detect(m(['TSLA', 'EQUITY'])),
      // OKX / ASTER are emptyDetector by default; absent here ⇒ resolved via union.
    });
    await warmAssetClasses();
    expect(getTradFiClass('ASML', 'OKX')).toBe('EQUITY');   // OKX no-field → union (Binance)
    expect(getTradFiClass('AAPL', 'ASTER')).toBe('EQUITY'); // Aster no-field → union
    expect(getTradFiClass('TSLA', 'OKX')).toBe('EQUITY');   // union (Gate)
    expect(getTradFiClass('PENGU', 'OKX')).toBeNull();      // crypto, not in union
  });

  it('crypto deny-list overrides any union/venue hit (ticker-collision guard)', async () => {
    // Even if a no-field venue lists a crypto whose ticker collides with the union,
    // the deny-list returns null (never a silent Tier-3).
    _setDetectorsForTest({ BINANCE: detect(m(['ASTEROID', 'EQUITY'], ['DYDX', 'EQUITY'])) });
    await warmAssetClasses();
    expect(getTradFiClass('ASTEROID', 'BINANCE')).toBeNull();
    expect(getTradFiClass('DYDX', 'OKX')).toBeNull();
    expect(getTradFiClass('TNSR', 'GATE')).toBeNull();
  });
});

describe('asset-class engine — fail-open + seed floor', () => {
  it('one venue detector throwing does not block the others (no throw)', async () => {
    _setDetectorsForTest({
      GATE: detect(m(['SNDK', 'EQUITY'])),
      MEXC: async () => { throw new Error('MEXC 503'); },
    });
    await expect(warmAssetClasses()).resolves.toBeUndefined();
    expect(getTradFiClass('SNDK', 'GATE')).toBe('EQUITY'); // GATE unaffected by MEXC failure
  });

  it('falls back to the STATIC seed floor when the snapshot is cold', () => {
    // No warm at all → snapshot null → STATIC_ASSET_CLASS_MAP floor.
    expect(_getAssetClassState().warm).toBe(false);
    expect(getTradFiClass('TSLA')).toBe('EQUITY');
    expect(getTradFiClass('GLW')).toBe('EQUITY');   // wave-seeded canonical
    expect(getTradFiClass('ANTHROPIC')).toBe('PREMARKET');
    expect(getTradFiClass('NOTATHING')).toBeNull();
  });
});

describe('asset-class detectors — live field parsing (mocked upstreamFetch)', () => {
  const FIXTURES: Record<string, unknown> = {
    'https://api.gateio.ws/api/v4/futures/usdt/contracts': [
      { name: 'SNDK_USDT', contract_type: 'stocks' },
      { name: 'AAPLX_USDT', contract_type: 'stocks' },
      { name: 'NASDAQ_USDT', contract_type: 'indices' },
      { name: 'GOLD_USDT', contract_type: 'commodities' },
      { name: 'XAG_USDT', contract_type: 'metals' },
      { name: 'EUR_USDT', contract_type: 'forex' },
      { name: 'BTC_USDT', contract_type: '' },
    ],
    'https://fapi.binance.com/fapi/v1/exchangeInfo': {
      symbols: [
        { symbol: 'CRWDUSDT', contractType: 'TRADIFI_PERPETUAL', underlyingType: 'EQUITY' },
        { symbol: 'GOLDUSDT', contractType: 'TRADIFI_PERPETUAL', underlyingType: 'COMMODITY' },
        { symbol: 'BTCUSDT', contractType: 'PERPETUAL', underlyingType: 'COIN' },
      ],
    },
    'https://api.bitget.com/api/v2/mix/market/contracts?productType=usdt-futures': {
      data: [{ symbol: 'VRTUSDT', isRwa: 'YES' }, { symbol: 'QNTUSDT', isRwa: 'NO' }, { symbol: 'BTCUSDT', isRwa: 'NO' }],
    },
    'https://open-api.bingx.com/openApi/swap/v2/quote/contracts': {
      data: [
        { symbol: 'NCSKASML2USD-USDT' }, { symbol: 'NCSINIKKEI2252USD-USDT' },
        { symbol: 'NCCOGOLD2USD-USDT' }, { symbol: 'NCFXEUR2USD-USDT' }, { symbol: 'BTC-USDT' },
      ],
    },
  };

  it('parses each venue authoritative field correctly end-to-end', async () => {
    _setDetectorsForTest(null); // use the REAL detector registry
    (upstreamFetch as unknown as Mock).mockImplementation(async (_cfg: unknown, req: { url: string }) =>
      FIXTURES[req.url] ?? { symbols: [], data: { symbols: [], contractList: [] }, result: { list: [] } });

    await _warmForTest();

    // Gate contract_type → class
    expect(getTradFiClass('SNDK', 'GATE')).toBe('EQUITY');
    expect(getTradFiClass('NASDAQ', 'GATE')).toBe('INDEX');
    expect(getTradFiClass('GOLD', 'GATE')).toBe('COMMODITY');
    expect(getTradFiClass('XAG', 'GATE')).toBe('COMMODITY');   // metals → COMMODITY
    expect(getTradFiClass('EUR', 'GATE')).toBe('FX');
    expect(getTradFiClass('BTC', 'GATE')).toBeNull();          // contract_type '' → crypto
    // Binance underlyingType → class
    expect(getTradFiClass('CRWD', 'BINANCE')).toBe('EQUITY');
    expect(getTradFiClass('BTC', 'BINANCE')).toBeNull();       // PERPETUAL/COIN → not TradFi
    // Bitget isRwa
    expect(getTradFiClass('VRT', 'BITGET')).toBe('EQUITY');
    expect(getTradFiClass('QNT', 'BITGET')).toBeNull();        // isRwa NO (crypto Quant)
    // BingX NC* naming prefix → class (wrapper unwound to the underlying)
    expect(getTradFiClass('ASML', 'BINGX')).toBe('EQUITY');
    expect(getTradFiClass('NIKKEI225', 'BINGX')).toBe('INDEX');
    expect(getTradFiClass('GOLD', 'BINGX')).toBe('COMMODITY');
    expect(getTradFiClass('EUR', 'BINGX')).toBe('FX');
  });
});
