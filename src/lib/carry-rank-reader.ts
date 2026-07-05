/**
 * EDGE-CARRY-SERVING-W1 — fresh carry-ranker scores for scan_funding_arb ordering (DARK consumer).
 *
 * Contract (frozen by the wave prompt):
 *   - staleness: rows with scored_at older than 3h are ranker-UNAVAILABLE → caller keeps legacy
 *     order; the outage is logged ONCE per episode (max 1 forensic line/hour), never thrown.
 *   - FAIL-OPEN ALWAYS: any read error → null. This module must never throw into the tool path.
 *   - 30s TTL module cache (the scan is hit every 1-2 min by monitors; scores refresh hourly).
 *
 * Data Integrity: scores are INTERNAL model output; they influence ORDERING only (and only when
 * the two-flag firewall is ON) — never a response field.
 */
import { dbQuery } from './performance-db.js';

export interface CarryScores {
  byVenueSymbol: Map<string, number>;
  artifactVersion: string;
  scoredCount: number;
}

const CACHE_TTL_MS = 30_000;
const STALE_LOG_INTERVAL_MS = 3_600_000;

let cache: { at: number; value: CarryScores | null } | null = null;
let staleLoggedAt = 0;

// Test seam (project convention — matches _setLiquidityOverrideForTest): set undefined to restore
// live reads; null simulates ranker-unavailable; a CarryScores object injects fixture scores.
let _override: CarryScores | null | undefined;
export function _setCarryScoresForTest(v: CarryScores | null | undefined): void {
  _override = v;
  cache = null;
  staleLoggedAt = 0;
}

export const carryKey = (exchangeId: string, coin: string): string => `${exchangeId}|${coin}`;

export async function getFreshCarryScores(): Promise<CarryScores | null> {
  if (_override !== undefined) return _override;
  const now = Date.now();
  if (cache && now - cache.at <= CACHE_TTL_MS) return cache.value;
  let value: CarryScores | null = null;
  try {
    const rows = await dbQuery<{ venue: string; symbol: string; score: number; artifact_version: string }>(
      `SELECT venue, symbol, score::float AS score, artifact_version
       FROM carry_rank_scores
       WHERE scored_at > now() - interval '3 hours'`,
    );
    if (rows.length > 0) {
      const m = new Map<string, number>();
      for (const r of rows) m.set(carryKey(r.venue, r.symbol), Number(r.score));
      value = { byVenueSymbol: m, artifactVersion: String(rows[0].artifact_version), scoredCount: rows.length };
    } else if (now - staleLoggedAt > STALE_LOG_INTERVAL_MS) {
      staleLoggedAt = now;
      console.log('[carry-rank-reader] ranker-unavailable (no rows fresher than 3h) — legacy order');
    }
  } catch (e) {
    if (now - staleLoggedAt > STALE_LOG_INTERVAL_MS) {
      staleLoggedAt = now;
      console.log(`[carry-rank-reader] ranker-unavailable (read error: ${String((e as Error).message ?? e).slice(0, 120)}) — legacy order`);
    }
    value = null; // fail-open ALWAYS
  }
  cache = { at: now, value };
  return value;
}
