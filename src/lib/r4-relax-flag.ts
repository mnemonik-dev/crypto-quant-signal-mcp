/**
 * r4-relax-flag.ts
 *
 * OPS-TRADE-CALL-CLUSTER-W1 CH2 — R4 BUY-favoring inversion partial-revert
 * behind 2-flag firewall.
 *
 * Per OPS-TRADE-CALL-CALIBRATION-AUDIT-W1 verdict = RELAX (BUY edge +3.17pp
 * PFE-WR, between 0 and +5pp KEEP threshold). Architect-ratified direction at
 * Plan-Mode (Plan recommended + architect picked direction (ii) SELL-side
 * revert — addresses structural BUY:SELL imbalance 705:1 / 430:1 directly
 * by RAISING SELL counts without touching BUY firing).
 *
 * 2-flag firewall mirroring CH1 pattern:
 *   - outer: process.env.ENABLE_R4_RELAX === '1'
 *   - inner: process.env.R4_RELAX_DIRECTION ∈ {buy-revert, sell-revert, both-soften}
 *
 * Both unset on first deploy → fallback to current R4-on thresholds
 * {buyPenaltyZ: 2.5, sellSofteningZ: -2.0} (zero behavioral change).
 *
 * Direction enum:
 *   buy-revert    → {buyPenaltyZ: 2.0, sellSofteningZ: -2.0}  // (i) BUY-side revert
 *   sell-revert   → {buyPenaltyZ: 2.5, sellSofteningZ: -2.5}  // (ii) SELL-side revert (Plan-recommended)
 *   both-soften   → {buyPenaltyZ: 2.25, sellSofteningZ: -2.25} // (iii) symmetric softening
 *
 * Consumed by `getR4Thresholds()` helper at src/tools/get-trade-call.ts L298+L302
 * Z-Score gate constants.
 */

export type R4RelaxDirection = 'buy-revert' | 'sell-revert' | 'both-soften';

export interface R4Thresholds {
  /** Z-Score above which BUY direction gets penalized (rawScore -= 20). */
  buyPenaltyZ: number;
  /** Z-Score below which SELL direction gets softened (rawScore += 20). */
  sellSofteningZ: number;
}

/** Current R4-on thresholds (fallback when flags unset). */
export const R4_DEFAULTS: R4Thresholds = {
  buyPenaltyZ: 2.5,
  sellSofteningZ: -2.0,
};

/** Per-direction threshold map. */
export const R4_DIRECTION_THRESHOLDS: Record<R4RelaxDirection, R4Thresholds> = {
  'buy-revert':  { buyPenaltyZ: 2.0,  sellSofteningZ: -2.0  },
  'sell-revert': { buyPenaltyZ: 2.5,  sellSofteningZ: -2.5  },
  'both-soften': { buyPenaltyZ: 2.25, sellSofteningZ: -2.25 },
};

/**
 * R4 threshold lookup behind 2-flag firewall.
 *
 *   getR4Thresholds()
 *     → R4_DEFAULTS when ENABLE_R4_RELAX !== '1' OR R4_RELAX_DIRECTION unset/invalid
 *     → R4_DIRECTION_THRESHOLDS[direction] when both env vars set
 */
export function getR4Thresholds(): R4Thresholds {
  if (process.env.ENABLE_R4_RELAX !== '1') return R4_DEFAULTS;
  const direction = process.env.R4_RELAX_DIRECTION as R4RelaxDirection | undefined;
  if (!direction || !(direction in R4_DIRECTION_THRESHOLDS)) return R4_DEFAULTS;
  return R4_DIRECTION_THRESHOLDS[direction];
}
