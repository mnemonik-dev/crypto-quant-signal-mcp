/**
 * venue-shadow.ts — read-side helpers for the venue lifecycle state machine.
 *
 * EXCHANGE-SHADOW-PROMOTE-W1 / C2. Thin wrappers over venue-store with
 * sensible defaults for envelope + tools/list describe-text consumers:
 *
 *   - getVenueStatus(exchange) → defaults to 'promoted' for unknown venues
 *     (backward-compat: pre-W1 consumers passed `exchange: 'NEWVENUE'` and
 *     expected production behavior; after W1, only `getVenue` consumers see
 *     the shadow state directly).
 *
 *   - describeVenueForToolList(exchange) → returns ' (experimental — shadow mode)'
 *     suffix for shadow venues; empty string for promoted. Consumed at
 *     `tools/list` describe-text-render time.
 *
 * Why a separate module: keeps venue-store.ts pure persistence-layer + lets
 * the envelope hot-path import a leaner surface (no INSERT helpers).
 */

import type { ExchangeId, VenueStatus } from '../types.js';
import { getVenue } from './venue-store.js';

/**
 * Look up the lifecycle status of a venue. Returns `'promoted'` as the
 * backward-compat default for unknown venues (preserves the pre-W1 contract
 * that any string in the Zod enum represented a production venue). Callers
 * who need to distinguish "venue not registered" from "venue is promoted"
 * should call `getVenue(exchange)` directly.
 */
export async function getVenueStatus(exchange: ExchangeId): Promise<VenueStatus> {
  try {
    const v = await getVenue(exchange);
    if (v === null) return 'promoted';
    return v.status;
  } catch (err) {
    // Database errors during the envelope path MUST NOT break the tool
    // response — fail open to 'promoted' so existing-5 callers keep working.
    console.error('[venue-shadow] getVenueStatus failed (defaulting to promoted):', err instanceof Error ? err.message : err);
    return 'promoted';
  }
}

/**
 * Return the per-venue annotation appended to the `tools/list` describe-text
 * for the `exchange` enum. Promoted venues get an empty string; shadow venues
 * get a parenthesized experimental flag.
 *
 * The annotation strategy is per-venue (not per-enum-member) because Zod
 * schema is static at module-load time and can't carry dynamic per-value
 * suffixes inside `.describe()`. Instead, the `tools/list` describe-text
 * carries a STATIC blanket sentence ("Shadow venues … require explicit
 * exchange param") and the DYNAMIC `mcp://algovault/venues` MCP resource
 * exposes the live per-venue table for callers that need to programmatically
 * check status.
 */
export async function describeVenueForToolList(exchange: ExchangeId): Promise<string> {
  const status = await getVenueStatus(exchange);
  if (status === 'shadow') return ' (experimental — shadow mode)';
  return '';
}
