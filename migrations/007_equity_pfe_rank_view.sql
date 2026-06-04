-- 007_equity_pfe_rank_view.sql — EQUITY-LAUNCH-READINESS-W1 R2
-- INTERNAL-ONLY rank-bucket PFE aggregate feeding EQUITY-CALIBRATION-AUDIT-W1 +
-- the readiness latch. NEVER serialized into any MCP/HTTP response (grep-gated);
-- outcome_return_pct is never selected here (PII-guard: PFE-only).
-- "Matured" = outcome backfill has filled the row (outcome_filled_at IS NOT NULL).
-- PFE win convention mirrors crypto: BUY pfe_pct>0 / SELL pfe_pct<0.
-- CREATE OR REPLACE is idempotent; pre-applied via SSH before commit.

CREATE OR REPLACE VIEW equity_pfe_by_rank_bucket AS
SELECT
  CASE
    WHEN u.is_etf THEN 'etf'
    WHEN u.rank_adv BETWEEN 1 AND 50    THEN '1-50'
    WHEN u.rank_adv BETWEEN 51 AND 100  THEN '51-100'
    WHEN u.rank_adv BETWEEN 101 AND 500 THEN '101-500'
    ELSE 'other'
  END AS bucket,
  count(*) FILTER (WHERE v.call IN ('BUY','SELL') AND v.outcome_filled_at IS NOT NULL) AS matured_calls,
  count(*) FILTER (
    WHERE v.outcome_filled_at IS NOT NULL
      AND ((v.call = 'BUY' AND v.pfe_pct > 0) OR (v.call = 'SELL' AND v.pfe_pct < 0))
  ) AS pfe_wins,
  (count(*) FILTER (
     WHERE v.outcome_filled_at IS NOT NULL
       AND ((v.call = 'BUY' AND v.pfe_pct > 0) OR (v.call = 'SELL' AND v.pfe_pct < 0))
   )::numeric
   / NULLIF(count(*) FILTER (WHERE v.call IN ('BUY','SELL') AND v.outcome_filled_at IS NOT NULL), 0)
  ) AS pfe_win_rate,
  count(DISTINCT v.session_date) FILTER (WHERE v.outcome_filled_at IS NOT NULL) AS matured_sessions
FROM equity_verdicts v
JOIN equity_universe u ON u.symbol = v.symbol
WHERE u.active
GROUP BY 1;
