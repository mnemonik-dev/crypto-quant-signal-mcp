-- 003_seed_venues_promoted.sql — EXCHANGE-SHADOW-PROMOTE-W1 / C1
--
-- Backfills the 5 existing exchange integrations into `venues` as promoted.
-- Derives `asset_count` from the production `signals` table to avoid drift.
--
-- ── asset_count semantics (TWO DIFFERENT MEANINGS — read carefully) ──
--
-- For already-promoted venues (this seed):
--   asset_count = SELECT COUNT(DISTINCT coin) FROM signals WHERE exchange = X
--   This is COSMETIC + audit-trail only. The promoted-state machine never
--   re-gates these venues on min_buy_sell_sample (they're past the gate by
--   construction). Refreshable via venue-store.refreshAssetCount() if a venue
--   adds N new listings post-promotion, but no auto-bump.
--
-- For NEW shadow venues (C5+):
--   asset_count = the venue's TOTAL listed USDT-margined perps probed from
--   exchangeInfo at integration time (e.g. `SELECT COUNT(*) FROM <venue
--   exchangeInfo>.symbols WHERE quote='USDT' AND contractType='PERPETUAL'`).
--   Drives the binding `min_buy_sell_sample = asset_count × 10` gate for the
--   shadow → promoted state transition.
--
-- Idempotent: ON CONFLICT (exchange_id) DO NOTHING — safe to re-run.

INSERT INTO venues (
  exchange_id,
  status,
  asset_count,
  min_buy_sell_sample,
  integrated_at,
  promoted_at,
  extension_count,
  notes
)
SELECT
  exchange_id,
  'promoted'::TEXT AS status,
  asset_count,
  asset_count * 10 AS min_buy_sell_sample,
  to_timestamp(integrated_at_unix) AS integrated_at,
  NOW() AS promoted_at,
  0 AS extension_count,
  'Backfilled by 003_seed_venues_promoted.sql; asset_count = COUNT(DISTINCT coin) seeded historically (cosmetic; promoted-state machine never re-gates these)' AS notes
FROM (
  SELECT exchange AS exchange_id,
         COUNT(DISTINCT coin) AS asset_count,
         MIN(created_at) AS integrated_at_unix
  FROM signals
  WHERE exchange IN ('HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET')
  GROUP BY exchange
) AS seed
ON CONFLICT (exchange_id) DO NOTHING;
