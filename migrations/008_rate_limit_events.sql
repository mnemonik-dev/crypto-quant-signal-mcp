-- 008_rate_limit_events.sql — OPS-RATELIMIT-TELEMETRY-DIGEST-W1 R1
-- Durable, cross-container-recreate-surviving event stream for every typed
-- rate-limit signal across all 17 venues. Replaces the container-/tmp logs that
-- die on each (~daily) deploy. ONE stream serves both deferred triggers
-- (OPS-SHADOW-BUDGET-W{NEXT}: ≥3 shadow throws/wk; OPS-HL-WEBSOCKET-W{NEXT}:
-- sustained HL interactive throws OR batch-wait p95 > 20s) + any future
-- budget-tuning question (ceiling raise, reserve sizing, Bybit 5s-window refine).
--
-- Producers (fire-and-forget, fail-open via getBackend().run):
--   • src/lib/adapters/_upstream-fetch.ts — venue-ban throws (HTTP 418/429/403 + Bitget body codes)
--   • src/lib/upstream-weight-budget.ts   — budget self-throttle throw / batch skip / batch wait
-- Consumer: src/scripts/shadow-digest-weekly.ts (weekly 7d GROUP BY read).
--
-- Append-only. Pre-applied to prod `signal_performance` via SSH psql BEFORE the
-- code commit; IF NOT EXISTS idempotent → the committed code is a no-op against
-- the prepared DB. Monthly VACUUM (ANALYZE) per docs/RUNBOOK-POSTGRES-MAINT.md.

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id                BIGSERIAL PRIMARY KEY,
  ts                TIMESTAMPTZ NOT NULL DEFAULT now(),
  venue             TEXT NOT NULL,                 -- UpstreamRateLimitError venueName, e.g. 'Hyperliquid' / 'Bybit'
  kind              TEXT NOT NULL,                 -- 'throw' | 'wait' | 'skip'
  http_or_body_code TEXT,                          -- '418'/'429'/'403'/'45001' (ban) | 'BUDGET_CEILING' (self-throttle) | NULL
  class             TEXT NOT NULL,                 -- 'interactive' | 'batch'  (weight class at the event)
  wait_ms           INTEGER                        -- batch acquire-wait duration (kind='wait' only); NULL otherwise
);

-- Weekly digest scans `WHERE ts > now() - interval '7 days'` grouped by venue.
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ts_venue ON rate_limit_events (ts, venue);
