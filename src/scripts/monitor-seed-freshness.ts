/**
 * monitor-seed-freshness.ts — OPS-SEED-ORCHESTRATOR-W1 / CH2
 *
 * Pure venue-freshness evaluator for the monitor's critical cycle. Given each
 * promoted venue's most-recent signal timestamp (epoch-MS), decides which
 * venues have gone stale (no new signal within `thresholdMin`). Venue-table-
 * driven: a freshly-promoted venue inherits this monitoring for free. Never
 * pages on a venue that has never produced a signal — it is reported with a
 * sentinel until its first signal exists (mirrors evaluatePfeWinRate's
 * report-not-page posture).
 *
 * The monitor (monitor.ts::checkSeedFreshness) wires the DB query + the
 * consecutive-gated alert path; this module is pure and unit-tested in isolation.
 */

export interface SeedFreshnessRow {
  /** Venue id (signals.exchange), e.g. 'HL', 'BINANCE'. */
  exchange: string;
  /** Epoch-MS of the venue's most recent signal, or null if it has none yet. */
  lastCreatedAtMs: number | null;
}

export interface SeedFreshnessVerdict {
  venue: string;
  /** Minutes since the venue's last signal; -1 sentinel when it has none yet. */
  staleMin: number;
  /** true ⇔ paged-worthy: a venue WITH signals whose newest is ≥ thresholdMin old. */
  stale: boolean;
}

/**
 * R2.1 — pure freshness verdict. `nowMs` and each row's `lastCreatedAtMs` are
 * epoch-MS (the caller converts the DB's epoch-seconds `created_at`). A venue
 * with `lastCreatedAtMs === null` (no signal ever) is reported with staleMin=-1
 * and stale=false: it MUST NOT page until it has produced a first signal.
 */
export function evaluateSeedFreshness(
  rows: SeedFreshnessRow[],
  nowMs: number,
  thresholdMin = 45,
): SeedFreshnessVerdict[] {
  return rows.map((r) => {
    if (r.lastCreatedAtMs == null) {
      return { venue: r.exchange, staleMin: -1, stale: false };
    }
    const staleMin = Math.round((nowMs - r.lastCreatedAtMs) / 60_000);
    return { venue: r.exchange, staleMin, stale: staleMin >= thresholdMin };
  });
}

/**
 * OPS-SEED-FRESHNESS-W1 — build evaluator rows from the promoted venue list + the
 * cross-TF heartbeat rows (getLatestSeedHeartbeatPerVenue). Each promoted venue gets
 * its freshest ATTEMPT (epoch SECONDS → ×1000 ms, mirroring checkSeedFreshness); a
 * promoted venue with NO heartbeat row → null (report-not-page bootstrap — a new
 * venue inherits paging only once it has been attempted). Pure (no imports).
 */
export function buildSeedFreshnessRows(
  promotedIds: string[],
  heartbeats: { exchange: string; last_attempt_at: number | null }[],
): SeedFreshnessRow[] {
  const byVenue = new Map(heartbeats.map((h) => [h.exchange, h.last_attempt_at]));
  return promotedIds.map((exchange) => {
    const la = byVenue.get(exchange);
    return { exchange, lastCreatedAtMs: la != null ? Number(la) * 1000 : null };
  });
}

/**
 * OPS-SEED-FRESHNESS-W1 — page string for a seed OUTAGE (any stale venue), else null.
 * Symptom-only; names ONLY the stale venue(s) + staleMin + a cause hint. NO hardcoded
 * W<N> wave id (recommendation-drift-canary rule). Pages only on a sustained ≥45-min
 * attempt outage (the monitor's consecutive-3 ~6-min gate sits on top).
 */
export function formatSeedOutagePage(verdicts: SeedFreshnessVerdict[]): string | null {
  const stale = verdicts.filter((v) => v.stale);
  if (stale.length === 0) return null;
  const detail = stale.map((v) => `${v.venue} ${v.staleMin}m`).join(', ');
  return `Seed OUTAGE: no seed fire reached ${detail} in ≥45m — cron/container/DB-write outage (silent data-flywheel stall)`;
}
