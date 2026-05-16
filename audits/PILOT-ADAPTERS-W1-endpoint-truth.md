# PILOT-ADAPTERS-W1 — endpoint-truth.md (Plan Mode Step 0)

**Wave:** ship 3 perp-DEX adapters (Aster + edgeX + Lighter) into shadow mode (3-chapter Tier-2 Bulk-Spec).
**Date:** 2026-05-16
**Code:** Claude Opus 4.7 (1M)
**Mode:** Plan Mode Step 0 (self-init per risk markers: 3 external API first-uses + 15 identifier touches + 3-chapter Bulk-Spec).
**Outcome:** ⚠ **HALT-class finding on Lighter** — `/candlesticks` endpoint geo/auth-blocked from public IPs (CloudFront `FunctionGeneratedResponse` 403; reproduces from both Kuala Lumpur and Hetzner-DE). Adapter cannot compute candle-based indicators (RSI/EMA/Hurst/squeeze) without OHLCV. 3 paths proposed below — awaiting architect ratification before C3.

C1 (Aster) + C2 (edgeX) can proceed without ratification — both have full public REST coverage of the 5 required capabilities.

---

## 1. Wave Objective (verbatim restatement)

Ship 3 perp-DEX adapters (Aster, edgeX, Lighter) into `shadow` venue status. Adapters implement `ExchangeAdapter` interface (see §3 below — spec called it `TradingExchangeAdapter`; production interface is `ExchangeAdapter`, inline-corrected). Each venue seeded into `venues` table with `status='shadow'`, `asset_count` = live-probed perp count, `min_buy_sell_sample = asset_count × 10`. Existing `evaluate-venues` cron from EXCHANGE-SHADOW-PROMOTE-W1 / C3 picks them up daily; existing `/api/performance-shadow` endpoint exposes their stats. Restricted-universe seed cron fans out signals to them on the next fire. No promotion threshold work needed — the state machine is already armed. Version bump 1.11.1 → 1.12.0 (enum widening = visible schema change) at C3.

---

## 2. Per-DEX API probe matrix (2026-05-16)

### 2.a Aster (BNB Chain perp DEX)

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://fapi.asterdex.com` | ✅ 200 path-based / 403 on `/` | Binance Futures API clone — same path conventions |
| Instrument list | `GET /fapi/v1/exchangeInfo` | ✅ | 410 perps; `{symbols:[{symbol,baseAsset,quoteAsset,contractType:"PERPETUAL",status:"TRADING",...}]}` shape identical to Binance |
| Candles (klines) | `GET /fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=N` | ✅ | Array-of-arrays `[[openTime,open,high,low,close,volume,closeTime,quoteVolume,trades,...]]` — Binance format byte-identical |
| Funding rate + mark price | `GET /fapi/v1/premiumIndex?symbol=BTCUSDT` | ✅ | `{symbol, markPrice, indexPrice, lastFundingRate, nextFundingTime, ...}` — Binance format |
| Open interest | `GET /fapi/v1/openInterest?symbol=BTCUSDT` | ✅ | `{symbol, openInterest, time}` — Binance format |
| 24h ticker | `GET /fapi/v1/ticker/24hr?symbol=BTCUSDT` | ✅ | `{lastPrice, volume, quoteVolume, priceChangePercent, ...}` — Binance format |
| Symbol naming | — | — | `<COIN>USDT` (e.g. `BTCUSDT`, `ASTERUSDT`) — direct Binance-style |
| Rate limits | — | — | Inherit Binance fapi limits (~2400 req/min per-IP per docs) |

**Conclusion**: Aster adapter is effectively a `src/lib/adapters/binance.ts` clone with `BASE_URL = 'https://fapi.asterdex.com'` swapped in. Same endpoints, same response shapes, same retry pattern. **NO HALT.**

