import type { ExchangeId } from '../types.js';

/**
 * OPS-FUNDING-ARB-EXPAND-W1 — the funding-arb venue SoT. Maps each adapter funding-feed venue-string
 * (as emitted by `getPredictedFundings()`) → its canonical `ExchangeId` + funding INTERVAL (hours),
 * for interval-correct annualization (`annualizeFunding`) + the per-leg liquidity gate (via the scan
 * SoT `getVenueUniverse`).
 *
 * QUALIFYING SET (architect-ratified Q-A): the 7 promoted venues with a reliable `getPredictedFundings`
 * feed (funding rate + `nextFundingTime`), live-probed 2026-07-01. EXCLUDED — BITGET (feed but NO
 * `nextFundingTime` → a degraded urgency dimension on every opportunity; re-include when it exposes
 * one), MEXC/HTX/BINGX/PHEMEX (empty feed). Intervals: HL hourly; the rest 8h (live-probed cadence).
 * A venue-string NOT in this map is skipped by the engine (never guess its interval → no false spread).
 */
export const FUNDING_VENUE_META: Record<string, { exchangeId: ExchangeId; intervalHours: number }> = {
  HlPerp:     { exchangeId: 'HL',      intervalHours: 1 },
  BinPerp:    { exchangeId: 'BINANCE', intervalHours: 8 },
  BybitPerp:  { exchangeId: 'BYBIT',   intervalHours: 8 },
  GatePerp:   { exchangeId: 'GATE',    intervalHours: 8 },
  KuCoinPerp: { exchangeId: 'KUCOIN',  intervalHours: 8 },
  AsterPerp:  { exchangeId: 'ASTER',   intervalHours: 8 },
  OKXPerp:    { exchangeId: 'OKX',     intervalHours: 8 },
};

/**
 * The adapters whose `getPredictedFundings()` the arb FETCHES + merges (C2). HL's feed is a cross-venue
 * AGGREGATE (returns HlPerp/BinPerp/BybitPerp), so we do NOT separately call the Binance/Bybit adapters
 * — their venue-strings arrive via HL, preserving the EXACT funding source of the pre-expansion 3-venue
 * arb (0-regression). GATE/KUCOIN/ASTER/OKX each contribute their own single venue.
 */
export const FUNDING_ARB_FETCH_ADAPTERS: readonly ExchangeId[] = ['HL', 'GATE', 'KUCOIN', 'ASTER', 'OKX'];
