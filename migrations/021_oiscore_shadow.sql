-- 021_oiscore_shadow.sql — SCAN-RANKBY-REFINEMENTS-W1 CH4
--
-- SHADOW measurement store for the oiScore re-base. The verdict's internal OI-momentum
-- score is still priceChange-derived (get-trade-call.ts ~L306); CH4 INSTRUMENTS a
-- real-OI (contracts-basis) re-base WITHOUT changing the live verdict (OISCORE_SOURCE
-- defaults to 'price'; the live call/confidence stays byte-identical). For each evaluated
-- signal where a contracts-basis OI delta is available, we record BOTH the live
-- (price-derived) verdict and the would-be (OI-derived) verdict so a later read-only
-- harness can quantify the divergence; the actual FLIP is the separate ratified wave
-- SCAN-OISCORE-FLIP-W1 (gated on matured Phase-E outcomes + WR non-regression).
--
-- Write is FIRE-AND-FORGET + try/catch-isolated in the engine — a shadow-write error
-- NEVER blocks or fails the live verdict (Data Integrity: the live verdict is sacrosanct).
-- Append-only; the harness is read-only. SSH-preapplied to prod `signal_performance`
-- BEFORE the code push (the push auto-deploys via GHA); CREATE TABLE IF NOT EXISTS =
-- idempotent no-op against the prepared DB + the lazily-ensured DDL in oiscore-shadow.ts.

CREATE TABLE IF NOT EXISTS oiscore_shadow (
  id             BIGSERIAL        PRIMARY KEY,
  ts             BIGINT           NOT NULL,   -- epoch ms at signal evaluation
  exchange       TEXT             NOT NULL,
  symbol         TEXT             NOT NULL,   -- bare coin, uppercase
  timeframe      TEXT             NOT NULL,
  oiscore_price  DOUBLE PRECISION NOT NULL,   -- live (priceChange-derived) oiScore
  oiscore_oi     DOUBLE PRECISION NOT NULL,   -- shadow (contracts-OI-derived) oiScore
  call_price     TEXT             NOT NULL,   -- live verdict with oiScore_price (BUY/SELL/HOLD)
  call_oi        TEXT             NOT NULL,   -- would-be verdict with oiScore_oi
  conf_price     INTEGER          NOT NULL,
  conf_oi        INTEGER          NOT NULL
);

-- The harness scans recent rows + (in the FLIP wave) joins to matured outcomes by
-- (symbol, exchange, timeframe, ts).
CREATE INDEX IF NOT EXISTS idx_oiscore_shadow_sym_ts ON oiscore_shadow (symbol, exchange, timeframe, ts);