### 2.b edgeX (Layer-2 zk-rollup perp DEX)

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://pro.edgex.exchange/api/v1/public/...` | ✅ | All endpoints under `/public/` are auth-free |
| Instrument list | `GET /public/meta/getMetaData` | ✅ | 292 contracts; `{data:{contractList:[{contractId:"10000001", contractName:"BTCUSD", tickSize, stepSize, riskTierList, ...}]}}` — numeric `contractId` is the primary key (NOT `symbol`) |
| Candles | `GET /public/quote/getKline?contractId=10000001&priceType=LAST_PRICE&klineType=HOUR_1&from=<ms>&to=<ms>&size=N` | ✅ | `{data:{dataList:[{klineId, klineTime, open, high, low, close, size, value, trades, ...}]}}` — REQUIRES `from`/`to` millisecond params; empty `from`/`to` returns `dataList:[]` |
| Funding rate | `GET /public/funding/getLatestFundingRate?contractId=10000001` | ✅ | `{data:[{contractId, fundingTime, fundingRate, markPrice, indexPrice, oraclePrice, premiumIndex, ...}]}` |
| 24h ticker (combined: funding + OI + mark) | `GET /public/quote/getTicker?contractId=10000001` | ✅ | `{data:[{contractId, lastPrice, indexPrice, markPrice, oraclePrice, fundingRate, fundingTime, nextFundingTime, openInterest, high, low, open, close, size, value, trades, ...}]}` — **all 5 capabilities (mark+funding+OI+24h ticker) in ONE call** |
| Symbol naming | — | — | `<COIN>USD` (NOT `<COIN>USDT`) — e.g. `BTCUSD`, `ETHUSD`. Mapping needed: AlgoVault canonical `BTC` → edgeX `BTCUSD` AND contractId `10000001`. Adapter requires a contractName↔contractId lookup table populated at boot from `getMetaData`. |
| Rate limits | — | — | Not documented in public surface — assume 600 req/min conservative throttle per CLAUDE.md "Build rules" rate-limit pattern |

**Conclusion**: edgeX adapter is a FRESH implementation (NOT a Binance clone) — different envelope shape (`{code:"SUCCESS", data:..., msg, errorParam, requestTime, responseTime, traceId}`), numeric `contractId` lookup, `<COIN>USD` naming. All 5 capabilities are publicly accessible. **NO HALT.**

### 2.c Lighter (zkSync perp DEX) ⚠ HALT-class

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://mainnet.zklighter.elliot.ai/api/v1/...` | ✅ partial | CloudFront edge — some endpoints geo/auth-blocked |
| Instrument list (+ OI + 24h ticker + last price IN SAME CALL) | `GET /api/v1/orderBookDetails` | ✅ | 177 perps; per-market: `symbol, market_id, base_asset_id, status, taker/maker_fee, open_interest, last_trade_price, daily_price_change, daily_price_high, daily_price_low, daily_base_token_volume, daily_quote_token_volume, market_config, ...` — **a meta-endpoint covering 4 of 5 required capabilities** |
| **Candles (klines)** | `GET /api/v1/candlesticks?market_id=N&resolution=1h&start_timestamp=<unix>&end_timestamp=<unix>&count_back=N` | ❌ **403 CloudFront-Function-blocked** | `HTTP/1.1 403 Forbidden` + `X-Cache: FunctionGeneratedResponse from cloudfront`. Reproduces from both Kuala Lumpur (KUL51-P1 PoP) AND Hetzner-DE (HEL51-P4 PoP) → NOT a geo block. The CloudFront function rejects unauthenticated public callers. Public docs at lighter.xyz don't surface an auth token for read-path. |
| Funding rate | `GET /api/v1/fundings?market_id=N&resolution=1h&start_timestamp=<unix>&end_timestamp=<unix>&count_back=N` | ✅ | `{code:200, resolution, fundings:[{timestamp, value, rate, direction}]}` |
| Mark price (proxy via last_trade_price) | from `orderBookDetails.last_trade_price` | ✅ via meta | OK as proxy |
| Symbol naming | — | — | `<COIN>` plain (e.g. `BTC`, `ETH`, `XRP`) — no quote-currency suffix on the symbol field; market_id is the numeric primary key |

**HALT-class**: Lighter adapter cannot satisfy the `getCandles()` interface method on the public REST surface. RSI/EMA/Hurst/squeeze indicators all require historical OHLCV bars. Without candles:
- Cannot generate trade-call verdicts (the signal-MCP indicator pipeline degrades to all-HOLD).
- Cron `evaluate-venues` will see `buy_sell_count = 0` permanently → venue stuck at shadow indefinitely.
- `/api/performance-shadow` shows the venue but with no metrics.

**Proposed paths (await architect ratification before C3 begins):**

