-- 019_quota_milestone_referral.sql — REFERRAL-INPRODUCT-NUDGE-W1 / C1
-- Lifetime-dedup marker for the usage-milestone aha referral trigger (c): the
-- highest call-count milestone (e.g. 25, 50) at which the user has already been
-- shown the referral nudge. EXTENDS the existing per-tracker quota_usage store
-- (NOT a new throttle store). Monotonic; deliberately NOT reset on the monthly
-- period rollover (persistTracker only updates call_count + period_start), so a
-- milestone celebration fires at most ONCE per user, ever, per milestone.
--
-- Pre-applied to prod signal_performance via SSH psql BEFORE the code commit lands
-- (CLAUDE.md "pre-apply schema via SSH then deploy code with IF NOT EXISTS idempotency").
-- The in-code dual-backend DDL in src/lib/license.ts mirrors this: fresh/test DBs
-- get the column via CREATE TABLE IF NOT EXISTS (initQuotaDb); existing DBs via
-- ensureQuotaMilestoneColumn() (PG ADD COLUMN IF NOT EXISTS / SQLite PRAGMA pre-check).

ALTER TABLE quota_usage ADD COLUMN IF NOT EXISTS milestone_referral_shown INTEGER NOT NULL DEFAULT 0;
