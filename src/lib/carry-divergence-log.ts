/**
 * EDGE-CARRY-SERVING-W2 — durable carry-divergence evidence.
 *
 * W1 logged the flip evidence to stdout only; every deploy recreates the container and wipes it, so
 * a multi-day evidence window could not be reconstructed ("flipping half-blind"). This persists the
 * SAME per-scan reading into `carry_divergence_log` so it survives deploys.
 *
 * Contract (frozen by the wave prompt + architect ratification):
 *   - FIRE-AND-FORGET: callers MUST NOT await this in the tool path; it NEVER throws.
 *   - Load-bearing logging: on the FIRST write failure per PROCESS it emits ONE `console.warn`; a
 *     MONOTONIC `dropped_count` (cumulative failures this process) is carried into the payload of
 *     the next SUCCESSFUL row — never total silence, never per-scan noise.
 *   - Data Integrity: scores/divergence are INTERNAL model output; this table is never exposed.
 */
import { dbQuery } from './performance-db.js';

export interface DivergenceRow {
  venueScope: string;      // active CARRY_RANKER_VENUES allowlist at scan-time ("" = re-rank nowhere)
  n: number;
  nScored: number;         // full-reach: coins with any fresh score (the evidence denominator)
  tau: number;
  top5Overlap: string;     // "a/b"
  applied: boolean;        // did the response order actually change (three-key on AND scoped reorder)
  payload: Record<string, unknown>; // the full [carry-divergence] JSON (dropped_count appended here)
}

let writeFailWarned = false;
let droppedCount = 0;

/** Test seam: read current failure-tracking state. */
export function _divergenceLogStateForTest(): { droppedCount: number; warned: boolean } {
  return { droppedCount, warned: writeFailWarned };
}
/** Test seam: reset failure-tracking state between cases. */
export function _resetDivergenceLogStateForTest(): void {
  writeFailWarned = false;
  droppedCount = 0;
}

/**
 * Persist one divergence reading. Fire-and-forget: `void writeDivergenceLog(...)` — do not await.
 * Any error is swallowed; the first per-process failure warns once and increments a monotonic
 * dropped_count that the next successful row reports.
 */
export async function writeDivergenceLog(row: DivergenceRow): Promise<void> {
  try {
    await dbQuery(
      `INSERT INTO carry_divergence_log
         (scan_ts, venue_scope, n, n_scored, tau, top5_overlap, applied, payload)
       VALUES (now(), $1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        row.venueScope,
        row.n,
        row.nScored,
        row.tau,
        row.top5Overlap,
        row.applied,
        JSON.stringify({ ...row.payload, dropped_count: droppedCount }),
      ],
    );
  } catch (e) {
    droppedCount += 1;
    if (!writeFailWarned) {
      writeFailWarned = true;
      console.warn(
        `[carry-divergence-log] durable write failed (fires ONCE per process; dropped_count now ${droppedCount}): ${String((e as Error).message ?? e).slice(0, 160)}`,
      );
    }
  }
}