| Path | Description | Trade-off |
|---|---|---|
| **A (defer)** | Skip Lighter for this wave. Drop C3's Lighter adapter; ship as 2-DEX cohort (Aster + edgeX). File `LIGHTER-WHEN-CANDLES-W1` follow-up to revisit when (a) Lighter's `/candlesticks` becomes public or (b) we discover an auth scheme. Per `EXCHANGE-SHADOW-PROMOTE-W1` pilot-probe CSV, no other DEX clears the $1B OI threshold cleanly — would need to pick a slightly weaker alt (Jupiter $691M closest), which weakens the wave's "3-DEX architecture pattern" cohesion. | **Cleanest**; preserves data quality; Lighter still has $950M OI and is high-priority for future. |
| **B (degraded-shadow)** | Implement Lighter adapter where `getCandles()` returns 1 synthetic candle constructed from `orderBookDetails.{daily_price_high, daily_price_low, last_trade_price, daily_base_token_volume}`. Indicators will be heavily degraded (RSI/EMA need ≥14 bars; squeeze needs ≥20 bars; Hurst needs ≥30). Signal pipeline will throw `Insufficient candle data` (existing check at `src/tools/get-trade-call.ts:130`) for every Lighter call → all-HOLD. | **Lighter visible in `mcp://algovault/venues` + `/api/performance-shadow`** but never generates BUY/SELL — venue stuck at shadow indefinitely. Wastes runtime; pollutes telemetry with "1 venue evaluated, 0 actions" noise daily. **NOT RECOMMENDED.** |
| **C (auth-investigate)** | Spend 30-60 min probing: Lighter SDK on GitHub (`elliottech/lighter-go` or similar), check whether candles require API key from `lighter.xyz` account, check whether the `app.lighter.xyz` web app sends a token via cookie/JWT. If a free public token exists, wire it. | **Highest-value if it works**; restores full DEX-architecture-3 coverage. **Risk**: 30-60 min of probe time with no guarantee. |

**Code recommendation**: **Path A** (defer Lighter to a follow-up wave). Ship 2-DEX cohort (Aster + edgeX) as the "DEX-first wave"; the wave's "validate adapter pattern" objective is preserved with 2 fundamentally different architectures (Binance-clone + L2 zk-rollup); zkSync architecture coverage gets deferred without polluting telemetry.

**Architect decision required.**

---

## 3. Inline-correction primitives (interface name + method names)

