/**
 * asset-class-detection.ts — cross-venue TradFi asset-class detection (the SINGLE
 * source of truth for "what asset class is (coin, venue)?").
 *
 * OPS-TIER-CLASSIFIER-XVENUE-W1 (Step-0 ratified Q1/Q8). This is NOT a "parallel
 * asset-class registry": it is the ONE derivation that BOTH
 * `asset-tiers.ts::classifyAsset` (tier display) AND
 * `underlying-type.ts::resolveAssetClass` (session/funding) project from
 * (Single-Derivation-Rule). It lives in its own LOW-LEVEL module rather than inside
 * `underlying-type.ts` because `underlying-type` imports `isKnownTradFi` from
 * `asset-tiers`, and `asset-tiers.classifyAsset` must import THIS — co-locating in
 * `underlying-type` would form the `asset-tiers ↔ underlying-type` init cycle the
 * spec's Map Anchor firewalls. Imports here are leaf-only (types,
 * market-sessions-constants, _upstream-fetch) plus a dynamic import for HL — NEVER
 * asset-tiers / underlying-type / tradfi-funding (the last imports asset-tiers, so a
 * static import would re-introduce the cycle).
 *
 * NET DETECTOR MAP (ratified; live-probed 2026-06-21):
 *  - 10 FIRST-CLASS field detectors — Binance `underlyingType` · Gate `contract_type`
 *    · MEXC `typeLabel`/`conceptPlate` · Bitget `isRwa` · Bybit `symbolType` ·
 *    WhiteBit `isTradFiFutures` · EdgeX `isStock` · BitMart `tradfi_info` · BingX
 *    `NC{SK,SI,CO,FX}` naming · HL `perpDexs` (xyz).
 *  - 7 UNION-FALLBACK venues (no usable field live) — OKX · Aster · Phemex · XT ·
 *    WEEX · HTX · KuCoin → resolved via the cross-venue UNION of the 10 authoritative
 *    venues' POSITIVE tags (Binance INCLUDED), base-ticker matched, crypto-deny-list
 *    guarded. Decoding HTX `business_type` / KuCoin `marketType` / Phemex website-
 *    category into first-class detectors is deferred to OPS-TIER-CLASSIFIER-DECODE-W2.
 *
 * SoT safety:
 *  - Exhaustive `Record<ExchangeId, TradFiDetector>` — tsc errors if ANY of the 17
 *    venues is omitted ("works on every venue" is structurally enforced).
 *  - 3-tier degradation: live snapshot → kept (stale) snapshot → STATIC_ASSET_CLASS_MAP
 *    seed floor. Per-venue fail-open (one venue API down never blocks classification).
 *  - SYNC read (`getTradFiClass`) over PRE-WARMED state so `classifyAsset` stays sync
 *    across its 11 performance-db rollup call-sites + get-trade-call (Q8). The async
 *    warm runs in `warmTierCaches` (asset-tiers) at boot, mirroring `dynamicXyzSymbols`.
 *  - Price-sanity (`priceFingerprintPass`) runs in the C3 canary (it has live prices);
 *    the sync path guards ticker collisions (SPX6900≠SP500, DYDX/AVAX/FLUX/IMX/GMX…X)
 *    via the crypto deny-list + the ≥4-char `deToken` X-strip guard.
 *
 * TEST SEAMS (cache-seam trio): `_clearAssetClassCache()` ·
 * `_setDetectorsForTest(partial)` · `_setAssetClassSnapshotForTest(perVenue, union)` ·
 * `_getAssetClassState()`. Real network is NEVER hit under vitest unless detectors are
 * injected (the `process.env.VITEST` guard keeps every test deterministic + offline).
 */
import type { ExchangeId } from '../types.js';
import type { AssetClass } from './market-sessions-constants.js';
import { STATIC_ASSET_CLASS_MAP, BINANCE_UNDERLYING_TO_ASSET_CLASS } from './market-sessions-constants.js';
import { upstreamFetch, VENUE_FETCH_CONFIGS } from './adapters/_upstream-fetch.js';

/** A per-venue detector: bare-symbol → AssetClass for that venue's TradFi instruments. Fail-open to empty. */
export type TradFiDetector = () => Promise<Map<string, AssetClass>>;

