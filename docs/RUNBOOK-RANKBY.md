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

`oi`/`volume`/`gainers`/`losers`/`movers` rank the **full universe**. `funding_*` rank within the
**top-`RANK_FUNDING_POOL_SIZE`-by-OI candidate pool** (default 150, env-overridable) on ALL venues
— *"funding ranks among the most-liquid perps."*

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

## W2 handoff — `SCAN-RANKBY-W2` (Tier-2, heavier cost class; NOT built here)
1. **`volatility` (`atr`/ATRP)** — needs per-symbol candle download + compute. Pattern: sort-then-slice a
   cheap candidate set (top-K by OI/volume from `fetchVenueUniverse`) then ATRP the shortlist (bounded
   per-symbol kline fetches, coalesced). Slots in as a new `RANK_BY_VALUES` key + a `getRankedUniverse` branch.
2. **`oi_change` (`oid`)** — needs an OI time-series snapshot store (periodic OI capture per venue) to diff
   current vs N-ago OI. New persistence; not derivable from a single market-wide call.
3. **Full-universe OKX funding** — optional: a background poller over ALL OKX instId funding (vs the
   current top-150 pool), if cross-venue full-universe funding parity becomes a requirement.

Each is a new metric key + a `getRankedUniverse` branch (+ its data source) — the generalized FETCHERS
path means no new code path per lens.
