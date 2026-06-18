/**
 * Activation quota-nudge thresholds (single source of truth).
 *
 * ACTIVATION-NUDGE-W1 (2026-06-18): extracted from `tier-warning.ts` so the
 * upgrade_hint MESSAGE (license.ts `getUpgradeHint`) and the structured
 * `tier_warning` band + `quota_hit_soft` event (tier-warning.ts `withTierWarning`)
 * derive the SAME soft threshold from ONE constant — they previously diverged
 * (message ≥0.80, event ≥0.75). Architect-ratified A1: SOFT retuned 0.75→0.80 so
 * `quota_hit_soft` truthfully means "the soft nudge was actually shown". HARD
 * stays 0.90. North-Star-safe — a message threshold, well before the 100% gate.
 *
 * Pure constants module (NO imports) so both `license.ts` and `tier-warning.ts`
 * can import it without an import cycle (tier-warning.ts already imports
 * `getRequestSessionId` from license.ts).
 */

/** Free-tier monthly-quota ratio at/above which the soft upgrade nudge fires. */
export const SOFT_THRESHOLD = 0.80;

/** Ratio at/above which the structured `tier_warning` escalates to `level:'hard'`. */
export const HARD_THRESHOLD = 0.90;
