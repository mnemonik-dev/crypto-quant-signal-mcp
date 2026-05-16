-- 002_venues_table.sql — EXCHANGE-SHADOW-PROMOTE-W1 / C1
--
-- Creates the `venues` table: canonical registry of every exchange integration
-- with its lifecycle state (shadow → promoted → retired). Drives multiple
-- downstream gates:
--   - /api/performance-public filters per-venue aggregates on status='promoted'
--   - /api/performance-shadow (new endpoint) surfaces status='shadow' rows
--   - MCP tools/list describe-text annotates shadow venues `(experimental)`
--   - daily evaluate-venues cron reads buy_sell_count + pfe_wr per row to drive
--     promote/extend/manual_required state transitions
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Safe to run on every container start (also wired into src/lib/venue-store.ts
-- initVenuesTable() helper for runtime bootstrap on fresh DBs).

CREATE TABLE IF NOT EXISTS venues (
  exchange_id           TEXT PRIMARY KEY,
  status                TEXT NOT NULL CHECK (status IN ('shadow', 'promoted', 'retired')),
  asset_count           INTEGER NOT NULL CHECK (asset_count > 0),
  min_buy_sell_sample   INTEGER NOT NULL CHECK (min_buy_sell_sample > 0),
  integrated_at         TIMESTAMPTZ NOT NULL,
  promoted_at           TIMESTAMPTZ,
  retired_at            TIMESTAMPTZ,
  extension_count       INTEGER NOT NULL DEFAULT 0 CHECK (extension_count >= 0 AND extension_count <= 2),
  last_eval_at          TIMESTAMPTZ,
  last_eval_pfe_wr      REAL,
  last_eval_buy_sell_count INTEGER,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);