/**
 * Crypto tickers that collide with (or resemble) TradFi symbols — defense-in-depth so
 * a no-field venue's crypto listing is never union-matched into Tier 3. The ≥4-char
 * `deToken` guard already protects the `…X` crypto majors (DYDX/AVAX/FLUX/IMX/GMX),
 * but they are listed explicitly too. SPX (the SPX6900 memecoin, ≠ SP500 the index)
 * is handled by `STATIC_ASSET_CLASS_MAP` deliberately omitting it; the existing
 * `TRADFI_FALLBACK` seed in asset-tiers.ts owns SPX's tier (unchanged by this wave).
 */
const CRYPTO_DENYLIST: ReadonlySet<string> = new Set([
  'TNSR', 'Q', 'FIO', 'IDOL', 'ASTEROID', 'DYDX', 'APEX',
  'AVAX', 'FLUX', 'IMX', 'GMX',
]);

// ── Symbol normalization ──

/**
 * Strip a venue-native quote suffix / dex prefix / BingX wrapper to the bare symbol.
 * Examples: `BTC_USDT`→`BTC`, `ASML-USDT-SWAP`→`ASML`, `AAPLUSDTM`→`AAPL`,
 * `xyz:TSLA`→`TSLA`, `cmt_aaplusdt`→`AAPL`, `SPYUSD`→`SPY`, `AAPL_PERP`→`AAPL`,
 * `NCSKTSLA2USD-USDT`→`TSLA` (BingX wrapper unwound to the underlying ticker).
 */
export function stripQuote(raw: string): string {
  let x = String(raw).toUpperCase().trim();
  x = x.replace(/^XYZ:/, '').replace(/^CMT_/, '');
  const nc = x.match(/^NC(?:SK|SI|CO|FX)(.+?)2USD(?:-USDT)?$/);
  if (nc) return nc[1];
  return x
    .replace(/-USDT-SWAP$/, '')
    .replace(/[-_]USDT$/, '')
    .replace(/USDTM$/, '')
    .replace(/USDT$/, '')
    .replace(/[-_]USD$/, '')
    .replace(/USD$/, '')
    .replace(/_PERP$/, '');
}

/**
 * Drop a tokenization marker to recover the underlying ticker: a trailing `STOCK`
 * (MEXC `SNDKSTOCK`/Bybit `AMDSTOCK`→`AMD`) or a trailing single `X` on a ≥4-char
 * base (`AAPLX`→`AAPL`, `MSTRX`→`MSTR`). The ≥4-char guard is deliberate: it leaves
 * the crypto majors that legitimately end in `X` intact (`DYDX`/`AVAX`/`FLUX`/`IMX`/
 * `GMX` all have <4 chars before the `X`), so a tokenized stock de-tokenizes but a
 * crypto coin does not.
 */
export function deToken(sym: string): string {
  let x = sym.replace(/STOCK$/, '');
  if (/^[A-Z0-9]{4,}X$/.test(x)) x = x.slice(0, -1);
  return x;
}

/** Canonical lookup forms for a (already stripped) bare symbol: the bare + its de-tokenized form. */
function expand(bare: string): string[] {
  const out = [bare];
  const dt = deToken(bare);
  if (dt && dt !== bare) out.push(dt);
  return out;
}

// ── Per-venue detectors ──

/** Wrap a detector so a venue API failure fails OPEN (empty map) — never blocks the snapshot. */
function detector(venue: ExchangeId, fn: () => Promise<Map<string, AssetClass>>): TradFiDetector {
  return async () => {
    try {
      return await fn();
    } catch (e) {
      console.debug(`[asset-class] ${venue} detector failed (fail-open empty): ${e instanceof Error ? e.message : e}`);
      return new Map<string, AssetClass>();
    }
  };
}

/** No-usable-field venue: classified via the cross-venue union at lookup time. */
const emptyDetector: TradFiDetector = async () => new Map<string, AssetClass>();

function fetchVenue<T>(venue: ExchangeId, url: string): Promise<T> {
  return upstreamFetch<T>(VENUE_FETCH_CONFIGS[venue], { url });
}

const GATE_CONTRACT_TYPE: Record<string, AssetClass> = {
  stocks: 'EQUITY', indices: 'INDEX', commodities: 'COMMODITY', metals: 'COMMODITY', forex: 'FX',
};
const BINGX_PREFIX: Record<string, AssetClass> = { NCSK: 'EQUITY', NCSI: 'INDEX', NCCO: 'COMMODITY', NCFX: 'FX' };

