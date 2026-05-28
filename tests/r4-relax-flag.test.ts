import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  R4_DEFAULTS,
  R4_DIRECTION_THRESHOLDS,
  getR4Thresholds,
} from '../src/lib/r4-relax-flag.js';

/**
 * OPS-TRADE-CALL-CLUSTER-W1 CH2 — vitest seam for R4 RELAX 2-flag firewall.
 *
 * Contract:
 *   1. getR4Thresholds() returns R4_DEFAULTS when env unset.
 *   2. returns R4_DEFAULTS when outer flag set + direction unset.
 *   3. returns R4_DEFAULTS when outer set + direction invalid.
 *   4. returns buy-revert thresholds {2.0, -2.0} when direction=buy-revert.
 *   5. returns sell-revert thresholds {2.5, -2.5} when direction=sell-revert.
 *   6. returns both-soften thresholds {2.25, -2.25} when direction=both-soften.
 */
describe('r4-relax-flag', () => {
  const originalEnabled = process.env.ENABLE_R4_RELAX;
  const originalDirection = process.env.R4_RELAX_DIRECTION;

  beforeEach(() => {
    delete process.env.ENABLE_R4_RELAX;
    delete process.env.R4_RELAX_DIRECTION;
  });

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.ENABLE_R4_RELAX;
    } else {
      process.env.ENABLE_R4_RELAX = originalEnabled;
    }
    if (originalDirection === undefined) {
      delete process.env.R4_RELAX_DIRECTION;
    } else {
      process.env.R4_RELAX_DIRECTION = originalDirection;
    }
  });

  it('returns R4_DEFAULTS when env unset (fallback = zero behavioral change)', () => {
    const t = getR4Thresholds();
    expect(t).toEqual(R4_DEFAULTS);
    expect(t.buyPenaltyZ).toBe(2.5);
    expect(t.sellSofteningZ).toBe(-2.0);
  });

  it('returns R4_DEFAULTS when ENABLE_R4_RELAX=1 but R4_RELAX_DIRECTION unset', () => {
    process.env.ENABLE_R4_RELAX = '1';
    expect(getR4Thresholds()).toEqual(R4_DEFAULTS);
  });

  it('returns R4_DEFAULTS when direction is invalid', () => {
    process.env.ENABLE_R4_RELAX = '1';
    process.env.R4_RELAX_DIRECTION = 'nonsense-direction';
    expect(getR4Thresholds()).toEqual(R4_DEFAULTS);
  });

  it('returns buy-revert thresholds {2.0, -2.0} when direction=buy-revert', () => {
    process.env.ENABLE_R4_RELAX = '1';
    process.env.R4_RELAX_DIRECTION = 'buy-revert';
    expect(getR4Thresholds()).toEqual(R4_DIRECTION_THRESHOLDS['buy-revert']);
    expect(getR4Thresholds().buyPenaltyZ).toBe(2.0);
    expect(getR4Thresholds().sellSofteningZ).toBe(-2.0);
  });

  it('returns sell-revert thresholds {2.5, -2.5} when direction=sell-revert (Plan-Mode recommended (ii))', () => {
    process.env.ENABLE_R4_RELAX = '1';
    process.env.R4_RELAX_DIRECTION = 'sell-revert';
    expect(getR4Thresholds()).toEqual(R4_DIRECTION_THRESHOLDS['sell-revert']);
    expect(getR4Thresholds().buyPenaltyZ).toBe(2.5);
    expect(getR4Thresholds().sellSofteningZ).toBe(-2.5);
  });

  it('returns both-soften thresholds {2.25, -2.25} when direction=both-soften', () => {
    process.env.ENABLE_R4_RELAX = '1';
    process.env.R4_RELAX_DIRECTION = 'both-soften';
    expect(getR4Thresholds()).toEqual(R4_DIRECTION_THRESHOLDS['both-soften']);
    expect(getR4Thresholds().buyPenaltyZ).toBe(2.25);
    expect(getR4Thresholds().sellSofteningZ).toBe(-2.25);
  });
});
