-- 017_referral_payout_address.sql — REFERRAL-PAYOUT-OPS-W1 / C1
-- Additive: store each referrer's Base USDC payout address on referral_codes so a
-- non-subscriber referrer can be paid their ≥ $50 commission (USDC on Base). No row
-- is touched, no data lost; the column is nullable (unset until the referrer adds it
-- on /account). The value is always the EIP-55-checksummed form (validated in
-- src/lib/evm-address.ts before any write).
--
-- Pre-applied to prod signal_performance via SSH psql BEFORE the code commit lands
-- (CLAUDE.md "pre-apply schema via SSH then deploy code with IF NOT EXISTS
-- idempotency"). The in-code DDL in src/lib/referral-store.ts::ensureReferralPayoutColumns()
-- mirrors this (PG: ADD COLUMN IF NOT EXISTS; SQLite test backend: PRAGMA pre-check),
-- so this file is a no-op safety net on an already-migrated prod DB.
--
-- PG-only. ADD COLUMN IF NOT EXISTS is natively idempotent / re-runnable.

ALTER TABLE referral_codes
  ADD COLUMN IF NOT EXISTS owner_payout_address TEXT;
