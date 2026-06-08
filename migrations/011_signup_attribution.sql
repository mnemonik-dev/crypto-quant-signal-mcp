-- 011_signup_attribution.sql — SUBSCRIBER-ATTRIBUTION-SPINE-W1 / C1
-- Durable acquisition-attribution capture. Today the anonymous /signup click
-- generates a synthetic client_reference_id (`<channel>:<ts>:<rand>`) that is
-- persisted NOWHERE, so the conversion webhook has nothing to JOIN to — the
-- structural blind spot SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 hit. This table
-- captures it at click time.
--
-- PRIMARY KEY on client_reference_id is the join + idempotency anchor: the
-- capture does `INSERT ... ON CONFLICT (client_reference_id) DO NOTHING`
-- (src/lib/subscriber-attribution.ts recordSignupAttribution), so a re-click is
-- a no-op. channel is channel-agnostic by construction (derived from the id
-- prefix: direct: / tg_bot: / mcp: / api:), so TG-bot / MCP-upgrade / raw-API
-- snap in as later producers with NO schema change.
--
-- Privacy: ip_hash only (sha256→16hex via analytics.hashIp), NEVER a raw IP.
--
-- Append-only. Pre-applied to prod signal_performance via SSH psql BEFORE the
-- code commit lands (CLAUDE.md "pre-apply schema via SSH then deploy code with
-- IF NOT EXISTS idempotency"); IF NOT EXISTS makes the committed code + the
-- in-process ensureSignupAttributionSchema() a no-op against the prepared DB.
-- Additive only — no existing table/query touched; Data-Integrity safe.

CREATE TABLE IF NOT EXISTS signup_attribution (
  client_reference_id TEXT PRIMARY KEY,                 -- `<channel>:<ts>:<rand>` join + idempotency anchor
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),        -- click time
  channel TEXT NOT NULL DEFAULT 'unknown',              -- derived from id prefix (channel-agnostic)
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  landing_path TEXT,
  tier_requested TEXT,                                  -- plan query param (starter/pro/enterprise)
  ip_hash TEXT,                                         -- sha256→16hex; NEVER a raw IP
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_signup_attribution_created_at ON signup_attribution (created_at);
