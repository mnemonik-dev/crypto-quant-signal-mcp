/**
 * REFERRAL-INPRODUCT-NUDGE-W1 trigger (c) — usage-milestone aha referral.
 *
 * Verifies `recordAhaMilestoneCrossing`: it fires EXACTLY when the per-user
 * monthly billable-call count hits a configured milestone, and is LIFETIME-deduped
 * thereafter via the `milestone_referral_shown` column on the EXISTING quota_usage
 * store (survives the monthly reset). SQLite-only (real local DB); skipped when
 * DATABASE_URL is set. Unique tracker keys per assertion + cleanup so the local
 * accumulated DB never bleeds across runs.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  recordAhaMilestoneCrossing,
  MILESTONE_REFERRAL_VALUES,
  trackCallByKey,
  initQuotaDb,
  ensureQuotaMilestoneColumn,
  _resetMilestoneColInitForTest,
} from '../src/lib/license.js';
import { dbRun } from '../src/lib/performance-db.js';

const SKIP = !!process.env.DATABASE_URL;
const usedKeys: string[] = [];
function freshKey(label: string): string {
  const k = `mtest-${label}-${Date.now()}-${Math.floor(performance.now() * 1000)}`;
  usedKeys.push(k);
  return k;
}

describe.skipIf(SKIP)('recordAhaMilestoneCrossing (trigger c)', () => {
  beforeAll(async () => {
    initQuotaDb();
    _resetMilestoneColInitForTest();
    await ensureQuotaMilestoneColumn(); // guarantee the column on an older local DB
  });
  afterEach(() => {
    for (const k of usedKeys.splice(0)) {
      try { dbRun('DELETE FROM quota_usage WHERE tracker_key = ?', k); } catch { /* best-effort */ }
    }
  });

  it('exposes the configured milestones [25, 50]', () => {
    expect([...MILESTONE_REFERRAL_VALUES]).toEqual([25, 50]);
  });

  it('fires once at a milestone crossing, then is lifetime-deduped', async () => {
    const key = freshKey('fire');
    trackCallByKey(key, 'free', 25); // seed in-memory + persisted count to exactly 25
    const license = { tier: 'free' as const, key };

    expect(await recordAhaMilestoneCrossing(license)).toBe(25); // crosses milestone 25
    expect(await recordAhaMilestoneCrossing(license)).toBeNull(); // lifetime-deduped (persisted)
  });

  it('does NOT fire between milestones (exact-equality gate)', async () => {
    const key = freshKey('nofire');
    trackCallByKey(key, 'free', 24); // 24 ∉ {25, 50}
    expect(await recordAhaMilestoneCrossing({ tier: 'free', key })).toBeNull();
  });

  it('fires again at the NEXT milestone (50) for a user already shown 25', async () => {
    const key = freshKey('next');
    const license = { tier: 'free' as const, key };
    trackCallByKey(key, 'free', 25);
    expect(await recordAhaMilestoneCrossing(license)).toBe(25);
    trackCallByKey(key, 'free', 25); // now at 50
    expect(await recordAhaMilestoneCrossing(license)).toBe(50); // higher unshown milestone
    expect(await recordAhaMilestoneCrossing(license)).toBeNull(); // deduped again
  });
});
