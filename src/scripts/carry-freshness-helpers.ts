/**
 * EDGE-CARRY-RANKER-W1 CH2 — pure helpers for the nightly label-freshness cadence.
 * Leaf module (no imports) so unit tests touch zero adapter/DB side effects
 * (same pattern as funding-episode-builder.ts).
 */

const H_MS = 3600_000;

/** Incremental raw start: resume 2 intervals before the stored max (ON CONFLICT dedupes the overlap);
 *  a symbol with no stored history forward-accumulates from a bounded lookback (survivorship cure),
 *  NEVER a deep re-backfill — deep history for newly-promoted symbols is an explicit backfill decision. */
export function checkpointStartMs(
  maxTsMs: number | null,
  intervalHours: number,
  earliest: number | null,
  nowMs: number,
  lookbackDays: number,
): number {
  if (maxTsMs != null && Number.isFinite(maxTsMs)) return Math.max(maxTsMs - 2 * intervalHours * H_MS, earliest ?? 0);
  const lb = nowMs - lookbackDays * 24 * H_MS;
  return earliest != null ? Math.max(lb, earliest) : lb;
}

/** Episode upsert conflict clause — censored (exit_reason='data_end') rows may be re-closed as new data
 *  extends them; genuinely-closed episodes (sign_flip/decay/horizon) are immutable. Entry-side columns
 *  (entry_ts/entry_sign/entry_floor_apr/cluster_week/source) are NEVER updated. */
export function episodesConflictClause(recloseCensored: boolean): string {
  if (!recloseCensored) return 'ON CONFLICT (venue,symbol,entry_ts,entry_floor_apr) DO NOTHING';
  return `ON CONFLICT (venue,symbol,entry_ts,entry_floor_apr) DO UPDATE SET
    exit_ts=EXCLUDED.exit_ts, held_intervals=EXCLUDED.held_intervals,
    gross_carry=EXCLUDED.gross_carry, rt_cost=EXCLUDED.rt_cost, net_carry=EXCLUDED.net_carry,
    gross_apr=EXCLUDED.gross_apr, net_apr=EXCLUDED.net_apr,
    exit_reason=EXCLUDED.exit_reason, net_positive=EXCLUDED.net_positive, built_at=now()
    WHERE funding_episodes.exit_reason='data_end'`;
}
