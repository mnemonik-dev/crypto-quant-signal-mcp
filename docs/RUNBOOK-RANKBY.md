# RUNBOOK — `rankBy` universe lens (SCAN-RANKBY-W1)

`scan_trade_calls` selects its top-N perp **universe** by a `rankBy` lens, then runs the
composite-verdict engine unchanged on that set. A new lens is a new metric key, not a new
code path. **`tools/list` stays 9** (rankBy is a param). Omitted/`oi` ⇒ byte-identical output.

## Architecture

```
scan_trade_calls (index.ts handler + x402 route)
  → runScanTradeCall (src/tools/scan-trade-calls.ts)        # resolveRankBy strict-validates; invalid → structured error
    → scanTradeCalls (src/lib/trade-call-scanner.ts)        # oi → getTopCoinSet (existing); else → getRankedUniverse
      → getRankedUniverse (src/lib/rank-metrics.ts)         # the metric-keyed selector
        → fetchVenueUniverse (src/lib/exchange-universe.ts) # the FETCHERS registry (5 venues), now rich
```

- `src/lib/rank-constants.ts` (pure leaf): `RANK_BY_VALUES`, `RANK_BY_ALIASES`, `resolveRankBy` (THE only alias map), `annualizeFunding`.
- `src/lib/rank-metrics.ts` (impure): `getRankedUniverse(exchange, rankBy, topN)` — generalizes `exchange-universe.ts`'s FETCHERS. (NB: `oi-ranking.ts` is Hyperliquid-only and **unrelated** — do NOT confuse it with the scan universe selector.)
- Per-call echo (`rank_value` + the typed field) is attached at OUTPUT assembly (`attachRank`), **never** cached into the rank-independent verdict cell.

## Lenses

| canonical | alias | ranks by | typed echo |
|---|---|---|---|
| `oi` *(default)* | `oi` | open interest (USD) | — (byte-identical) |
| `volume` | `vol` | 24h quote volume (USD) | `volume_24h` |
| `gainers` | `gain` | 24h % change desc | `change_24h_pct` |
| `losers` | `lose` | 24h % change asc | `change_24h_pct` |
| `movers` | `move` | abs(24h %) desc | `change_24h_pct` (signed) |
| `funding_positive` | `pfr` | funding desc | `funding_rate` + `funding_apr` |
| `funding_negative` | `nfr` | funding asc | `funding_rate` + `funding_apr` |
| `volatility` | `atr` | ATRP desc | `atrp` |

`oi`/`volume`/`gainers`/`losers`/`movers` rank the **full universe**. `funding_*` rank within the
**top-`RANK_FUNDING_POOL_SIZE`-by-OI candidate pool** (default 150, env-overridable); `volatility`
within the **top-`RANK_ATRP_POOL_SIZE`-by-OI pool** (default 50, tighter — klines are heavy) — both
*"among the most-liquid perps."*

**ATRP (`volatility`, SCAN-RANKBY-W2):** `ATRP = ATR(14 Wilder) ÷ last close × 100` on the scan
timeframe (`computeATRP` in `rank-atr.ts`). **ATRP, not raw ATR** — raw ATR is price-scaled (BTC
dwarfs a sub-$1 alt), so a mixed-price basket is ranked by relative range. Candles come from the
verdict-engine-proven `getAdapter(exchange).getCandles` (no new per-venue kline mapping), fetched
for the pool only, cached in a `coalescedCache` keyed `${exchange}:${timeframe}` (ttl 2min,
`loadTimeoutMs` 900 cold-serves empty <1s + self-warms; no background warmer — the key space is
exchange×timeframe). `<15` candles → coin dropped (never guessed). `atrp` echoed at OUTPUT only.

## Per-venue field map (live-verified 2026-06-27)

| venue | call(s) | 24h % source | volume USD | funding | interval |
|---|---|---|---|---|---|
| Binance | `/fapi/v1/ticker/24hr` + `/fapi/v1/premiumIndex` | `openPrice` (computed) | `quoteVolume` | `premiumIndex.lastFundingRate` (bulk, coalesced) | 8h |
| Bybit | `/v5/market/tickers?category=linear` | `prevPrice24h` | `turnover24h` | `fundingRate` (same call) | `fundingIntervalHour` (live!) |
| OKX | `/api/v5/market/tickers?instType=SWAP` + `/public/open-interest` | `open24h` | `volCcy24h×markPx` | **per-instId** (no bulk — `50014`) → background-warmed cache | 8h |
| Bitget | `/api/v2/mix/market/tickers?productType=USDT-FUTURES` | `open24h` | `quoteVolume` | `fundingRate` (same call) | 8h |
| Hyperliquid | `POST /info {"type":"metaAndAssetCtxs"}` | `prevDayPx` | `dayNtlVlm` | `funding` (same call) | **1h (hourly!)** |

**APR = funding × (24 / intervalHours) × 365.** HL is hourly → **×8760**, NOT ×1095. Bybit reads the
live per-pair `fundingIntervalHour` (a pair can be 1h or 8h). Unknown interval → `funding_apr: null` (never guessed).

### OKX funding cache
OKX has no market-wide funding endpoint. `funding_*` on OKX fetches funding per-instId for the
top-150-by-OI pool via a coalesced cache (`rank-metrics.ts`): ttl 3min, `loadTimeoutMs` 900 (cold
serves an empty fallback < 1s while the load self-warms), negative-TTL 30s, lazy background warmer
(long-lived server only; script-context `processGate` skips it). The request path never fans out.

## Canary
- `node scripts/check-rank-metrics-parity.mjs --check` — offline per-venue field parity + APR unit + `/capabilities` lens set (CI + prepublish + `npm run rank:parity:check`).
- `--live` — real-venue parity (weekly host cron); `--simulate-drift` proves detection (rc=1).
- Shape snapshot: `audits/scan_trade_calls-rankby-shape-snapshot-2026-06-27.json`.

## Status / remaining lenses
- **`volatility` (`atr`/ATRP) — ✅ SHIPPED (SCAN-RANKBY-W2).** See the ATRP note above.
- **`oi_change` (`oid`) — → `SCAN-RANKBY-W3` (Path B).** A true OI-delta rank needs an OI time-series
  snapshot store (`oi_snapshots(exchange,symbol,ts,oi)` + an idempotent sampler on the scan/seed
  cadence; `oi_change` = current vs window-ago snapshot; `null`+`"warming"` until ≥2 snapshots span the
  window; never blocks the scan). NOT derivable cheaply: the engine's `indicators.oi_change_pct`
  (get-trade-call.ts) is `priceChange×100` — a PRICE-change proxy, NOT an OI delta (W2 Step-0 finding;
  do not reuse it for an OI-delta lens), and per-venue OI-history endpoints are uneven (Bybit only;
  Binance/OKX need new fetchers; HL has none). Data-flywheel moat — its own wave.
- **Full-universe OKX funding** — optional: a background poller over ALL OKX instId funding (vs the
  current top-`RANK_FUNDING_POOL_SIZE` pool), if cross-venue full-universe funding parity is ever required.

Each remaining lens is a new `RANK_BY_VALUES` key + a `getRankedUniverse` branch (+ its data source) —
the generalized FETCHERS path means no new code path per lens.
