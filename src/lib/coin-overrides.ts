/**
 * OPS-SCAN-UNIVERSE-EXPAND-W1 — shared coin-symbol overrides, extracted from seed-signals.ts so BOTH
 * the seed loop AND the scan universe fetchers (exchange-universe.ts) canonicalize Binance-family
 * "1000×" meme listings (e.g. `1000PEPE` → `PEPE`). Without this, a delegated seed / scan would emit
 * `1000PEPE`, the signal engine couldn't match it, and the coin would silently drop from coverage.
 *
 * Leaf module — imports NOTHING from seed/scan, so seed-signals.ts and exchange-universe.ts can both
 * depend on it without an import cycle.
 */
export const BINANCE_OVERRIDES: Record<string, string> = {
  '1000PEPE': 'PEPE', '1000SHIB': 'SHIB', '1000FLOKI': 'FLOKI',
  '1000BONK': 'BONK', '1000LUNC': 'LUNC', '1000XEC': 'XEC',
  '1000SATS': 'SATS', '1000RATS': 'RATS', '1000CAT': 'CAT',
  '1000CHEEMS': 'CHEEMS', '1000WHINE': 'WHINE', '1000APU': 'APU',
  '1000X': 'X', '1000MOGCOIN': 'MOGCOIN',
};

/** Canonicalize a bare (uppercase, no quote-suffix) coin symbol via {@link BINANCE_OVERRIDES}. */
export function normalizeBinanceCoin(raw: string): string {
  return BINANCE_OVERRIDES[raw] ?? raw;
}