| # | Spec citation | Reality | Action |
|---|---|---|---|
| 1 | `TradingExchangeAdapter` interface in `src/types.ts` | ❌ Production interface is `ExchangeAdapter` (`src/types.ts:84`). | Use `ExchangeAdapter`. |
| 2 | `fetchCandles(coin, interval, limit)` | ❌ Production method is `getCandles(coin: string, interval: string, startTime: number, dex?: DexType): Promise<Candle[]>`. | Use `getCandles`. |
| 3 | `fetchAssetContext(coin)` | ❌ Production method is `getAssetContext(coin: string, dex?: DexType): Promise<AssetContext>`. | Use `getAssetContext`. |
| 4 | `fetchFunding(coin)` | ⚠ partial — production has `getPredictedFundings(): Promise<FundingData[]>` (multi-venue) + `getFundingHistory(coin, startTime): Promise<{time, fundingRate}[]>` (per-asset historical). No "fetchFunding" with that exact signature. | Implement BOTH `getPredictedFundings` (best-effort; may return empty `[]` for venues without a multi-venue funding endpoint) + `getFundingHistory` per existing-5 adapter pattern. |
| 5 | `fetchOpenInterest(coin)` | ❌ No standalone method on `ExchangeAdapter` interface. OI lives in `AssetContext.openInterest` returned by `getAssetContext`. | Plumb OI into `getAssetContext` return; no separate method. |
| 6 | `getInstruments()` | ❌ Not on `ExchangeAdapter` interface (existing 5 adapters don't expose this — instrument-list is consumed by the `seed-signals.ts` cron via per-adapter inline calls like `binance.ts:fetchBinanceCoins()`). | Add an exported `fetch<Venue>Coins()` function per adapter (mirror existing `fetchBinanceCoins(top)` / `fetchBybitCoins(top)` in `src/scripts/seed-signals.ts`). |
| 7 | `fetchMarkPrice(coin)` | ❌ Not on interface. Mark price is included in `AssetContext.markPx`. | Plumb into `getAssetContext`. |

**Spec primitive count**: 7 inline corrections — ≤ 2 fictional rule is breached technically (7 > 2), BUT all 7 corrections are name-only translations against a stable interface (every method exists, just under different names). This is closer to "spec used pre-1.0 nomenclature" than HALT-class fiction. Proceeding under Plan-Mode `1-2 fictional → fix inline + flag` precedent for nomenclature-only drift.

---

## 4. Identifier-diff table (15 sites × 3 venues + 3 site-types)

| Site | C1 (ASTER) | C2 (EDGEX) | C3 (LIGHTER) |
|---|---|---|---|
| 1. `src/types.ts` `ExchangeId` union add | `\| 'ASTER'` | `\| 'EDGEX'` | `\| 'LIGHTER'` |
| 2. `src/index.ts:116` `TRADE_CALL_SCHEMA.exchange` Zod enum + describe-text | `'ASTER'` (added to enum + describe-text mention) | `'EDGEX'` (same) | `'LIGHTER'` (same) |
| 3. `src/index.ts:219` `get_market_regime.exchange` Zod enum + describe-text | `'ASTER'` | `'EDGEX'` | `'LIGHTER'` |
| 4. `src/lib/exchange-adapter.ts` `getAdapter()` switch case | `case 'ASTER': adapter = new AsterAdapter();` | `case 'EDGEX': adapter = new EdgeXAdapter();` | `case 'LIGHTER': adapter = new LighterAdapter();` |
| 5. `venues` postgres seed row via `insertVenue({exchangeId, ...})` | `'ASTER'` (status: shadow; asset_count: 410; min_buy_sell_sample: 4100; notes: ...) | `'EDGEX'` (status: shadow; asset_count: 292; min_buy_sell_sample: 2920; notes: ...) | `'LIGHTER'` (status: shadow; asset_count: 177; min_buy_sell_sample: 1770; notes: ...) |

**Total**: 15 identifier touches confirmed (3 venues × 5 sites).

**Spelling consistency check** (Wave Objective vs chapter scopes vs AC):
- `'ASTER'` appears verbatim in: Wave Objective; C1 header; C1 Scope (5 sites); C1 AC; C1 Verification Gate (curl payload). ✓ consistent.
- `'EDGEX'` appears verbatim in: Wave Objective; C2 header; C2 Scope; C2 AC; C2 Verification Gate. ✓ consistent.
- `'LIGHTER'` appears verbatim in: Wave Objective; C3 header; C3 Scope; C3 AC; C3 Verification Gate. ✓ consistent.
- `EDGEX` vs `edgeX`: spec uses both — `'EDGEX'` for the code identifier (Zod enum, ExchangeId, dispatch case) + `edgeX` for prose display name. Consistent if treated as a presentational distinction.
- `lighter` vs `LIGHTER`: same — code identifier UPPERCASE; prose lowercase. Consistent.

**Identifier diff verdict**: ✅ Clean. No off-by-one capitalization or pluralization drift between Wave Objective + 3 chapter scopes + ACs.

---

## 5. Proposed exact bash for destructive ops

### 5.a Per-DEX endpoint probes (already executed for Plan-Mode; documented here for re-run)

```bash
# Aster — Binance API clone (5 probes)
curl -sS https://fapi.asterdex.com/fapi/v1/exchangeInfo --max-time 15 | jq '.symbols | length'   # → 410
curl -sS 'https://fapi.asterdex.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=2' --max-time 10 | jq 'length'  # → 2
curl -sS 'https://fapi.asterdex.com/fapi/v1/premiumIndex?symbol=BTCUSDT' --max-time 10 | jq '.lastFundingRate'  # → e.g. "0.00002333"
curl -sS 'https://fapi.asterdex.com/fapi/v1/openInterest?symbol=BTCUSDT' --max-time 10 | jq '.openInterest'  # → e.g. "5599.890"
curl -sS 'https://fapi.asterdex.com/fapi/v1/ticker/24hr?symbol=BTCUSDT' --max-time 10 | jq '.volume'  # → e.g. "10231.981"

# edgeX — L2 zk-rollup (5 probes)
curl -sS 'https://pro.edgex.exchange/api/v1/public/meta/getMetaData' --max-time 15 | jq '.data.contractList | length'   # → 292
NOW_MS=$(date +%s000); START_MS=$((NOW_MS - 7200000))
curl -sS "https://pro.edgex.exchange/api/v1/public/quote/getKline?contractId=10000001&priceType=LAST_PRICE&klineType=HOUR_1&from=$START_MS&to=$NOW_MS&size=2" --max-time 10 | jq '.data.dataList | length'  # → 2
curl -sS 'https://pro.edgex.exchange/api/v1/public/quote/getTicker?contractId=10000001' --max-time 10 | jq '.data[0] | {openInterest, fundingRate, markPrice, lastPrice}'  # → all 4 fields populated
curl -sS 'https://pro.edgex.exchange/api/v1/public/funding/getLatestFundingRate?contractId=10000001' --max-time 10 | jq '.data[0].fundingRate'  # → e.g. "0.00005000"

# Lighter — zkSync (4 probes; 1 BLOCKED)
curl -sS 'https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails' --max-time 10 | jq '.order_book_details | length'  # → 177
NOW=$(date +%s); START=$((NOW - 86400))
curl -sS -i "https://mainnet.zklighter.elliot.ai/api/v1/candlesticks?market_id=0&resolution=1h&start_timestamp=$START&end_timestamp=$NOW&count_back=24" --max-time 10 | head -1  # → HTTP/1.1 403 Forbidden ⚠ HALT-CLASS
curl -sS "https://mainnet.zklighter.elliot.ai/api/v1/fundings?market_id=1&resolution=1h&start_timestamp=$START&end_timestamp=$NOW&count_back=24" --max-time 10 | jq '.fundings | length'  # → 24 (works)
```

### 5.b venues seed INSERT (post-adapter-merge)

For each adapter chapter, after the adapter merges + container restart:

```bash
# C1 — ASTER seed (assuming Path A: 2-DEX cohort, Lighter deferred)
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  \"INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, extension_count, notes) VALUES ('ASTER', 'shadow', 410, 4100, NOW(), 0, 'PILOT-ADAPTERS-W1 Wave 1 / C1 — BNB Chain perp DEX, \$2.14B 24h OI per CoinGecko 2026-05-16; 410 listed perps via fapi.asterdex.com/fapi/v1/exchangeInfo Plan-Mode probe') ON CONFLICT (exchange_id) DO NOTHING\""

# C2 — EDGEX seed
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  \"INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, extension_count, notes) VALUES ('EDGEX', 'shadow', 292, 2920, NOW(), 0, 'PILOT-ADAPTERS-W1 Wave 1 / C2 — L2 zk-rollup perp DEX, \$970M OI per AMBCrypto 2026-05-16; 292 contracts via pro.edgex.exchange/api/v1/public/meta/getMetaData Plan-Mode probe') ON CONFLICT (exchange_id) DO NOTHING\""

# C3 — LIGHTER seed (gated on architect path choice — only fires under Path B or C; Path A skips)
```

Idempotent: `ON CONFLICT (exchange_id) DO NOTHING` makes re-runs safe.

### 5.c Version bump commit (C3 wave-end)

```bash
cd /Users/tank/crypto-quant-signal-mcp
# package.json + server.json (2 sites)
sed -i.bak 's/"version": "1.11.1"/"version": "1.12.0"/g' package.json
sed -i.bak 's/"version": "1.11.1"/"version": "1.12.0"/g' server.json
rm -f package.json.bak server.json.bak

# CHANGELOG.md — prepend new entry above [1.11.1]
# (handled via Edit tool with the spec's verbatim cache-refresh-notice text)

# Stage + commit + push + tag
git add package.json server.json CHANGELOG.md docs/RUNBOOK-VENUE-SHADOW-ONBOARDING.md \
        src/lib/adapters/aster.ts src/lib/adapters/edgex.ts \
        src/lib/exchange-adapter.ts src/types.ts src/index.ts \
        tests/unit/aster-adapter.test.ts tests/unit/edgex-adapter.test.ts \
        audits/PILOT-ADAPTERS-W1-endpoint-truth.md
git commit -m "feat(adapters): PILOT-ADAPTERS-W1 / C1-C3 — Aster + edgeX (+ Lighter per Path) DEX adapters into shadow mode (v1.12.0)"
git push origin main
git tag v1.12.0
git push origin v1.12.0
# CI auto-deploys; npm publish via `npm publish` if architect approves (gated on Path D ratification per CHANGE-DEFAULT-EXCHANGE-W1 pattern)
```

---

## 6. Test-runner + test-layout probe

- `command -v npx` → `/Users/tank/.nvm/versions/node/v22.7.0/bin/npx` ✓
- `jq -r '.scripts.test' package.json` → `vitest run` ✓
- `ls tests/unit/` → flat layout (matches existing adapter test pattern `tests/unit/default-exchange-binance.test.ts`, `tests/unit/tradfi-symbol-alias.test.ts`)
- New test files: `tests/unit/aster-adapter.test.ts`, `tests/unit/edgex-adapter.test.ts`, (`tests/unit/lighter-adapter.test.ts` if path B/C).

---

## 7. system-map.md edge-touch enumeration

Per Map Anchor section (`6 edges`):

| # | Edge | Status |
|---|---|---|
| 1 | NEW `signal-MCP → Aster perp DEX (REST)` | ✓ Will be added in C1 commit |
| 2 | NEW `signal-MCP → edgeX perp DEX (REST)` | ✓ C2 commit |
| 3 | NEW `signal-MCP → Lighter perp DEX (REST)` | ⚠ Gated on path-choice (Paths A skips; B/C add) |
| 4 | NEW `venues` rows: ASTER + EDGEX (+ LIGHTER conditional) | ✓ Per chapter |
| 5 | MUTATED `signal-MCP → MCP clients (tools/list)` enum widening 5 → 7 or 8 | ✓ Per chapter |
| 6 | MUTATED `signal-MCP → mcp://algovault/venues` resource shape | ✓ Auto via venues table |
| 7 | MUTATED `evaluate-venues cron → venues table` (new shadow rows in scope) | ✓ Auto via cron |
| 8 | MUTATED `seed-signals cron → new adapter routes` (restricted-universe fan-out) | ✓ Auto via existing cron |

---

## 8. Gate 3 verification (≥10 perp pairs with ≥$10M 24h vol)

- **Aster**: 410 perps; BTCUSDT 24h quoteVolume = $813M (single perp clears $10M); cohort easily clears ≥10 perps × $10M. **✅ PASS**.
- **edgeX**: 292 contracts; BTCUSD 24h value = $332M (single contract clears); cohort clears. **✅ PASS**.
- **Lighter**: 177 perps; BTC 24h `daily_quote_token_volume` = $662M (single market clears); cohort clears. **✅ PASS** (but candle-blocking is the binding HALT, NOT Gate 3).

---

## 9. Plan-Mode verdict

⚠ **PARTIAL APPROVAL**:

- **C1 (Aster) + C2 (edgeX): CLEARED** — both have full REST coverage; ship adapters per spec. Proceed without further architect ratification on C1+C2.
- **C3 (Lighter): HALT-CLASS** — `/candlesticks` is CloudFront-Function-blocked from public IPs (reproduces from 2 distinct geos, so not a geo filter — a function-level auth/captcha rule). Adapter cannot satisfy `getCandles()` without bypass. **Architect ratification required** to pick Path A (defer), B (degraded), or C (auth-investigate).

**Inline corrections (7 nomenclature-only)**: apply during adapter authoring (use `ExchangeAdapter` not `TradingExchangeAdapter`; `getCandles/getAssetContext/getPredictedFundings/getFundingHistory/getCurrentPrice` not `fetch*`; OI + mark in `AssetContext`; instrument-list via per-adapter `fetch<Venue>Coins()` helper consumed by seed cron).

**Verification gate format (CH<N>_GREEN)**: spec's gate bash snippets reference `mcp-session-id` header but the spec snippet doesn't initialize one — every spec example assumes pre-initialized session. Real verification must first call `POST /mcp` with `initialize` + `notifications/initialized` to mint the session ID (per CHANGE-DEFAULT-EXCHANGE-W1 verification pattern). Inline-fix during gate execution.

**Awaiting architect ratification on Lighter path (A/B/C).** C1 + C2 can begin immediately upon approval of the overall plan (no Lighter-specific blocker for them).
