# PILOT-ADAPTERS-W3B — Plan Mode Step 0 (endpoint-truth + identifier-diff + HALT triage)

## Context

Tier-2 Bulk-Spec wave shipping 4 NEW perp-CEX adapters (WEEX + Bitmart + XT.COM + WhiteBIT — emerging-tier) into shadow mode in `/Users/tank/crypto-quant-signal-mcp`. Sequential chapters C1 → C2 → C3 → C4 with Verification Gate between each. 6 risk markers fire (external API first-use × 4, identifier × 20 sites, ≥4 chapters, cross-chapter peek, XT.COM HTTPS gotcha, WhiteBIT mixed-settlement gotcha). Plan-Mode required per CLAUDE.md `## Execution flow` step 3.

Wave creates 4 new `system-map.md` E-edges, 4 new rows in `venues` table (status=shadow), widens `ExchangeId` enum **13 → 17** venues (NOT 14 → 18 as spec says; spec off by 1 — Lighter is DEX-routed via HL, not in union — same drift as W3A), and adds 4 to MCP `tools/list` enum.

Plan-Mode Step 0 work below is **read-only**: 23 live endpoint probes across 4 venues + 1 WebFetch attempt + 0 file edits.

## Wave Objective (verbatim restate)

Ship 4 perp-CEX adapters (WEEX, Bitmart, XT.COM, WhiteBIT) into `shadow` venue status. Each implements `ExchangeAdapter` interface mirroring established patterns. Existing infrastructure absorbs the 4 new venues automatically. After CH4_GREEN, total venue count is **17** (5 promoted + 12 shadow). Day-15 cohort evaluation at ~2026-06-01 ± 3 days will cover all 12 shadow venues simultaneously.

## HALT triage (collapse-class — ~12 spec primitives, 1 root cause)

Per CLAUDE.md `plan-mode-halt-root-cause-collapse-vs-independent-primitives`. All collapse to **ONE root cause**: spec drafted from training-time memory rather than from live primary-source endpoint probes. **2nd-sighting of the same collapse pattern** as PILOT-ADAPTERS-W3A 2026-05-20 (10 fictionals in W3A; ~12 in W3B). Recommendation: **Path A inline rebase** ratified per the W3A precedent + WIS bullet from W3A "Path A inline-rebase as DEFAULT for collapse-class".