/**
 * The exhaustive 17-venue detector registry. tsc errors if any `ExchangeId` is
 * omitted — "works on every venue" is structurally enforced, not asserted.
 */
const TRADFI_DETECTORS: Record<ExchangeId, TradFiDetector> = {
  // Binance — underlyingType on contractType:"TRADIFI_PERPETUAL" (the one map of record).
  BINANCE: detector('BINANCE', async () => {
    const j = await fetchVenue<{ symbols?: Array<{ symbol?: string; contractType?: string; underlyingType?: string }> }>(
      'BINANCE', 'https://fapi.binance.com/fapi/v1/exchangeInfo');
    const m = new Map<string, AssetClass>();
    for (const s of j.symbols ?? []) {
      if (s.contractType !== 'TRADIFI_PERPETUAL' || !s.symbol) continue;
      const cls = s.underlyingType ? BINANCE_UNDERLYING_TO_ASSET_CLASS[s.underlyingType] : undefined;
      if (cls) m.set(stripQuote(s.symbol), cls);
    }
    return m;
  }),
  // Gate — contract_type ∈ {stocks,indices,commodities,metals,forex}.
  GATE: detector('GATE', async () => {
    const arr = await fetchVenue<Array<{ name?: string; contract_type?: string }>>(
      'GATE', 'https://api.gateio.ws/api/v4/futures/usdt/contracts');
    const m = new Map<string, AssetClass>();
    for (const c of arr ?? []) {
      const cls = c.contract_type ? GATE_CONTRACT_TYPE[c.contract_type] : undefined;
      if (cls && c.name) m.set(stripQuote(c.name), cls);
    }
    return m;
  }),
  // MEXC — typeLabel===2 (or a tradfi conceptPlate zone); sub-class from the zone names.
  MEXC: detector('MEXC', async () => {
    const j = await fetchVenue<{ data?: Array<{ symbol?: string; typeLabel?: number | string; conceptPlate?: string[] }> }>(
      'MEXC', 'https://contract.mexc.com/api/v1/contract/detail');
    const m = new Map<string, AssetClass>();
    for (const c of j.data ?? []) {
      const zones = (c.conceptPlate ?? []).map((z) => z.toLowerCase());
      if (String(c.typeLabel) !== '2' && !zones.some((z) => z.includes('tradfi'))) continue;
      let cls: AssetClass = 'EQUITY';
      if (zones.some((z) => z.includes('commod') || z.includes('metal'))) cls = 'COMMODITY';
      else if (zones.some((z) => z.includes('forex') || z.endsWith('-fx'))) cls = 'FX';
      else if (zones.some((z) => z.includes('index') || z.includes('indices'))) cls = 'INDEX';
      if (c.symbol) m.set(stripQuote(c.symbol), cls);
    }
    return m;
  }),
  // Bitget — isRwa === "YES" (binary; defaults to equity, the dominant class).
  BITGET: detector('BITGET', async () => {
    const j = await fetchVenue<{ data?: Array<{ symbol?: string; isRwa?: string }> }>(
      'BITGET', 'https://api.bitget.com/api/v2/mix/market/contracts?productType=usdt-futures');
    const m = new Map<string, AssetClass>();
    for (const c of j.data ?? []) if (c.isRwa === 'YES' && c.symbol) m.set(stripQuote(c.symbol), 'EQUITY');
    return m;
  }),
  // Bybit — symbolType ∈ {stock,commodity}; paginated via nextPageCursor.
  BYBIT: detector('BYBIT', async () => {
    const m = new Map<string, AssetClass>();
    let cursor = '';
    for (let page = 0; page < 6; page++) {
      const url = `https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const j = await fetchVenue<{ result?: { list?: Array<{ symbol?: string; symbolType?: string }>; nextPageCursor?: string } }>('BYBIT', url);
      const list = j.result?.list ?? [];
      for (const c of list) {
        const cls = c.symbolType === 'stock' ? 'EQUITY' : c.symbolType === 'commodity' ? 'COMMODITY' : undefined;
        if (cls && c.symbol) m.set(stripQuote(c.symbol), cls);
      }
      cursor = j.result?.nextPageCursor ?? '';
      if (!cursor || list.length === 0) break;
    }
    return m;
  }),
  // WhiteBit — isTradFiFutures boolean on /api/v4/public/markets.
  WHITEBIT: detector('WHITEBIT', async () => {
    const arr = await fetchVenue<Array<{ name?: string; isTradFiFutures?: boolean }>>(
      'WHITEBIT', 'https://whitebit.com/api/v4/public/markets');
    const m = new Map<string, AssetClass>();
    for (const c of arr ?? []) if (c.isTradFiFutures === true && c.name) m.set(stripQuote(c.name), 'EQUITY');
    return m;
  }),
  // EdgeX — isStock boolean on data.contractList[] (cleanest field of any venue).
  EDGEX: detector('EDGEX', async () => {
    const j = await fetchVenue<{ data?: { contractList?: Array<{ contractName?: string; isStock?: boolean }> } }>(
      'EDGEX', 'https://pro.edgex.exchange/api/v1/public/meta/getMetaData');
    const m = new Map<string, AssetClass>();
    for (const c of j.data?.contractList ?? []) if (c.isStock === true && c.contractName) m.set(stripQuote(c.contractName), 'EQUITY');
    return m;
  }),
  // BitMart — a non-empty tradfi_info object (product_type is a useless constant 1).
  BITMART: detector('BITMART', async () => {
    const j = await fetchVenue<{ data?: { symbols?: Array<{ symbol?: string; tradfi_info?: unknown }> } }>(
      'BITMART', 'https://api-cloud-v2.bitmart.com/contract/public/details');
    const m = new Map<string, AssetClass>();
    for (const c of j.data?.symbols ?? []) if (c.tradfi_info && c.symbol) m.set(stripQuote(c.symbol), 'EQUITY');
    return m;
  }),
  // BingX — no field; NCSK/NCSI/NCCO/NCFX naming prefix → class; stripQuote unwinds the wrapper.
  BINGX: detector('BINGX', async () => {
    const j = await fetchVenue<{ data?: Array<{ symbol?: string }> }>(
      'BINGX', 'https://open-api.bingx.com/openApi/swap/v2/quote/contracts');
    const m = new Map<string, AssetClass>();
    for (const c of j.data ?? []) {
      const sym = c.symbol ?? '';
      const cls = BINGX_PREFIX[sym.slice(0, 4)];
      if (cls) m.set(stripQuote(sym), cls);
    }
    return m;
  }),
  // HL — xyz builder-dex perps (reuses oi-ranking; dynamic import keeps the cycle firewall).
  HL: detector('HL', async () => {
    const m = new Map<string, AssetClass>();
    const { getXyzSymbolSet } = await import('./oi-ranking.js');
    for (const sym of await getXyzSymbolSet()) {
      const bare = stripQuote(sym);
      const seeded = STATIC_ASSET_CLASS_MAP[bare];
      m.set(bare, seeded && seeded !== 'CRYPTO' ? seeded : 'EQUITY');
    }
    return m;
  }),
  // ── No usable asset-class field today → cross-venue UNION fallback (DECODE-W2) ──
  OKX: emptyDetector,
  ASTER: emptyDetector,
  PHEMEX: emptyDetector,
  XT: emptyDetector,
  WEEX: emptyDetector,
  HTX: emptyDetector,
  KUCOIN: emptyDetector,
};

// ── Snapshot state (3-tier cache; cache-seam trio) ──

interface AssetClassSnapshot {
  /** venue → (canonical form → class). */
  perVenue: Map<ExchangeId, Map<string, AssetClass>>;
  /** cross-venue union (canonical form → class) from the authoritative venues' POSITIVE tags. */
  union: Map<string, AssetClass>;
  probedAt: number;
}

const SNAPSHOT_TTL_MS = 60 * 60 * 1000; // 1h refresh cadence
let snapshot: AssetClassSnapshot | null = null;
let warmInflight: Promise<void> | null = null;
let detectorOverride: Partial<Record<ExchangeId, TradFiDetector>> | null = null;

/** When the live snapshot was last (re)built. `null` until the first warm. */
export function assetClassProbedAt(): number | null {
  return snapshot?.probedAt ?? null;
}

async function buildSnapshot(): Promise<AssetClassSnapshot> {
  // Override REPLACES the registry (not merge) so an injected test set fully controls
  // the warm — an un-overridden venue must never reach its live detector under vitest.
  const detectors: Partial<Record<ExchangeId, TradFiDetector>> = detectorOverride ?? TRADFI_DETECTORS;
  const ids = Object.keys(detectors) as ExchangeId[];
  const results = await Promise.allSettled(ids.map(async (id) => [id, await detectors[id]!()] as const));
  const perVenue = new Map<ExchangeId, Map<string, AssetClass>>();
  const union = new Map<string, AssetClass>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const [venue, raw] = r.value;
    const vmap = new Map<string, AssetClass>();
    for (const [bare, cls] of raw) {
      for (const form of expand(bare)) {
        if (!vmap.has(form)) vmap.set(form, cls);
        if (!union.has(form)) union.set(form, cls); // first authoritative tag wins (all positive → collision-safe)
      }
    }
    perVenue.set(venue, vmap);
  }
  return { perVenue, union, probedAt: Date.now() };
}

/**
 * Warm the cross-venue asset-class snapshot (async). Called from
 * `asset-tiers.ts::warmTierCaches` at boot + on the 1h cadence. Per-venue fail-open;
 * a fully-empty build keeps the prior (stale) snapshot rather than clobbering it.
 * NEVER hits the network under vitest unless detectors are injected.
 */
export async function warmAssetClasses(): Promise<void> {
  if (snapshot && Date.now() - snapshot.probedAt < SNAPSHOT_TTL_MS) return;
  if (!detectorOverride && process.env.VITEST) return;
  if (warmInflight) return warmInflight;
  warmInflight = (async () => {
    try {
      const next = await buildSnapshot();
      // Tier 1 (fresh) / Tier 2 (keep stale): accept a build only if it found anything,
      // else retain the prior snapshot. Tier 3 (seed) is the STATIC map floor in getTradFiClass.
      if (next.union.size > 0 || !snapshot) snapshot = next;
    } catch (e) {
      console.warn(`[asset-class] warm failed (keeping prior snapshot): ${e instanceof Error ? e.message : e}`);
    } finally {
      warmInflight = null;
    }
  })();
  return warmInflight;
}

/**
 * SYNC: the TradFi AssetClass for a coin on an (optional) venue, or `null` if it is
 * not a recognized TradFi instrument. Reads the pre-warmed snapshot; falls back to the
 * STATIC seed floor. Crypto deny-list guards ticker collisions. Never throws, never
 * returns 'CRYPTO' (crypto ⇒ null so `classifyAsset` continues to its tier-2/4 logic).
 */
export function getTradFiClass(coin: string, venue?: ExchangeId): AssetClass | null {
  const forms = expand(stripQuote(coin));
  if (forms.some((f) => CRYPTO_DENYLIST.has(f))) return null;
  if (snapshot) {
    if (venue) {
      const vm = snapshot.perVenue.get(venue);
      if (vm) for (const f of forms) { const c = vm.get(f); if (c) return c; }
    }
    for (const f of forms) { const c = snapshot.union.get(f); if (c) return c; }
  }
  for (const f of forms) { const s = STATIC_ASSET_CLASS_MAP[f]; if (s && s !== 'CRYPTO') return s; }
  return null;
}

// ── Test seams (never call in production) ──

/**
 * Test-only: build the snapshot NOW from the active detector registry, bypassing the
 * env + TTL guards. Pair with a mocked `upstreamFetch` to exercise the REAL detectors
 * (field parsing) offline. Never call in production.
 */
export async function _warmForTest(): Promise<void> {
  snapshot = await buildSnapshot();
}

/** Full reset: snapshot + inflight + detector overrides. */
export function _clearAssetClassCache(): void {
  snapshot = null;
  warmInflight = null;
  detectorOverride = null;
}

/** Inject per-venue detectors (or `null` to restore the live registry). Enables offline warms. */
export function _setDetectorsForTest(partial: Partial<Record<ExchangeId, TradFiDetector>> | null): void {
  detectorOverride = partial;
}

/** Seed the snapshot directly (sync) so `getTradFiClass`/`classifyAsset` can be unit-tested without a warm. */
export function _setAssetClassSnapshotForTest(
  perVenue: Map<ExchangeId, Map<string, AssetClass>>,
  union: Map<string, AssetClass>,
): void {
  snapshot = { perVenue, union, probedAt: Date.now() };
}

/** Read-only inspector: snapshot presence, age, union size, per-venue sizes. */
export function _getAssetClassState(): { warm: boolean; ageMs: number | null; unionSize: number; venues: number } {
  return {
    warm: snapshot !== null,
    ageMs: snapshot ? Date.now() - snapshot.probedAt : null,
    unionSize: snapshot?.union.size ?? 0,
    venues: snapshot?.perVenue.size ?? 0,
  };
}
