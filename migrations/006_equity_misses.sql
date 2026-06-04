-- 006_equity_misses.sql — EQUITY-LAUNCH-READINESS-W1 R1
-- Durable demand signal: every out-of-universe get_equity_call / get_equity_regime
-- records the requested ticker (normalized) so a future 500→1000 universe bump
-- has evidence. Append-only; fire-and-forget write (never blocks the tool).
-- Pre-applied to prod via SSH BEFORE the code commit; IF NOT EXISTS idempotent.

CREATE TABLE IF NOT EXISTS equity_symbol_misses (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,              -- normalized (post BRK-B→BRK.B); '' inputs stored sanitized
  raw_input TEXT,                    -- original input, ONLY when it differs from `symbol`
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equity_symbol_misses_symbol ON equity_symbol_misses (symbol);
CREATE INDEX IF NOT EXISTS idx_equity_symbol_misses_requested_at ON equity_symbol_misses (requested_at);
