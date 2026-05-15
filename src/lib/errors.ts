/**
 * Typed error classes for upstream-API failures (v1.10.2).
 *
 * Why typed: the previous generic `Error("HL API 429: Too Many Requests")` shape
 * surfaced to MCP clients as `{error: "HL API 429: ..."}` with no machine-
 * readable classification. Clients couldn't distinguish "AlgoVault MCP is down"
 * from "Hyperliquid is rate-limiting us; try Binance" — both looked like
 * generic `isError: true` tool responses. Typed errors let the MCP envelope
 * (src/index.ts tool handler) emit a structured fault payload with
 * `error_code`, `exchange`, `retry_after_seconds`, and a `suggestion`
 * (alternative exchanges to fall back to).
 *
 * The error-code namespace is open: add new classes here when a new failure
 * mode needs first-class client-side handling.
 */

/**
 * Thrown by an exchange adapter when the upstream API returns HTTP 429
 * (or its semantic equivalent). The MCP tool handler catches this specifically
 * and emits a structured response that lets agents auto-fallback to a different
 * exchange instead of giving up.
 */
export class UpstreamRateLimitError extends Error {
  /** Stable machine-readable code. Pin this — clients pattern-match on it. */
  readonly code = 'UPSTREAM_RATE_LIMIT' as const;
  /** Exchange display name (Hyperliquid, Binance, Bybit, OKX, Bitget). */
  readonly exchange: string;
  /** Wall-clock seconds the upstream told us to wait (`Retry-After` header), or null if absent. */
  readonly retryAfterSeconds: number | null;

  constructor(exchange: string, retryAfterSeconds: number | null = null) {
    super(`${exchange} API rate-limited (429); upstream is temporarily refusing requests`);
    this.exchange = exchange;
    this.retryAfterSeconds = retryAfterSeconds;
    // Restore prototype chain for `instanceof` to work after transpile (Node CJS).
    Object.setPrototypeOf(this, UpstreamRateLimitError.prototype);
  }
}

/**
 * Thrown by `getTradeSignal` / `getMarketRegime` when the AlgoVault-canonical
 * TradFi symbol is not listed on the requested CEX. The MCP tool handler
 * emits a structured response with `suggested_venues` so an LLM agent can
 * pattern-match on `error_code === "TRADFI_SYMBOL_UNSUPPORTED_ON_VENUE"`
 * and self-retry against one of the supported venues. Added in
 * TRADFI-SYMBOL-ALIAS-W1 (v1.11.1) after CHANGE-DEFAULT-EXCHANGE-W1's probe
 * surfaced `GOLD/BINANCE → 400 Bad Request` as a confusing raw upstream
 * error.
 */
export class TradFiSymbolUnsupportedOnVenueError extends Error {
  readonly code = 'TRADFI_SYMBOL_UNSUPPORTED_ON_VENUE' as const;
  readonly coin: string;
  readonly requestedExchange: string;
  readonly suggestedVenues: string[];
  readonly probedAt: string;

  constructor(coin: string, requestedExchange: string, suggestedVenues: string[], probedAt: string) {
    super(`${coin} is not listed on ${requestedExchange} as of ${probedAt}. Supported venues for ${coin}: ${suggestedVenues.join(', ')}.`);
    this.coin = coin;
    this.requestedExchange = requestedExchange;
    this.suggestedVenues = suggestedVenues;
    this.probedAt = probedAt;
    Object.setPrototypeOf(this, TradFiSymbolUnsupportedOnVenueError.prototype);
  }
}

/**
 * Map of which exchanges to suggest as fallbacks when one is rate-limited.
 * Used by the MCP tool handler to populate the `suggestion` field of the
 * structured error response.
 */
export const EXCHANGE_FALLBACKS: Record<string, string[]> = {
  Hyperliquid: ['BINANCE', 'BYBIT', 'OKX', 'BITGET'],
  Binance:     ['HL', 'BYBIT', 'OKX', 'BITGET'],
  Bybit:       ['HL', 'BINANCE', 'OKX', 'BITGET'],
  OKX:         ['HL', 'BINANCE', 'BYBIT', 'BITGET'],
  Bitget:      ['HL', 'BINANCE', 'BYBIT', 'OKX'],
};
