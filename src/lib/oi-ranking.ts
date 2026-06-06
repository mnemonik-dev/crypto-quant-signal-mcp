/**
 * OI Ranking — fetches top N Hyperliquid perps by notional open interest.
 * 1-hour in-memory cache to avoid hammering the HL API.
 */

import { hlInfoPost } from './adapters/hyperliquid.js';
import { coalescedCache } from './coalesced-cache.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface OIAsset {
  coin: string;
  notionalOI: number;
  markPx: number;
  openInterest: number;
}

// OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 C2: the success-only caches here were THE storm
// source — `getTopAssetsByOI(20)` is what every `getTradeSignal`'s `getTop20ByOI` hits
// (incl. the warmer's 42 grid scorers every ~50s), and a direct `hlInfoPost` with no
// single-flight + no negative cache meant a throttled cold cache re-hit HL on every
// call. Both rankings now route through the shared `coalescedCache`: single-flight
// collapses concurrent cold-fills to ONE HL fetch per key, a throttle is negative-cached
// (~45s jittered) instead of re-stormed, and stale is served on failure (preserving the
// prior stale-or-throw values). hlInfoPost's budget `acquire` is unchanged (once/fetch).
const NEGATIVE_TTL_MS = 45_000;

const stdRankingCache = coalescedCache<OIAsset[]>({
  load: async () => {
    const raw = await hlInfoPost<[{ universe: { name: string }[] }, { openInterest: string; markPx: string }[]]>({
      type: 'metaAndAssetCtxs',
    });
    const meta = raw[0];
    const ctxs = raw[1];
    const assets: OIAsset[] = meta.universe.map((a, i) => {
      const oi = parseFloat(ctxs[i].openInterest || '0');
      const px = parseFloat(ctxs[i].markPx || '0');
      return { coin: a.name, notionalOI: oi * px, markPx: px, openInterest: oi };
    });
    assets.sort((a, b) => b.notionalOI - a.notionalOI);
    return assets;
  },
  ttlMs: CACHE_TTL_MS,
  staleOk: true,
  negativeTtlMs: NEGATIVE_TTL_MS,
});

export async function getTopAssetsByOI(limit: number = 50): Promise<OIAsset[]> {
  const assets = await stdRankingCache.get('std');
  return assets.slice(0, limit);
}

/** Test-only: clears the OI-ranking caches (std + xyz) between cases. */
export function _resetOiRankingCache(): void {
  stdRankingCache._clear();
  xyzRankingCache._clear();
}

export function getTopAssetNames(assets: OIAsset[]): string[] {
  return assets.map(a => a.coin);
}

// ── xyz (TradFi) OI ranking ──

/**
 * Fetch all xyz (TradFi) perps from Hyperliquid, sorted by notional OI.
 * Uses "dex": "xyz" parameter to access HIP-3 builder-deployed perps.
 * 1-hour cache, stale fallback on error. (C2: routed through coalescedCache —
 * single-flight + negative-cache + stale-serve; values/TTL unchanged.)
 */
const xyzRankingCache = coalescedCache<OIAsset[]>({
  load: async () => {
    const raw = await hlInfoPost<[{ universe: { name: string }[] }, { openInterest: string; markPx: string; dayNtlVlm?: string }[]]>({
      type: 'metaAndAssetCtxs',
      dex: 'xyz',
    });
    const meta = raw[0];
    const ctxs = raw[1];
    const assets: OIAsset[] = meta.universe
      .map((a, i) => {
        const oi = parseFloat(ctxs[i].openInterest || '0');
        const px = parseFloat(ctxs[i].markPx || '0');
        // Strip 'xyz:' prefix — internal code uses bare symbols (e.g. GOLD not xyz:GOLD)
        return { coin: a.name.replace(/^xyz:/i, ''), notionalOI: oi * px, markPx: px, openInterest: oi };
      })
      .filter(a => a.notionalOI > 0); // skip unlisted/zero-OI assets
    assets.sort((a, b) => b.notionalOI - a.notionalOI);
    return assets;
  },
  ttlMs: CACHE_TTL_MS,
  staleOk: true,
  negativeTtlMs: NEGATIVE_TTL_MS,
});

export async function getXyzAssetsByOI(): Promise<OIAsset[]> {
  return xyzRankingCache.get('xyz');
}

/**
 * Get the set of all xyz (TradFi) coin symbols currently listed on Hyperliquid.
 * Used by asset-tiers.ts to classify coins into Tier 3 (TradFi).
 */
export async function getXyzSymbolSet(): Promise<Set<string>> {
  try {
    const assets = await getXyzAssetsByOI();
    return new Set(assets.map(a => a.coin));
  } catch {
    return new Set();
  }
}
