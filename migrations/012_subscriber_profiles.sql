-- 012_subscriber_profiles.sql — SUBSCRIBER-ATTRIBUTION-SPINE-W1 / C2
-- Conversion-time auto-profiler output: one durable row per paid subscriber,
-- written by buildSubscriberProfile() from the checkout.session.completed webhook
-- (src/lib/subscriber-attribution.ts), replacing the hand-run SUBSCRIBER-
-- ATTRIBUTION-DIAGNOSIS-W1 lane.
--
-- PRIMARY KEY on customer_id is the idempotency anchor: the profiler upserts
-- `ON CONFLICT (customer_id) DO UPDATE`, and runs only AFTER tryClaimEvent in
-- the webhook (so a Stripe replay never re-profiles). channel is resolved by
-- JOIN to signup_attribution (else deriveChannel fallback); geo is card-issuing
-- (tier-1) or billing-address country (country_source names which) — NEVER a
-- fabricated IP. cold_subscribe is a measurable-signal boolean (no free-tier
-- opt-in AND no upgrade-CTA), honest NULL when indeterminable.
--
-- ⚠️ PII (email / name / country) lives ONLY here, behind the ADMIN_API_KEY-
-- gated GET /api/admin/subscribers route (C3). It NEVER touches the MCP surface,
-- /api/performance-*, the landing pages, the README, or any un-gated route, and
-- is REDACTED from public-repo audit docs (SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1
-- precedent). outcome_return_pct / Phase-E WR are not present here.
--
-- Append-only (one row per customer). Pre-applied to prod signal_performance via
-- SSH psql BEFORE the code commit lands; IF NOT EXISTS makes the committed code
-- + ensureSubscriberProfilesSchema() a no-op against the prepared DB. Additive
-- only — no existing table/query touched; Data-Integrity safe.

CREATE TABLE IF NOT EXISTS subscriber_profiles (
  customer_id TEXT PRIMARY KEY,                  -- Stripe cus_… (upsert/idempotency anchor)
  created_at TIMESTAMPTZ DEFAULT now(),          -- row insert time
  email TEXT,                                    -- PII (gated)
  name TEXT,                                     -- PII (gated)
  subscription_id TEXT,
  tier TEXT,
  status TEXT,
  amount_usd NUMERIC(10,2),
  currency TEXT,
  channel TEXT,                                  -- direct / tg_bot / mcp / api / unknown
  country TEXT,                                  -- ISO-2 (gated)
  country_source TEXT,                           -- card_issuing | billing_address
  client_reference_id TEXT,                      -- join key back to signup_attribution
  signup_at TIMESTAMPTZ,                          -- click time (from the attribution row)
  converted_at TIMESTAMPTZ,                       -- paid-completion time
  latency_seconds INTEGER,                       -- signup → convert
  cold_subscribe BOOLEAN,                         -- no opt-in AND no upgrade-CTA; NULL if indeterminable
  attribution_captured BOOLEAN,                  -- was there a signup_attribution row to join
  risk_level TEXT                                -- Stripe Radar outcome.risk_level (best-effort)
);

CREATE INDEX IF NOT EXISTS idx_subscriber_profiles_converted_at ON subscriber_profiles (converted_at DESC);
