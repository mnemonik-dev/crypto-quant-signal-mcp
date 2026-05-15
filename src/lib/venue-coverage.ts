/**
 * Static per-venue coverage matrix for TIER_3 (TradFi) AlgoVault-canonical symbols.
 *
 * Derived from the TRADFI-SYMBOL-ALIAS-W1 Plan-Mode probe (2026-05-15):
 *   - Probed all 4 CEX instrument-list endpoints (Binance fapi exchangeInfo, Bybit v5
 *     instruments-info, Bitget v2 contracts, OKX v5 public/instruments).
 *   - For each TIER_3 symbol, checked direct match `<COIN>USDT` AND TradFi alias
 *     candidates (`XAU`/`XAG`/`XPT`/`XPD`/`XCU`/`NG` for metals/oil/gas; etc.).
 *   - Live trade-call probe verified the alias-resolved CEX-native symbol returns
 *     plausible spot price (gold ≈ $4555, silver ≈ $77, platinum ≈ $1986, etc.).
 *
 * IMPORTANT — namespace collision: `SPX` on every CEX (and on HL standard perps) is
 * the SPX6900 memecoin (price ≈ $0.40), NOT the S&P 500 index (price ≈ $7400 on HL).
 * `SP500` is the S&P 500 index, HL-only. The `SP500 → SPX` alias was DROPPED in
 * Plan Mode after the spot-price sanity check caught this. See
 * `audits/TRADFI-SYMBOL-ALIAS-W1-endpoint-truth.md` §3.b.
 *
 * Audit:
 *   - Refresh by re-running `audits/TRADFI-SYMBOL-ALIAS-W1-symbol-coverage.csv`'s
 *     generation procedure (documented in the audit file).
 *   - When the CEX side adds/removes a TIER_3 listing, update both this file AND
 *     the adapter's `TRADFI_ALIASES` map in lockstep.
 */

import type { ExchangeId } from '../types.js';
import { isKnownTradFi } from './asset-tiers.js';

const ALL_5: ExchangeId[] = ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET'];

// HL-only TIER_3 symbols — 24 symbols whose CEX listings are absent on all 4
// non-HL venues as of 2026-05-15. SP500 included because the CEX `SPX` ticker
// is the SPX6900 memecoin, not the S&P 500 index.
const HL_ONLY: Set<string> = new Set([
  'ALUMINIUM', 'BRENTOIL', 'BX', 'CORN', 'DKNG', 'DXY', 'EUR', 'HYUNDAI',
  'JP225', 'JPY', 'KIOXIA', 'KR200', 'PURRDAT', 'RIVN', 'SKHX', 'SMSN',
  'SOFTBANK', 'SP500', 'TTF', 'URANIUM', 'URNM', 'VIX', 'WHEAT', 'XYZ100',
]);

// Partial-coverage TIER_3 symbols — supported on a subset of venues. HL is
// implicit (always present for TIER_3). Order within array is presentational
// only.
const PARTIAL_COVERAGE: Record<string, ExchangeId[]> = {
  AMD:       ['HL', 'BINANCE', 'BITGET', 'OKX'],
  BABA:      ['HL', 'BINANCE', 'BITGET', 'OKX'],
  COPPER:    ['HL', 'BINANCE', 'BITGET', 'OKX'],
  COST:      ['HL', 'BINANCE', 'BITGET'],
  CRWV:      ['HL', 'BINANCE', 'BITGET', 'OKX'],
  GME:       ['HL', 'BINANCE', 'BITGET'],
  HIMS:      ['HL', 'BITGET'],
  LLY:       ['HL', 'BINANCE', 'BITGET', 'OKX'],
  NATGAS:    ['HL', 'BINANCE', 'BITGET', 'OKX'],
  NFLX:      ['HL', 'BINANCE', 'BITGET'],
  PALLADIUM: ['HL', 'BINANCE', 'BITGET', 'OKX'],
  PLATINUM:  ['HL', 'BINANCE', 'BITGET', 'OKX'],
  USAR:      ['HL', 'BINANCE', 'BITGET', 'OKX'],
  XLE:       ['HL', 'BITGET'],
};

/**
 * Return the list of venues that support the given AlgoVault-canonical coin.
 *
 * Resolution order:
 *   1. Non-TradFi (crypto majors, alts, memes) → all 5 venues are presumed to
 *      support it. CEX-specific listing gaps for crypto are handled by the
 *      adapter (return 400 from upstream → tool surfaces a generic
 *      `UPSTREAM_400`). This function only carries TradFi-specific knowledge.
 *   2. TIER_3 + HL_ONLY → `['HL']`.
 *   3. TIER_3 + PARTIAL_COVERAGE → explicit per-coin list.
 *   4. TIER_3 + (everything else) → all 5 venues (default).
 *
 * Note: this function is intentionally permissive on the upper bound (returns
 * `ALL_5` for unknown coins) so it doesn't accidentally narrow the supported
 * venue list for fresh listings before this static matrix is re-probed. The
 * tightening happens via the `TRADFI_SYMBOL_UNSUPPORTED_ON_VENUE` error path
 * which only fires for KNOWN TradFi symbols on unsupported venues.
 */
export function getVenuesSupporting(coin: string): ExchangeId[] {
  const symbol = coin.toUpperCase();
  if (!isKnownTradFi(symbol)) return ALL_5;
  if (HL_ONLY.has(symbol)) return ['HL'];
  if (PARTIAL_COVERAGE[symbol]) return PARTIAL_COVERAGE[symbol];
  return ALL_5;
}

/**
 * Is the AlgoVault-canonical coin supported on the requested venue?
 * Convenience wrapper around `getVenuesSupporting`.
 */
export function isVenueSupportedFor(coin: string, exchange: ExchangeId): boolean {
  return getVenuesSupporting(coin).includes(exchange);
}

/**
 * Probe-date marker — useful for future "is this matrix stale?" audits.
 * Update in lockstep with re-running the alias coverage CSV.
 */
export const COVERAGE_PROBED_AT = '2026-05-15';