| # | Spec claim | Live reality | Resolution |
|---|---|---|---|
| 1 | Interface name `TradingExchangeAdapter` | Actual: `ExchangeAdapter` (`src/types.ts:84-91`) — same as W3A | Inline rebase |
| 2-6 | 5 fictional method names per venue (`fetchCandles`/`fetchAssetContext`/`fetchFunding`/`fetchOpenInterest`/`getInstruments`) | Actual: `getCandles`/`getAssetContext`/`getPredictedFundings`/`getFundingHistory`/`getCurrentPrice`/`getName` | Inline rebase |
| 7 | "post-W3A 14 venues → 18 post-W3B" | Actual: 13 → 17 (Lighter excluded — same drift as W3A) | Inline rebase |
| 8 | WEEX symbol convention `BTC-USDT` (hyphen) | Actual: `cmt_btcusdt` (lowercase + **`cmt_` prefix** + concatenated). Live: `/capi/v2/market/contracts[].symbol`. **Most-unusual prefix convention of any AlgoVault adapter** | Inline rebase — `toWeexSymbol(coin) = 'cmt_' + coin.toLowerCase() + 'usdt'` |
| 9 | WEEX base URL `https://api-contract.weex.com` OR `https://www.weex.com/api/` | Actual: `https://api-contract.weex.com` with path prefix `/capi/v2/...` (NOT `/api/v1/...` as spec claimed). Verified live. | Inline rebase — path prefix corrected |
| 10 | XT.COM endpoint path `/future/api/v1/public/...` | Actual: `/future/market/v1/public/...`. `/future/api/v1/...` returns placeholder `{result: {openapiDocs: "https://doc.xt.com"}}`. **Spec endpoint family is entirely fictional** | Inline rebase — path family corrected |
| 11 | Bitmart kline `limit` parameter | `limit` is **NOT honored** — Bitmart kline uses `start_time` + `end_time` window only (probed limit=1/5/100/500/1500 all return same 28 rows from a fixed time window). Same shape as Gate.io. | Inline rebase — adapter computes time window from desired candle count |
| 12 | Bitmart kline `step` is presumed free integer | Actual: **enum {1, 3, 5, 15, 30, 60, 120, 240, 720}** (in MINUTES). step=480 → HTTP 400; step=1440/4320/10080 → 0 rows. **W3A-precedent enum trap** (same as Phemex's kline limit `{5,10,50,100,500,1000}` ENUM) | Inline rebase — `INTERVAL_MAP` constrained to enum |
| 13 | WEEX kline `granularity` unspecified | Actual: STRING family `1m`/`5m`/`15m`/`1h`/`4h`/`1d` (probed `60`/`3600`/`60s`/`M1`/`1min` all FAIL with `code:40020 参数granularity错误`). Same shape as BingX. | Inline rebase |
| 14 | WhiteBIT kline at `/api/v4/public/kline` | Actual: kline is **`/api/v1/public/kline`** (v1, NOT v4!); v4 path returns empty. Interval: STRING family `1m`/`15m`/`30m`/`1h`/`4h`/`1d` (probed integers `60`/`3600` → "Invalid interval"). | Inline rebase |
| 15 | WEEX funding endpoint at `/api/v1/market/funding-rate` | Actual: **NO public funding endpoint surfaced** — probed 7 candidate paths, all 404 except `historyFundRate` which returns "参数为空" (parameter empty). WEEX funding may be **auth-gated only**. | Inline rebase — `getFundingHistory()` returns `[]`; `getAssetContext.funding=0` with comment; same fail-soft pattern as W3A Q-4 shadow venues |
| 16 | WEEX funding cadence presumed 8h × 1095 | Actual: contract metadata `delivery: ["00:00:00","04:00:00","08:00:00","12:00:00","16:00:00","20:00:00"]` = **every 4 hours**; annualize ×2190 (4h × 2190 = 8760 = 1 year), NOT ×1095. **First non-8h venue in adapter fleet**. | Inline rebase — adapter uses ×2190 |
| 17 | Asset counts (spec): WEEX 734 / Bitmart 757 / XT 625 / WhiteBIT 308 | Actual live: WEEX 723 / Bitmart 949 USDT-quote perps (977 total) / XT.COM 893 PERPETUAL (943 total — 47 CURRENT_QUARTER + 3 NEXT_QUARTER dated futures filtered out per spec) / WhiteBIT 315 | Inline rebase — `asset_count` uses actual live values |
| 18 | XT.COM HTTPS gotcha (potential HALT-class) | Actual: HTTPS **works** (`HTTP/2 200`); HTTP `301 Moved Permanently` (CloudFront redirects to HTTPS). NOT HALT-class. | Documented as resolved |
| 19 | WhiteBIT mixed-settlement gotcha (potential HALT-class) | Actual: ALL 315 perpetual markets have `money_currency: "USDT"` (probed `[.result[].money_currency] | group_by` → `[{currency:"USDT", count:315}]`). `_PERP` suffix doesn't encode settlement but in practice 100% USDT-settled. Filter is no-op safety belt. | Documented as resolved |

## Per-venue endpoint truth (LIVE-PROBED 2026-05-20)

### WEEX (`https://api-contract.weex.com/capi/v2/market/*` — USDT-M Perpetual)

| Capability | Endpoint | Verified shape |
|---|---|---|
| Instruments | `GET /capi/v2/market/contracts` | Direct array (no envelope), 723 entries; sample: `{symbol: "cmt_btcusdt", underlying_index: "BTC", quote_currency: "USDT", contract_val: "0.0001", delivery: [...6 times...], maxLeverage: 400}` |
| Klines | `GET /capi/v2/market/candles?symbol=cmt_btcusdt&granularity=1h&limit=2` | Direct array, rows `[[ts_ms, open, high, low, close, base_vol, quote_vol]]` newest-first; granularity = STRING `1m/5m/15m/1h/4h/1d`; limit accepts integers (no enum trap surfaced) |
| Ticker (single) | `GET /capi/v2/market/ticker?symbol=cmt_btcusdt` | Returns `{symbol, last, best_ask, best_bid, high_24h, low_24h, volume_24h, timestamp, priceChangePercent, base_volume, markPrice, indexPrice}` — bundles mark + index + 24h vol; **NO fundingRate field** |
| All tickers | `GET /capi/v2/market/tickers` | Array of per-symbol ticker objects (same shape as single) |
| Funding rate | **NO PUBLIC ENDPOINT FOUND** (probed: `funding-rate`, `funding/funding-rate`, `funding-rate-list`, `funding/<symbol>`, `fundingRate`, `funding-info`, `historyFundRate` — all 404 or "parameter empty"). Funding cadence 4h per contract metadata `delivery` field. | adapter `getAssetContext.funding=0` + comment; `getFundingHistory()` returns `[]` |
| OI | **NO PUBLIC ENDPOINT FOUND** (probed: `openInterest`, `open-interest`, `holdAmount` — all 404). | adapter `getAssetContext.openInterest=0` + comment |
| Mark price | Bundled in ticker (`markPrice` field) | as above |
| Auth | None for ticker/contracts/candles | confirmed via unauthenticated curl |
| Symbol convention | `cmt_<coin>usdt` (lowercase + `cmt_` prefix + no separator) | unique — most-divergent W3B convention |
| Funding cadence | 4h × 2190 annualization (NOT 8h × 1095) | per contract metadata delivery schedule |

### Bitmart (`https://api-cloud-v2.bitmart.com/contract/public/*` — Futures V2 USDT-M)

| Capability | Endpoint | Verified shape |
|---|---|---|
| Instruments | `GET /contract/public/details` | `data.symbols[]` (977 total; 949 with `quote_currency=USDT` + `product_type=1`); sample: `{symbol: "BTCUSDT", base_currency: "BTC", quote_currency: "USDT", product_type: 1 (perpetual), last_price, mark_price (CAN be null), index_price, funding_rate, open_interest, contract_size, vol_24h (CAN be null)}` |
| Klines | `GET /contract/public/kline?symbol=BTCUSDT&step=60&start_time=X&end_time=Y` | `data: [{low_price, high_price, open_price, close_price, volume, timestamp (sec)}]`. **`step` is MINUTES ENUM `{1,3,5,15,30,60,120,240,720}`** (step=480→400; step=1440/4320/10080→0 rows). **`limit` param NOT honored** — uses time window. |
| Funding rate | `GET /contract/public/funding-rate?symbol=BTCUSDT` | `data: {symbol, expected_rate, rate_value (actual), funding_time (ms), funding_upper_limit, funding_lower_limit, timestamp}` |
| OI | bundled in `/contract/public/details` (per-symbol `open_interest` field) | direct in instrument list — no separate endpoint needed |
| Mark price | bundled in `/contract/public/details` (`mark_price` field, **CAN be null** for low-volume symbols — fallback to `index_price` or `last_price`) | as above |
| Auth | None | confirmed |
| Symbol convention | `BTCUSDT` (no separator — same as Binance) | mirrors Binance pattern |
| Funding cadence | 8h × 1095 (standard) | per docs |

### XT.COM (`https://fapi.xt.com/future/market/v1/public/*` — USDT-M Futures perpetual)

| Capability | Endpoint | Verified shape |
|---|---|---|
| Instruments | `GET /future/market/v1/public/symbol/list` | `result[]` of contract objects; 943 total: 893 PERPETUAL + 47 CURRENT_QUARTER + 3 NEXT_QUARTER (dated). Sample: `{id, symbol: "btc_usdt", contractType: "PERPETUAL", productType: "perpetual", underlyingType: "U_BASED", contractSize: "0.0001", baseCoin: "btc", quoteCoin: "usdt"}` — adapter MUST filter to `contractType=="PERPETUAL"` |
| Klines | `GET /future/market/v1/public/q/kline?symbol=btc_usdt&interval=1h&limit=3` | `result: [{s, p, t (ms), o, c, h, l, a (base vol), v (quote vol)}]` newest-first |
| Ticker (single) | `GET /future/market/v1/public/q/ticker?symbol=btc_usdt` | `result: {t (ms), s, c (close), h, l, a (amount), v (vol), o (open), r (priceChangeRatio)}` |
| Agg-ticker | `GET /future/market/v1/public/q/agg-ticker?symbol=btc_usdt` | `result: {t, s, c, h, l, a, v, o, r, i (index_price), m (mark_price), bp (bid), ap (ask)}` — single all-in-one call for mark+index+last |
| Funding rate | `GET /future/market/v1/public/q/funding-rate?symbol=btc_usdt` | `result: {symbol, fundingRate, nextCollectionTime (ms), collectionInternal: 8 (hours)}` |
| OI | **endpoint NOT FOUND** in `/future/market/v1/public/q/open-interest` (404); may live on `/future/market/v3/...` or under different path | adapter uses `getAssetContext.openInterest` from agg-ticker if available, else 0 |
| Mark price | bundled in agg-ticker (`m` field) | as above |
| Auth | None | confirmed |
| Symbol convention | `<coin>_<quote>` (LOWERCASE + underscore — unique case-sensitivity) | unique |
| **HTTPS** | works (HTTP/2 200); HTTP → 301 redirect | NOT HALT-class |
| **Spec endpoint path** | `/future/api/v1/public/...` is FICTIONAL — returns `{result: {openapiDocs: "https://doc.xt.com"}}` placeholder | actual path is `/future/market/v1/public/...` |

### WhiteBIT (`https://whitebit.com/api/{v4,v1}/public/*` — Futures USDT-margined)

| Capability | Endpoint | Verified shape |
|---|---|---|
| Instruments | `GET /api/v4/public/futures` | `result[]` of 315 markets ALL with `money_currency: "USDT"`. Sample: `{ticker_id: "BTC_PERP", stock_currency: "BTC", money_currency: "USDT", last_price, stock_volume, money_volume, bid, ask, high, low, product_type: "Perpetual", open_interest, index_price, index_name, funding_rate, next_funding_rate_timestamp, brackets}` — **bundles EVERYTHING in single call** (instruments + funding + OI + mark + 24h vol) |
| Klines | `GET /api/v1/public/kline?market=BTC_PERP&interval=1h&limit=3` | `{success, result: [[ts_sec, open, close, high, low, base_vol, quote_vol]]}`. **v1 not v4!** interval = STRING `1m/15m/30m/1h/4h/1d`; integers `60`/`3600` → "Invalid interval" |
| Funding/OI/Mark | all bundled in `/api/v4/public/futures` per-market record | no separate endpoints needed |
| Auth | None | confirmed |
| Symbol convention | `<coin>_PERP` (underscore + `_PERP` suffix; settlement currency implicit) | unique |
| Settlement currency | 100% USDT (315/315 markets) | filter is no-op but adapter includes it as safety belt |
| Funding cadence | 8h × 1095 (standard) | per `next_funding_rate_timestamp` 8h delta |

## TradFi alias probe (live semantic-fingerprint per venue)

### Semantic-fingerprint price probes (2026-05-20)

| Symbol | WEEX | Bitmart | XT.COM | WhiteBIT |
|---|---|---|---|---|
| **SPX** | `cmt_spxusdt`=$0.37 memecoin ❌ | `SPXUSDT`=$0.37 memecoin ❌ | `spx_usdt`=$0.37 memecoin ❌ | **NOT LISTED** ✓ (first W3-venue without memecoin trap) |
| **SP500** | not listed | not listed | `sp500_usdt`=**$7400.11** REAL S&P 500 ✓ | not listed |
| **GOLD/XAU/XAUT** | `cmt_xagusdt`=$75.81 (silver only; no gold) | `XAU`=$4510 / `XAUT`=$4504 (both real) | `gold_usdt`=$4505 / `xaut_usdt`=$4501 (both real) | `XAU_PERP`=$4511 / `XAUT_PERP`=$4505 (both real) |
| **CL (WTI oil)** | `cmt_clusdt`=$100.22 ✓ | `CLUSDT` listed ✓ | `cl_usdt` listed ✓ | `CL_PERP` listed ✓ |
| **NATGAS** | `cmt_natgasusdt`=$3.221 ✓ + `cmt_ngusdt`=$3.219 ✓ (both listed, same asset) | not listed | `natgas_usdt` listed ✓ | `NATGAS_PERP` listed ✓ |

### Recommended TRADFI_ALIASES maps per venue

| Venue | Map size | Entries |
|---|---|---|
| **WEEX** | 4 entries | `{SILVER: 'XAG', PLATINUM: 'XPT', PALLADIUM: 'XPD', USOIL: 'CL'}` (WEEX has NO XAU/GOLD; SILVER → XAG; metals → X*; oil → CL). Symbol mapper handles `cmt_` prefix + lowercase. SPX intentionally NOT aliased. |
| **Bitmart** | 5 entries | `{GOLD: 'XAU', SILVER: 'XAG', PLATINUM: 'XPT', PALLADIUM: 'XPD', USOIL: 'CL'}` (mirrors Gate canonical — Bitmart has BOTH XAU + XAUT, prefer XAU spot). SPX intentionally NOT aliased. |
| **XT.COM** | 3 entries | `{PLATINUM: 'xpt', PALLADIUM: 'xpd', USOIL: 'cl'}` (XT lists `gold_usdt`/`silver_usdt`/`sp500_usdt`/`natgas_usdt`/`copper_usdt`/`mstr_usdt`/`msft_usdt` DIRECT — alias only needed for canonical names that differ from XT's literal names). XT.COM is **2nd venue after Phemex with REAL S&P 500** (`sp500_usdt`=$7400; routes via identity-lowercase). SPX intentionally NOT aliased. |
| **WhiteBIT** | 5 entries | `{GOLD: 'XAU', SILVER: 'XAG', PLATINUM: 'XPT', PALLADIUM: 'XPD', USOIL: 'CL'}` (mirrors Gate/Bitmart canonical). WhiteBIT has NO SPX listing → no memecoin trap (first W3-venue without it). Also lists 5 stocks (AMZN/MSTR/NVDA/TSLA + others) via DIRECT identity. |

### venue-coverage.ts PARTIAL_COVERAGE extensions

Per CLAUDE.md `adapter-tradfi-aliases-and-venue-coverage-matrix-are-coupled-pair` (3rd-sighting promoted to permanent rule), same-commit coupling per chapter:

- **WEEX (C1)**: extend ~7 rows (SILVER/PLATINUM/PALLADIUM/USOIL/NATGAS/COPPER/CL + stocks AAPL/AMZN/COIN/GOOGL/META/MSFT/MSTR/NVDA/TSLA — WEEX lists 9 stocks)
- **Bitmart (C2)**: extend ~6 rows (GOLD/SILVER/PLATINUM/PALLADIUM/COPPER/CL/USOIL + VIX/MSFT)
- **XT.COM (C3)**: extend ~9 rows (GOLD/SILVER/PLATINUM/PALLADIUM/USOIL/COPPER/NATGAS + MSFT/MSTR + **SP500 extends to `['HL', 'PHEMEX', 'XT']`** — second venue for real S&P 500!)
- **WhiteBIT (C4)**: extend ~7 rows (GOLD/SILVER/PLATINUM/PALLADIUM/USOIL/NATGAS/COPPER + 5 stocks)

## Identifier-diff (20 sites × 4 venues)

All `'WEEX' | 'BITMART' | 'XT' | 'WHITEBIT'` literals in spec text:

| Venue | Wave Obj | C1 scope | C2 scope | C3 scope | C4 scope | Total |
|---|---|---|---|---|---|---|
| `'WEEX'` | ✓ (×2) | ✓ (own + AC) | (MustNotWrite) | (MustNotWrite) | (MustNotWrite) | 5 sites |
| `'BITMART'` | ✓ | (MustNotWrite) | ✓ | (MustNotWrite) | (MustNotWrite) | 5 sites |
| `'XT'` | ✓ | (MustNotWrite) | (MustNotWrite) | ✓ | (MustNotWrite) | 5 sites |
| `'WHITEBIT'` | ✓ | (MustNotWrite) | (MustNotWrite) | (MustNotWrite) | ✓ | 5 sites |

All literals consistent UPPERCASE matching the planned `ExchangeId` widening. No identifier drift within spec text.

## Public-copy firewall self-audit (clean)

`grep -nE '(EDIT|MODIFY|UPDATE).*(getPerformanceDashboardHtml|landing/|NPM-readme-DRAFT|README\.md|manifest\.json description|lobehub-manifest description)' Prompt/pilot-adapters-w3b.md` → 0 hits. Spec only defines the firewall (lines 29, 149-155); no instruction to write any forbidden file.

## system-map edge-touch enumeration (10 edges)

| # | Edge | Class | Touched by |
|---|---|---|---|
| E-NEW-1 | `signal-MCP → WEEX perp CEX (REST)` (couplers: tight) | NEW | C1 |
| E-NEW-2 | `signal-MCP → Bitmart perp CEX (REST)` (couplers: tight) | NEW | C2 |
| E-NEW-3 | `signal-MCP → XT.COM perp CEX (REST)` (couplers: tight) | NEW | C3 |
| E-NEW-4 | `signal-MCP → WhiteBIT perp CEX (REST)` (couplers: tight) | NEW | C4 |
| E-MUT-1 | `signal-MCP → MCP clients (tools/list)` — enum widened **13 → 17** | MUTATED | C1/C2/C3/C4 incremental |
| E-MUT-2 | `mcp://algovault/venues` resource — returns **17** venues post-W3B (5 promoted + 12 shadow) | MUTATED | C4 |
| E-MUT-3 | `evaluate-venues cron → venues table` — picks up 4 new shadow rows | MUTATED | C4 (manual fire) |
| E-MUT-4 | `seed-signals cron → 4 new adapter routes` | MUTATED | C1/C2/C3/C4 incremental |
| E-MUT-5 | `mcp://algovault/venues TradFi coverage matrix` extended | MUTATED | C1/C2/C3/C4 incremental |
| E-MUT-6 | SP500 PARTIAL_COVERAGE extended `['HL', 'PHEMEX']` → `['HL', 'PHEMEX', 'XT']` | MUTATED | C3 |

## Concurrent-session clean-baseline check

Per CLAUDE.md `concurrent-session clean-baseline check`. `git status -s` shows ONLY 3 untracked audit artifacts from earlier waves; ZERO modified source files. `git log --oneline -8` shows W3A C1+C2+C3 commits + ACTIVATION-PAYWALL-W1 all landed. Repo at clean baseline; `ExchangeId` union literal at 13 venues post-W3A.

## Architect ratification Q-block RATIFIED 2026-05-20

All 4 questions answered with Code's "Recommended" option (Mr.1 inline-confirmed via AskUserQuestion):

| # | Decision | Ratified |
|---|---|---|
| Q-1 | **Path A inline rebase** for the 12+ collapse-class fictionals. Mirrors W3A 2026-05-20 precedent (2nd sighting of identical "spec drafted from memory" pattern); Code substitutes actual primitives during execution; drift documented verbatim in commit bodies + status.md. | ✓ |
| Q-2 | **WEEX uses funding × 2190 annualization** (4h cadence per `delivery: [00,04,08,12,16,20]` schedule). First non-8h venue in adapter fleet. Document in adapter docstring + W3B runbook appendix as the first 4h-cadence precedent. | ✓ |
| Q-3 | **WEEX funding=0 + comment in `getAssetContext`**; `getFundingHistory()` + `getPredictedFundings()` return `[]` (same fail-soft shape as W3A Q-4 shadow-venue pattern). Promotion criteria use PFE WR + sample count, not funding, so this doesn't block shadow→promoted. | ✓ |
| Q-4 | **Extend SP500 PARTIAL_COVERAGE row in C3 to `['HL', 'PHEMEX', 'XT']`** — same-commit coupling. XT.COM is 2nd shadow venue with real S&P 500 perp. Semantic-fingerprint probe confirmed `sp500_usdt`=$7400.11 (real S&P 500). | ✓ |

## Execution path (after Q-1–Q-4 ratified)

### C1 — WEEX adapter
**Files**: `src/lib/adapters/weex.ts` (NEW; symbol `cmt_<coin>usdt` + 4h funding cadence + funding=0 + ticker-based all-in-one + 4-entry TRADFI_ALIASES); `src/types.ts` widen +`'WEEX'`; `src/index.ts` 2 Zod enums; `src/lib/exchange-adapter.ts` switch + import; `src/scripts/seed-signals.ts` `DELAY_PER_EXCHANGE` +`'WEEX':300`; `src/lib/venue-coverage.ts` ~7 row extensions; `tests/unit/weex-adapter.test.ts` (≥10 tests); `src/scripts/seed-shadow-venues-w3a.ts` extend (or NEW `seed-shadow-venues-w3b.ts`); `system-map.md` E-NEW-1 + Last-touched.

### C2 — Bitmart adapter
**Files**: `src/lib/adapters/bitmart.ts` (NEW; symbol `BTCUSDT` Binance-style + step ENUM `{1,3,5,15,30,60,120,240,720}` + start_time/end_time window + 5-entry TRADFI_ALIASES); shared-file extensions; tests; venues seed; system-map E-NEW-2.

### C3 — XT.COM adapter
**Files**: `src/lib/adapters/xt.ts` (NEW; symbol `<coin>_<quote>` lowercase + filter `contractType=="PERPETUAL"` + agg-ticker bundle + 3-entry TRADFI_ALIASES); shared-file extensions; tests; venues seed; **SP500 row extension** to `['HL', 'PHEMEX', 'XT']`; system-map E-NEW-3.

### C4 — WhiteBIT adapter + runbook appendix
**Files**: `src/lib/adapters/whitebit.ts` (NEW; symbol `<coin>_PERP` + v1 kline + v4 futures all-in-one + filter `money_currency=="USDT"` safety belt + 5-entry TRADFI_ALIASES); shared-file extensions; tests; venues seed; `docs/RUNBOOK-VENUE-SHADOW-ONBOARDING.md` W3B appendix (per-venue symbol convention table, WEEX 4h cadence first-precedent, WEEX no-public-funding workaround, Bitmart step ENUM trap, XT.COM endpoint-path correction + SP500 2nd venue, WhiteBIT bundles-everything-in-one-call pattern); system-map E-NEW-4 + W3B-wave-completion summary.

## Verification (Plan-Mode artifact)

After approval, full Plan-Mode artifact saved to `audits/PILOT-ADAPTERS-W3B-endpoint-truth.md` (mirrors W3A pattern; covers all 4 venues + 23 endpoint probes + 4 SPX/SP500 semantic-fingerprints + identifier-diff + HALT triage + Q-1..Q-4 ratification record).
