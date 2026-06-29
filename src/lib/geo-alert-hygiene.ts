/**
 * OPS-GEO-PROBE-SIGNIFICANCE-GATE-W1 — the GEO alert-hygiene significance gate.
 *
 * PURE leaf module (no DB, no Telegram, no Date, no fs). The ONE place the
 * SLIPPING / WoW-WARNING gate is computed — imported by BOTH the digest verdict
 * (`geo-digest.ts::computeMomentum`) and the dashboard WoW path
 * (`geo-dashboard.ts::renderGeoDashboardHtml`), and by the cron that fires the
 * Telegram alert. Single-derivation across rendered surfaces: every surface
 * projects from this verdict, so the header emoji, the dashboard banner, and the
 * TG alarm can never contradict (and never re-implement the threshold inline).
 *
 * WHY: LLM retrieval is non-deterministic (published noise floor ≈16%; the same
 * prompt cites different sources in <30% of identical re-runs) and median
 * time-to-first-citation is ~7d (P90 ~37d). A single >20% week-over-week dip on a
 * tiny per-engine sample is NOISE, not signal. The monitoring contract is "fire on
 * sustained/accumulating drift, NOT single-sample breaches" — so 🔴 SLIPPING (and
 * its operator-action Telegram WARNING) requires ALL THREE gates:
 *   1. sample floor   — the baseline week has ≥ minBaselineCitations cited answers
 *   2. relative-drop  — the decline is ≥ minRelativeDrop (hard floor 0.16, never lower)
 *   3. consecutive    — ≥ consecutiveDownCycles consecutive weeks each clearing 1+2
 * Below any gate → HOLDING with a reason; the raw weekly numbers are still SHOWN
 * by the consumers (we gate the ALARM, never hide the data).
 *
 * Policy lives in landing/Prompt/geo-objective.yaml `alert_hygiene` (static config,
 * zero live numbers) and is resolved via `resolveAlertHygiene`.
 */

/** Resolved gate config (camelCase; consumed by isSignificantDecline). */
export interface AlertHygieneConfig {
  /** the baseline (prior) week must have ≥ this many cited answers to judge a drop. */
  minBaselineCitations: number;
  /** minimum relative week-over-week decline that counts as a down-cycle (≥, not >). */
  minRelativeDrop: number;
  /** number of consecutive down-cycles (each clearing the floors) required for SLIPPING. */
  consecutiveDownCycles: number;
}

/** The raw `alert_hygiene` block as parsed from geo-objective.yaml (snake_case). */
export interface AlertHygieneRaw {
  min_baseline_citations?: number;
  min_relative_drop?: number;
  consecutive_down_cycles?: number;
}

/**
 * The research noise floor (~16% — same prompt cites different sources in <30% of
 * identical re-runs). The configured relative-drop may RAISE above this, never lower
 * below it: a gate that fires on <16% drops is firing on documented retrieval noise.
 */
export const ALERT_HYGIENE_HARD_FLOOR = 0.16;

export const DEFAULT_ALERT_HYGIENE: AlertHygieneConfig = {
  minBaselineCitations: 5,
  minRelativeDrop: 0.2,
  consecutiveDownCycles: 2,
};

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Resolve the objective's `alert_hygiene` block into a config. Default-denies on
 * missing / NaN / non-finite input (falls back to the safe defaults) and clamps the
 * relative-drop UP to the 0.16 hard floor — config may tighten the gate, never soften
 * it below the noise floor.
 */
export function resolveAlertHygiene(raw?: AlertHygieneRaw | null): AlertHygieneConfig {
  return {
    minBaselineCitations: finiteOr(raw?.min_baseline_citations, DEFAULT_ALERT_HYGIENE.minBaselineCitations),
    minRelativeDrop: Math.max(
      ALERT_HYGIENE_HARD_FLOOR,
      finiteOr(raw?.min_relative_drop, DEFAULT_ALERT_HYGIENE.minRelativeDrop),
    ),
    consecutiveDownCycles: finiteOr(raw?.consecutive_down_cycles, DEFAULT_ALERT_HYGIENE.consecutiveDownCycles),
  };
}

export interface SignificanceVerdict {
  /** true ⇒ the consumer renders 🔴 SLIPPING / the red banner / fires the TG WARNING. */
  slipping: boolean;
  /** human reason — the HOLDING explanation, or the sustained-decline summary. */
  reason: string;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * The gate. `history` = weekly cited-answer counts, MOST-RECENT-FIRST
 * (h[0] = this week, h[1] = last week, h[2] = two weeks ago, …). Reads the most
 * recent `consecutiveDownCycles` transitions (needs consecutiveDownCycles + 1 points
 * to ever return slipping).
 *
 * Returns slipping:true ONLY when every one of the last `consecutiveDownCycles`
 * weeks is a down-cycle clearing both the sample floor and the relative-drop floor;
 * otherwise slipping:false with a reason naming exactly which gate held it
 * (low sample / within noise / N down-weeks watching).
 */
export function isSignificantDecline(history: number[], cfg: AlertHygieneConfig): SignificanceVerdict {
  const drop = Math.max(ALERT_HYGIENE_HARD_FLOOR, cfg.minRelativeDrop);
  const need = Math.max(1, Math.floor(cfg.consecutiveDownCycles));
  const floor = cfg.minBaselineCitations;
  const h = (history ?? []).map((x) => (Number.isFinite(x) ? x : 0));

  if (h.length < 2) {
    return { slipping: false, reason: 'no prior-week baseline yet' };
  }

  const baseline = h[1]; // last week — the most-recent transition's baseline
  const current = h[0]; // this week

  // Gate 1 — sample floor on the most-recent baseline (kills tiny-n noise, e.g. 2→0).
  if (baseline < floor) {
    return { slipping: false, reason: `low sample (n=${baseline})` };
  }
  // Gate 2 — relative-drop floor on the most-recent week (below it, not even a down-cycle).
  const rel = baseline > 0 ? (baseline - current) / baseline : 0;
  if (rel < drop) {
    return { slipping: false, reason: `within noise (${pct(rel)} drop < ${pct(drop)})` };
  }

  // The most-recent week is a significant down-cycle. Count consecutive down-cycles —
  // each clearing BOTH floors — ending at this week.
  let consec = 0;
  for (let i = 0; i < need; i++) {
    const b = h[i + 1];
    const c = h[i];
    if (b === undefined || c === undefined) break; // ran out of history
    if (b < floor) break; // per-cycle sample floor
    if ((b > 0 ? (b - c) / b : 0) < drop) break; // per-cycle relative-drop floor
    consec++;
  }

  if (consec >= need) {
    return {
      slipping: true,
      reason: `sustained decline over ${consec} consecutive week${consec === 1 ? '' : 's'} ≥${pct(drop)} each (baseline ≥${floor})`,
    };
  }
  return {
    slipping: false,
    reason: `${consec} down-week${consec === 1 ? '' : 's'}, watching (need ${need} consecutive)`,
  };
}
