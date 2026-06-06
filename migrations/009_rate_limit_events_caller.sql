-- 009_rate_limit_events_caller.sql — OPS-RATELIMIT-CALLER-ATTRIBUTION-W1 R1
-- Adds a `caller` dimension to the rate_limit_events stream (008) so the telemetry
-- self-pins WHICH entry point issues the demand — the precondition for a correctly
-- scoped HL-WEBSOCKET wave (OPS-HL-INTERACTIVE-SATURATION-INVESTIGATION proved the
-- ~54/min HL interactive BUDGET_CEILING throws are total demand 2-3x over budget, but
-- 008 records venue/kind/class — NOT which caller). Pure observability; the per-event
-- recorder is unchanged in shape — ONE extra column on writes that already happen.
-- No write-amplification: ~54 HL throws/min ~= 1 write/sec, fire-and-forget on the
-- existing pool (Postgres doesn't notice). Set via the budget AsyncLocalStorage
-- (`weightClassContext` sibling `callerContext`) at each entry point; default
-- 'unknown' (fail-open — an untagged path attributes to 'unknown', never breaks).
--
-- Callers tagged (R3): the 9 MCP tool handlers (get_trade_call, get_trade_signal,
-- get_market_regime, scan_trade_calls, scan_funding_arb, get_equity_call,
-- get_equity_regime, search_knowledge, chat_knowledge) + grid_warmer + backfill.
-- seed:<tf> DEFERRED to a 1-line follow-up (active seed runs mid-flight at ship time;
-- non-critical-path — seeds WAIT in the batch lane, they don't throw). See status.md.
--
-- Append-only ALTER. Pre-applied to prod `signal_performance` via SSH psql BEFORE the
-- code commit; ADD COLUMN IF NOT EXISTS idempotent -> committed code is a no-op against
-- the prepared DB. Existing rows default 'unknown' (no backfill needed). Monthly
-- VACUUM (ANALYZE) per docs/RUNBOOK-POSTGRES-MAINT.md.

ALTER TABLE rate_limit_events ADD COLUMN IF NOT EXISTS caller TEXT NOT NULL DEFAULT 'unknown';

-- Payoff query: WHERE venue=? AND kind='throw' AND ts > now()-interval '20 min' GROUP BY caller.
-- Extends the existing (ts, venue) index with the caller dimension; the 008 index is kept.
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ts_venue_caller ON rate_limit_events (ts, venue, caller);
