-- 019_directional_labels.sql — EDGE-DWR-METRIC-SOT-W1
-- Durable labeled dataset for Directional Win Rate (DWR): symmetric triple-barrier
-- outcomes over historical crypto BUY/SELL signals. INTERNAL-ONLY (same data class as
-- outcome_return_pct / mae / mfe): never exposed via MCP / API / landing / README.
-- Additive, idempotent. Rollback = DROP TABLE directional_labels; (zero public consumers).
CREATE TABLE IF NOT EXISTS directional_labels (
  signal_id        INTEGER NOT NULL,          -- FK-in-spirit to signals.id (int PK)
  barrier_spec     TEXT NOT NULL,             -- versioned: 'tau{X.X}-floor{0.30}-v1'
  label            SMALLINT NOT NULL,         -- +1 target-first / -1 adverse-first / 0 timeout
  ambiguous_candle BOOLEAN NOT NULL DEFAULT FALSE,  -- both barriers inside one candle -> -1 conservative
  low_vol_history  BOOLEAN NOT NULL DEFAULT FALSE,  -- <30 sigma_w windows -> excluded from cell stats
  t_hit_candles    INT,                       -- candles to first barrier touch; NULL on timeout
  mfe_return_pct   DOUBLE PRECISION,          -- reused from signals.pfe_return_pct (identical window)
  mae_return_pct   DOUBLE PRECISION,          -- reused from signals.mae_return_pct (identical window)
  barrier_pct      DOUBLE PRECISION NOT NULL, -- max(tau * sigma_w, 0.0030)
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, barrier_spec)
);

-- Report path filters WHERE barrier_spec = '...' then joins to signals on signal_id.
CREATE INDEX IF NOT EXISTS idx_dirlabels_spec_signal
  ON directional_labels (barrier_spec, signal_id);
