-- 011_oi_snapshots.sql — SCAN-RANKBY-W3 CH2
-- Self-maintained, venue-agnostic open-interest time-series. The CANONICAL source
-- for the real `oi_change` rankBy lens AND the get_trade_call OI factor
-- (single-derivation LAW: computeOiDelta over THIS table feeds BOTH — never a real
-- delta in the lens + a price-proxy in the factor). Retires the price-proxy
-- `oi_change_pct` (SCAN-RANKBY-W3 CH1 provenance: get-trade-call.ts:506 was
-- parseFloat(priceChange*100) — a 24h PRICE change mislabeled as OI; BTC live
-- showed "OI +1.4% bullish" while real OI fell -1.0%).
--
-- Producer (fire-and-forget, fail-soft): src/scripts/oi-snapshot-sampler.ts
--   (hourly cron, all 5 PROMOTED venues, top-RANK_OI_SAMPLE_POOL by OI; one row
--    per (venue, symbol, hour-bucket); USD notional OI = oi × price).
-- One-time warming shrink: src/scripts/oi-snapshot-backfill.ts (Binance + Bybit
--   24h OI-history; OKX/Bitget/HL warm forward — no clean USD-comparable history).
-- Consumers: src/lib/oi-snapshots.ts::computeOiDelta(ForPool) — the lens
--   (rank-metrics.ts oi_change branch) + the verdict factor (get-trade-call.ts).
--
-- USD notional so deltas are cross-venue comparable; only the PERCENT delta is
-- consumed (price-invariant within a (venue,symbol) series). Append-only;
-- bucket-deduped via the PK (ON CONFLICT DO NOTHING). Pre-applied to prod
-- `signal_performance` via SSH psql BEFORE the code commit; IF NOT EXISTS = no-op
-- against the prepared DB. Retention: the sampler prunes ts older than
-- RANK_OI_RETENTION_H (default 30d); monthly VACUUM (ANALYZE) per
-- docs/RUNBOOK-POSTGRES-MAINT.md.

CREATE TABLE IF NOT EXISTS oi_snapshots (
  exchange  TEXT             NOT NULL,   -- PROMOTED ExchangeId: HL|BINANCE|BYBIT|OKX|BITGET
  symbol    TEXT             NOT NULL,   -- bare coin, uppercase (e.g. BTC, SOL)
  ts        BIGINT           NOT NULL,   -- epoch MILLISECONDS, floored to the hour bucket
  oi        DOUBLE PRECISION NOT NULL,   -- USD notional open interest (oi × price)
  PRIMARY KEY (exchange, symbol, ts)
);

-- computeOiDelta reads recent rows per (exchange[, symbol]) ordered by ts.
CREATE INDEX IF NOT EXISTS idx_oi_snapshots_exch_sym_ts ON oi_snapshots (exchange, symbol, ts);
