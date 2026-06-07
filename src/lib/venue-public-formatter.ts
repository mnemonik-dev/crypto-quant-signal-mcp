/**
 * venue-public-formatter.ts — OPS-AUDIT-REMEDIATION-MED-W1 R1 (SV-01).
 *
 * EXPORTED pure allow-list formatters shared by the TWO public venue surfaces:
 *   - the `/api/performance-shadow` HTTP handler (src/index.ts)
 *   - the `mcp://algovault/venues` MCP resource (src/index.ts)
 *
 * The security audit (SECURITY-AUDIT-RECENT-FEATURES-W1 / SV-01) found both
 * surfaces leaked the INTERNAL promotion threshold `min_buy_sell_sample` and
 * the `last_eval_*` evaluation internals. These formatters redact them at a
 * SINGLE source so both surfaces inherit the redaction — and, critically, the
 * output object is built by listing ONLY the allow-listed keys. A forbidden key
 * is never read into the result, so the allow-list is enforced BY CONSTRUCTION
 * (the strongest form — a future field added to VenueRecord cannot silently
 * leak through a deny-list filter).
 *
 * `VENUE_FORBIDDEN_KEYS` is the deny-set the shape-snapshots + unit tests assert
 * ABSENT on both surfaces. `outcome_return_pct` is included defensively (it is
 * the Phase-E internal-only field per CLAUDE.md Data Integrity LAW; it never
 * appears in a VenueRecord, but pinning it here documents the contract).
 */
import type { VenueRecord, PerformanceStats } from '../types.js';

/**
 * Keys that MUST NEVER appear on either public venue surface
 * (`/api/performance-shadow` or `mcp://algovault/venues`):
 *   - min_buy_sell_sample          — internal promotion-gate threshold (SV-01)
 *   - last_eval_at / _pfe_wr /
 *     _buy_sell_count              — internal evaluation internals (SV-01)
 *   - outcome_return_pct           — Phase-E internal-only (Data Integrity LAW)
 *
 * Asserted ABSENT by the shape-snapshots + the SV-01 unit tests. The formatters
 * below enforce this BY CONSTRUCTION (never reading a forbidden key into the
 * output), so this list is a contract assertion, not a runtime filter.
 */
export const VENUE_FORBIDDEN_KEYS = [
  'min_buy_sell_sample',
  'last_eval_at',
  'last_eval_pfe_wr',
  'last_eval_buy_sell_count',
  'outcome_return_pct',
] as const;

export type VenueForbiddenKey = (typeof VENUE_FORBIDDEN_KEYS)[number];

/** Per-exchange aggregate slice (matches PerformanceStats.byExchange[ex]). */
type ExchangeAgg = PerformanceStats['byExchange'][string];

/** The public per-venue shape served by `/api/performance-shadow`. */
export interface ShadowVenuePublic {
  exchange_id: string;
  status: VenueRecord['status'];
  asset_count: number;
  integrated_at: string;
  days_since_integration: number;
  extension_count: number;
  current_buy_sell_count: number;
  current_pfe_wr: number | null;
  byTimeframe: ExchangeAgg['byTimeframe'];
  byTier: ExchangeAgg['byTier'];
  byCallType: ExchangeAgg['byCallType'];
}

/** The public per-venue shape served by the `mcp://algovault/venues` resource. */
export interface VenueResourcePublic {
  exchange_id: string;
  status: VenueRecord['status'];
  asset_count: number;
  integrated_at: string;
  promoted_at: string | null;
  retired_at: string | null;
  extension_count: number;
  notes: string | null;
}

/**
 * Build the `/api/performance-shadow` per-venue object — the prior shape MINUS
 * the VENUE_FORBIDDEN_KEYS. `ex` is the matching `byExchange[exchange_id]`
 * aggregate (or null when the venue has no signals yet). Allow-list by
 * construction: only the permitted keys are read into the result.
 */
export function formatShadowVenuePublic(
  v: VenueRecord,
  ex: ExchangeAgg | null | undefined,
  nowSec: number,
): ShadowVenuePublic {
  const integratedSec = Math.floor(new Date(v.integrated_at).getTime() / 1000);
  return {
    exchange_id: v.exchange_id,
    status: v.status,
    asset_count: v.asset_count,
    integrated_at: v.integrated_at,
    days_since_integration: Math.floor((nowSec - integratedSec) / 86400),
    extension_count: v.extension_count,
    // Mirror the per-venue aggregate shape from byExchange (when stats include
    // the venue; some shadow venues may not yet have signals).
    current_buy_sell_count: ex?.count ?? 0,
    current_pfe_wr: ex?.pfeWinRate ?? null,
    byTimeframe: ex?.byTimeframe ?? {},
    byTier: ex?.byTier ?? {},
    byCallType: ex?.byCallType ?? {},
  };
}

/**
 * Build the `mcp://algovault/venues` per-venue object — the prior shape MINUS
 * the VENUE_FORBIDDEN_KEYS (drops `min_buy_sell_sample` + `last_eval_*`). The
 * resource stays publicly readable; it is only stripped of internal fields.
 * Allow-list by construction.
 */
export function formatVenueForResource(v: VenueRecord): VenueResourcePublic {
  return {
    exchange_id: v.exchange_id,
    status: v.status,
    asset_count: v.asset_count,
    integrated_at: v.integrated_at,
    promoted_at: v.promoted_at,
    retired_at: v.retired_at,
    extension_count: v.extension_count,
    notes: v.notes,
  };
}
