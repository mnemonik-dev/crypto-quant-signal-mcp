# PILOT-ADAPTERS-W2 — endpoint-truth.md (Plan Mode Step 0)

**Wave:** ship 3 perp-CEX adapters (Gate + MEXC + KuCoin) into shadow mode (3-chapter Tier-2 Bulk-Spec).
**Date:** 2026-05-19 (rev 2 — TradFi catalog re-probe + alias maps per Mr.1 directive)
**Code:** Claude Opus 4.7 (1M)
**Mode:** Plan Mode Step 0 (self-init per 3 risk markers + cross-chapter peek).
**Outcome:** ✅ **NO HALT-class findings**. All 3 venues have full public REST coverage of the 5 required capabilities with all-in-one ticker endpoints (cleaner than Binance's 3-fan-out pattern). Funding cadences confirmed 8h × 1095 across all 3. Full TradFi catalog probe revealed extensive coverage on all 3 (Gate 26 / MEXC 15 / KuCoin 36 TradFi symbols) — **all integrated in one batch per Mr.1 directive 2026-05-19**. Awaiting architect approval before C1.

## REVISION NOTE (2026-05-19 rev 2)

Mr.1 caught that the initial probe's regex was too narrow (only 8 symbols: TSLA/XAU/SP500/GOLD/NVDA/MSTR/COIN/AAPL — missed XAUT/SILVER/USOIL/UKOIL/etc.). Re-probed against the **full AlgoVault `TRADFI_FALLBACK` set** (60 symbols from `src/lib/asset-tiers.ts:43-53`) and ran a **semantic-fingerprint price-probe** per the `semantic-fingerprint-probe-before-alias-commit` skill to detect token-vs-spot drift. Critical findings in §3.x below.

**Decision per Mr.1**: integrate ALL TradFi alias maps in ONE batch (Gate alias map + MEXC alias map + KuCoin alias map) — do NOT defer to a future TRADFI-EXTEND-W1 wave. Scope of each chapter widens accordingly to include the venue's TRADFI_ALIASES constant in the adapter file.

---

## 1. Wave Objective (verbatim restatement)

Ship 3 perp-CEX adapters (Gate, MEXC, KuCoin) into `shadow` venue status. Adapters implement `ExchangeAdapter` interface (note: spec calls it `TradingExchangeAdapter` — production interface name is `ExchangeAdapter` per `src/types.ts:84`, same nomenclature inline-correction as Wave 1). Each venue seeded into `venues` table with `status='shadow'`, `asset_count` = live-probed USDT-perp count, `min_buy_sell_sample = asset_count × 10`. Existing `evaluate-venues` cron + `/api/performance-shadow` endpoint + restricted-universe seed cron pick them up automatically post-deploy.

---

## 2. Per-CEX API probe matrix (2026-05-19, all live)

### 2.a Gate.io (USDT-M Futures)

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://api.gateio.ws` | ✅ (root 404; paths-based) | All probed endpoints public + auth-free |
| **Instrument list** | `GET /api/v4/futures/usdt/contracts` | ✅ | **719 USDT perps** (close to spec's ~721 estimate). Per-contract shape: `{name:"BTC_USDT", type:"direct", mark_price, funding_rate, funding_interval:28800, funding_next_apply, ...}`. **Funding + mark price + funding_interval embedded** — single call gives instrument list + funding for all venues at once. |
| **Candles** | `GET /api/v4/futures/usdt/candlesticks?contract=BTC_USDT&interval=1h&limit=N` | ✅ | Returns `[{o, h, l, c, v, sum, t}]` — row-wise, similar to Binance but field names `o/h/l/c/v/sum/t` (NOT `open/high/low/close/volume/time` and NOT array-of-arrays). |
| **All-in-one ticker** | `GET /api/v4/futures/usdt/tickers?contract=BTC_USDT` | ✅ | Bundles ALL 5 capabilities: `funding_rate`, `mark_price`, `index_price`, `volume_24h_quote`, `total_size` (OI), `high_24h`, `low_24h`, `last`. Single REST call → `getAssetContext`. |
| Funding rate history | `GET /api/v4/futures/usdt/funding_rate?contract=BTC_USDT` | ✅ | (path verified per Gate.io v4 docs) |
| Symbol convention | — | — | `<COIN>_USDT` (underscore). Round-trip: AlgoVault `BTC` ⇄ Gate `BTC_USDT`. |
| **Funding cadence** | `funding_interval: 28800` seconds | ✅ | **8h** → annualize × 1095. Same as Binance/Bybit/Bitget convention. |
| **TradFi catalog** (full probe rev 2) | grep against TRADFI_FALLBACK 60-symbol set | ✅ | **26 TradFi symbols listed**: `XAU_USDT, XAUT_USDT, XAG_USDT, XPT_USDT, XPD_USDT, XCU_USDT, CL_USDT, NG_USDT, SPX_USDT, VIX_USDT, EWJ_USDT, EWY_USDT, TSM_USDT, MSFT_USDT, INTC_USDT, AMD_USDT, BABA_USDT, COST_USDT, CRWV_USDT, HIMS_USDT, LITE_USDT, LLY_USDT, MU_USDT, NFLX_USDT, SNDK_USDT, USAR_USDT`. **`SPX_USDT` is SPX6900 memecoin ($0.37) NOT S&P 500** — must NOT alias `SP500 → SPX`. Stock symbols are direct (no alias). |
| Rate limits | — | — | Standard Gate.io v4 quotas (not surfaced in headers; conservative 300ms inter-call delay). |
| **Gate 3 (≥10 perps ≥$10M 24h vol)** | `jq '[.[] | select(...vol >= 10M)] | length'` | ✅ | **25** ≥ 10 PASS |

**Gate.io `TRADFI_ALIASES` map** (canonical AlgoVault → Gate native base; suffix `_USDT` added by `toGateSymbol`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAU',        // Gate has BOTH XAU + XAUT; prefer XAU (spot, matches Binance canonical)
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  COPPER: 'XCU',
  NATGAS: 'NG',
  // CL → CL (direct; Gate uses canonical CL_USDT for WTI crude)
  // SPX intentionally NOT mapped — SPX_USDT is SPX6900 memecoin ($0.37), NOT S&P 500 ($7000+)
  // Stocks: direct mapping (TSM/MSFT/INTC/AMD/BABA/COST/CRWV/HIMS/LITE/LLY/MU/NFLX/SNDK/USAR/VIX/EWJ/EWY)
};
```

**Conclusion**: Gate.io adapter is a clean fresh implementation — shape close to Binance but with `_USDT` underscore + custom envelope shape. Single all-in-one ticker call simplifies `getAssetContext`. Full TradFi alias map (6 entries) covers metals + nat-gas; stocks/ETFs/VIX route direct. ~280 LoC (was ~250 — extra LoC for alias map). **NO HALT.**

### 2.b MEXC (USDT-M Futures)

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://contract.mexc.com` | ✅ (root 403 protected page; paths-based) | All probed `/api/v1/contract/*` endpoints public + auth-free |
| **Instrument list** | `GET /api/v1/contract/detail` | ✅ | **881 USDT perps** (slightly below spec's ~922 estimate; live re-probe wins per Factuality LAW). Per-contract shape: `{symbol:"BTC_USDT", settleCoin:"USDT", contractSize, fundingRate:null, nextFundingRateTime:null, ...}`. Funding null on the list endpoint; queried per-symbol below. |
| **Candles** | `GET /api/v1/contract/kline/BTC_USDT?interval=Min60&start=<sec>&end=<sec>` | ✅ | **Column-wise** response (unique among the 3): `{time:[], open:[], high:[], low:[], close:[], vol:[]}`. Adapter must zip-into rows. `interval` strings: `Min1`, `Min5`, `Min15`, `Min30`, `Min60`, `Hour4`, `Hour8`, `Day1`, `Week1`, `Month1`. |
| **All-in-one ticker** | `GET /api/v1/contract/ticker?symbol=BTC_USDT` | ✅ | Bundles 5 capabilities: `lastPrice, indexPrice, fairPrice (=mark), holdVol (=OI), fundingRate, volume24, amount24, high24Price, lower24Price`. Single REST call → `getAssetContext`. |
| **Funding rate** | `GET /api/v1/contract/funding_rate/BTC_USDT` | ✅ | Returns `{symbol, fundingRate, maxFundingRate, minFundingRate, collectCycle:8, nextSettleTime, idxPrice, fairPrice}`. |
| OI dedicated endpoint | `GET /api/v1/contract/open_interest/BTC_USDT` | ❌ Access Denied (Akamai EdgeKey 403) | OI lives in ticker as `holdVol`. Use ticker, not the dedicated endpoint. |
| Symbol convention | — | — | `<COIN>_USDT` (underscore). Same as Gate.io. |
| **Funding cadence** | `collectCycle: 8` (hours) | ✅ | **8h** → annualize × 1095. |
| **TradFi catalog** (full probe rev 2) | grep against TRADFI_FALLBACK 60-symbol set | ✅ | **15 TradFi symbols listed**: `XAUT_USDT, SILVER_USDT, XPT_USDT, XPD_USDT, COPPER_USDT, USOIL_USDT, UKOIL_USDT, EUR_USDT, JPY_USDT, GBP_USDT, SPX_USDT (price unavailable — likely memecoin or delisted), JP225_USDT, EWJ_USDT, EWY_USDT, XLE_USDT`. MEXC uses semantically-descriptive symbol names (SILVER/USOIL/UKOIL vs CEX-standard XAG/CL/BRENT) so aliasing maps canonical → native via the descriptive name. |
| **Gate 3** | `jq '[.data[] | select(.amount24 >= 10M)] | length'` | ✅ | **44** ≥ 10 PASS |

**MEXC `TRADFI_ALIASES` map** (canonical AlgoVault → MEXC native base; suffix `_USDT` added by `toMexcSymbol`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAUT',       // MEXC has ONLY XAUT (Tether Gold); price-probe confirmed $4546 ≈ gold spot $4555
  // SILVER → SILVER (direct; MEXC uses literal canonical name)
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  // COPPER → COPPER (direct; MEXC uses literal canonical name)
  CL: 'USOIL',         // canonical CL = WTI crude → MEXC's USOIL_USDT
  BRENTOIL: 'UKOIL',   // canonical BRENTOIL → MEXC's UKOIL_USDT
  // FX: EUR/GBP/JPY direct (canonical names match MEXC's symbols)
  // JP225 → JP225 (direct)
  // SPX intentionally NOT mapped — price unavailable on probe; safer to skip
  // ETFs: EWJ/EWY/XLE direct
};
```

**Conclusion**: MEXC adapter has the **column-wise candle response** as its unique-shape complexity (need a zip helper). 4 TradFi aliases (GOLD/CL/BRENTOIL/PLATINUM/PALLADIUM); SILVER/COPPER/FX/Index/ETFs route direct. ~290 LoC. **NO HALT.**

### 2.c KuCoin (USDT-M Futures)

| Capability | Endpoint | Status | Sample / Notes |
|---|---|---|---|
| BASE_URL liveness | `https://api-futures.kucoin.com` | ✅ (root 404; paths-based) | Distinct host from KuCoin spot `api.kucoin.com` per spec note. Public/auth-free for read endpoints. |
| **Instrument list** | `GET /api/v1/contracts/active` | ✅ | **594 active USDT-margined perps** (close to spec's ~606). Per-contract shape: `{symbol:"XBTUSDTM", baseCurrency:"XBT", quoteCurrency:"USDT", settleCurrency:"USDT", type:"FFWCSX", fundingFeeRate, predictedFundingFeeRate, nextFundingRateTime:<ms_remaining>, openInterest, markPrice, multiplier:0.001, ...}`. **All 5 capabilities embedded** in this single endpoint — instrument list IS the ticker. |
| **Candles** | `GET /api/v1/kline/query?symbol=XBTUSDTM&granularity=60&from=<ms>&to=<ms>` | ✅ | Returns array-of-arrays `[[t, o, h, l, c, v], ...]` — Binance-like row shape. `granularity` is INTEGER minutes (`60` for 1h, `15` for 15m, `1440` for 1d). |
| Funding rate current | `GET /api/v1/funding-rate/XBTUSDTM/current` | ✅ | Returns `{symbol:".XBTUSDTMFPI8H", granularity:28800000, value, dailyInterestRate, fundingRateCap, fundingRateFloor, period:1, fundingTime}`. The trailing `FPI8H` and `granularity:28800000ms` confirm 8h cadence. |
| Symbol convention | — | — | **DIVERGENT**: `XBTUSDTM` for BTC (X-prefix replaces B per KuCoin tradition; M-suffix for USDT-margined). Other coins: `<COIN>USDTM` (e.g. `ETHUSDTM`). Need `KUCOIN_SYMBOL_OVERRIDES = { BTC: 'XBT' }` + the M-suffix helper. |
| **Funding cadence** | `granularity: 28800000 ms` | ✅ | **8h** → annualize × 1095. |
| **TradFi catalog** (full probe rev 2) | grep against TRADFI_FALLBACK 60-symbol set with `USDTM` suffix | ✅ | **36 TradFi symbols listed** — most extensive of the 3. Metals: `XAUTUSDTM, XAGUSDTM, XPTUSDTM, XPDUSDTM, COPPERUSDTM`. Energy: `CLUSDTM, NATGASUSDTM`. Stocks: `AAPL, AMD, AMZN, BABA, COIN, COST, CRCL, CRWV, GOOGL, HIMS, HOOD, INTC, LITE, LLY, META, MSFT, MSTR, MU, NFLX, NVDA, ORCL, PLTR, SNDK, TSLA, TSM, USAR` (26 stocks direct). ETFs: `EWJ, EWY`. Index: `SPXUSDTM` (memecoin per price probe — DO NOT alias). |
| **XAUT semantic verify** | price-probe: $4548.69 mark | ✅ confirmed gold-tracking | Tether Gold tracks gold spot ±0.2% (price-probe $4548 vs Gate's XAU $4555 → 0.15% drift, well within Tether redemption spread). Safe to alias `GOLD → XAUT` on KuCoin in this wave — per Mr.1 2026-05-19 directive: "integrate all in one batch". |
| **Gate 3** | `jq '[.data[] | select(.turnoverOf24h >= 10M)] | length'` | ✅ | **26** ≥ 10 PASS |
| Auth requirement | All 4 probed endpoints | ✅ public | No HMAC required for candle/funding/contracts/active. Per spec concern: confirmed NO auth needed for the adapter's read path. |

**KuCoin `TRADFI_ALIASES` map** (canonical AlgoVault → KuCoin native base; suffix `USDTM` + `BTC → XBT` override added by `toKucoinSymbol`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAUT',       // KuCoin has ONLY XAUT; price-probe confirmed $4548 ≈ gold spot
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  // COPPER → COPPER (literal direct)
  // CL → CL (direct)
  // NATGAS → NATGAS (direct)
  // Stocks: ALL direct (TSLA/NVDA/AAPL/AMZN/GOOGL/META/MSFT/MSTR/COIN/AMD/INTC/HOOD/BABA/COST/LLY/RIVN/TSM/CRCL/SNDK/CRWV/HIMS/DKNG/MU/NFLX/PLTR/ORCL/LITE/USAR)
  // SPX intentionally NOT mapped — SPXUSDTM is SPX6900 memecoin ($0.37)
};
```

**Conclusion**: KuCoin adapter is the most-divergent of the 3 (X-prefix BTC + M-suffix USDTM + integer-minutes granularity), but all endpoints are publicly accessible. Most extensive TradFi catalog of all 3 venues — 4 metal aliases + 26 direct stocks. ~310 LoC. **NO HALT.**

---

## 2.d Semantic-fingerprint price-probe (per `semantic-fingerprint-probe-before-alias-commit` skill)

Required for every TradFi alias candidate per TRADFI-SYMBOL-ALIAS-W1 lesson: confirm the native symbol's mark price is within ±5% of the canonical asset's expected order of magnitude. Pre-commit any alias that fails sanity is a Data Integrity LAW violation (silently route GOLD → memecoin).

**Probe results** (2026-05-19, live):

| Native symbol | Venue | Mark price | Expected (canonical) | Verdict |
|---|---|---|---|---|
| `XAU_USDT` | Gate.io | **$4555.43** | Gold spot ~$4500-5000/oz | ✅ MATCH — alias `GOLD → XAU` on Gate |
| `XAUT_USDT` | Gate.io | **$4550.50** | Gold spot (XAUT tracks XAU) | ✅ MATCH — Gate has both; prefer XAU per Binance canonical |
| `XAUT_USDT` | MEXC | **$4546.50** | Gold spot | ✅ MATCH — alias `GOLD → XAUT` on MEXC (XAU not listed) |
| `XAUTUSDTM` | KuCoin | **$4548.69** | Gold spot | ✅ MATCH — alias `GOLD → XAUT` on KuCoin (XAU not listed) |
| `XAG_USDT` | Gate.io, KuCoin | **$76.54 / $76.47** | Silver spot ~$50-80/oz | ✅ MATCH — alias `SILVER → XAG` |
| `SILVER_USDT` | MEXC | **$76.50** | Silver spot | ✅ MATCH — direct (no alias; literal canonical name) |
| `XPT_USDT` | all 3 | **$1976-1979** | Platinum spot ~$1000-2000/oz | ✅ MATCH — alias `PLATINUM → XPT` |
| `XPD_USDT` | all 3 | **$1404-1407** | Palladium spot ~$1000-1500/oz | ✅ MATCH — alias `PALLADIUM → XPD` |
| `XCU_USDT` | Gate.io | **$6.287** | Copper spot ~$4-7/lb | ✅ MATCH — alias `COPPER → XCU` on Gate |
| `COPPER_USDT/M` | MEXC, KuCoin | **$6.28-6.29** | Copper spot | ✅ MATCH — direct (literal canonical name) |
| `CL_USDT/M` | Gate, KuCoin | **$103.28 / $103.44** | WTI crude ~$70-120/bbl | ✅ MATCH — direct (canonical CL is WTI) |
| `USOIL_USDT` | MEXC | **$103.26** | WTI crude (MEXC's name for CL) | ✅ MATCH — alias `CL → USOIL` on MEXC |
| `UKOIL_USDT` | MEXC | **$105.69** | Brent crude ~$75-120/bbl | ✅ MATCH — alias `BRENTOIL → UKOIL` on MEXC |
| `NG_USDT` | Gate.io | **$3.177** | Natural gas spot ~$2-5/MMBtu | ✅ MATCH — alias `NATGAS → NG` on Gate |
| `NATGASUSDTM` | KuCoin | **$3.183** | Natural gas spot | ✅ MATCH — direct (literal canonical) |
| `EUR_USDT` | MEXC | **1.1649** | EUR/USD spot ~1.05-1.20 | ✅ MATCH — direct |
| `GBP_USDT` | MEXC | **1.3419** | GBP/USD spot ~1.20-1.40 | ✅ MATCH — direct |
| `JPY_USDT` | MEXC | **0.00628** | 1/USDJPY ≈ 1/159 = 0.00629 | ✅ MATCH — direct (note: MEXC quotes JPY/USD reciprocal) |
| `JP225_USDT` | MEXC | **$60819** | Nikkei 225 ~$30k-80k | ✅ MATCH — direct |
| `VIX_USDT` | Gate.io | **$18.82** | VIX volatility index ~$12-30 | ✅ MATCH — direct |
| `EWJ_USDT/M` | all 3 | **$90.60-90.63** | EWJ Japan ETF ~$50-100 | ✅ MATCH — direct |
| `EWY_USDT/M` | all 3 | **$172-173** | EWY Korea ETF ~$50-150 | ✅ MATCH — direct |
| `XLE_USDT` | MEXC | **$60.81** | XLE Energy ETF ~$50-100 | ✅ MATCH — direct |
| `TSLA*` | KuCoin | **$407.20** | Tesla ~$150-500 | ✅ MATCH — direct |
| `NVDA*` | KuCoin | **$221.16** | NVIDIA ~$100-300 | ✅ MATCH — direct |
| `MSTR*` | KuCoin | **$167.19** | MicroStrategy ~$100-500 | ✅ MATCH — direct |
| `COIN*` | KuCoin | **$189.81** | Coinbase ~$150-300 | ✅ MATCH — direct |
| `AAPL*` | KuCoin | **$297.00** | Apple ~$150-300 | ✅ MATCH — direct |
| `META*` | KuCoin | **$609.79** | Meta ~$400-700 | ✅ MATCH — direct |
| `MSFT_USDT` | Gate.io | **$423.82** | Microsoft ~$300-500 | ✅ MATCH — direct |
| `TSM_USDT/M` | Gate, KuCoin | **$394.80 / $395.x** | TSMC ~$150-400 | ✅ MATCH — direct |
| ⚠ **`SPX_USDT`** | Gate.io | **$0.3689** | S&P 500 ~$7000+ (NOT $0.37) | ❌ **TRAP — this is SPX6900 memecoin**. **DO NOT alias** `SP500 → SPX`. Per TRADFI-SYMBOL-ALIAS-W1 lesson. |
| ⚠ **`SPXUSDTM`** | KuCoin | **$0.3692** | S&P 500 ~$7000+ | ❌ **Same trap — SPX6900 memecoin**. DO NOT alias. |
| ⚠ **`SPX_USDT`** | MEXC | **n/a** (price unavailable) | S&P 500 | ❌ unclear; safer not to alias |

**Conclusion**: every alias candidate passed price-probe except SPX (3 venues — confirmed SPX6900 memecoin trap on Gate + KuCoin, indeterminate on MEXC). `SP500` canonical remains HL-only per the existing 24-symbol "TIER_3 HL-only" set in system-map.md. All other TradFi aliases SAFE to ship.

---

## 3. Inline-correction primitives (carry-forward from Wave 1)

Same 7 nomenclature-only inline corrections as PILOT-ADAPTERS-W1 apply here (spec uses pre-1.0 method names; production interface is `ExchangeAdapter`):

| Spec citation | Reality | Action |
|---|---|---|
| `TradingExchangeAdapter` interface | Production: `ExchangeAdapter` (`src/types.ts:84`) | Use `ExchangeAdapter` |
| `fetchCandles` / `fetchAssetContext` / `fetchFunding` / `fetchOpenInterest` / `getInstruments` / `fetchMarkPrice` | Production: `getCandles` / `getAssetContext` / `getPredictedFundings` + `getFundingHistory` / OI inside `AssetContext` / per-adapter `fetch<Venue>Coins()` for instrument list / mark price inside `AssetContext.markPx` | Use production method names; instrument-list helper exported separately for seed-signals.ts consumption |

---

## 4. Identifier-diff table (15 sites × 3 venues + 5 site-types)

| Site | C1 (GATE) | C2 (MEXC) | C3 (KUCOIN) |
|---|---|---|---|
| 1. `src/types.ts` `ExchangeId` union | `\| 'GATE'` | `\| 'MEXC'` | `\| 'KUCOIN'` |
| 2. `src/index.ts` `TRADE_CALL_SCHEMA.exchange` Zod enum + describe-text | `'GATE'` (added enum member + describe-text addendum: `'GATE' = Gate.io USDT-M Futures (shadow — experimental)`) | `'MEXC'` (same) | `'KUCOIN'` (same) |
| 3. `src/index.ts` `get_market_regime.exchange` Zod enum | `'GATE'` | `'MEXC'` | `'KUCOIN'` |
| 4. `src/lib/exchange-adapter.ts` `getAdapter()` switch case | `case 'GATE': adapter = new GateAdapter();` | `case 'MEXC': adapter = new MEXCAdapter();` | `case 'KUCOIN': adapter = new KuCoinAdapter();` |
| 5. `venues` postgres seed via `insertVenue({...})` | `'GATE'` (asset_count: 719; min_buy_sell_sample: 7190) | `'MEXC'` (asset_count: 881; min_buy_sell_sample: 8810) | `'KUCOIN'` (asset_count: 594; min_buy_sell_sample: 5940) |

**Total**: 15 identifier touches (3 venues × 5 sites). ✅ Consistent across Wave Objective + 3 chapter scopes + ACs. Capitalization: code identifier UPPERCASE (e.g. `'GATE'`), prose display name proper-case (`Gate.io`).

---

## 5. Public-copy firewall self-audit

| Surface | Spec instruction | Action verb present? | Verdict |
|---|---|---|---|
| `getPerformanceDashboardHtml` | `DO NOT TOUCH` × 3 mentions | No `update/edit/patch/rewrite/add` paired with this surface | ✅ ZERO HITS |
| `landing/*.html` | `DO NOT TOUCH` | No `update/edit` paired | ✅ ZERO HITS |
| `NPM-readme-DRAFT.md` | `DO NOT TOUCH` | No `update/edit` paired | ✅ ZERO HITS |
| `manifest.json` description | `DO NOT TOUCH` | No `update/edit` paired | ✅ ZERO HITS |
| `lobehub-manifest.json` description | `DO NOT TOUCH` | No `update/edit` paired | ✅ ZERO HITS |
| `README.md` hero / "What's new" | `DO NOT TOUCH` | No `update/edit` paired | ✅ ZERO HITS |
| `package.json.version` / `server.json.version` | `DO NOT BUMP` | No `bump/update` paired | ✅ ZERO HITS |
| `CHANGELOG.md` `[X.Y.Z]` entries | `DO NOT ADD` | No `add` paired | ✅ ZERO HITS |

**Total: 18 firewall-language mentions in spec (`DO NOT TOUCH` / `DO NOT BUMP` / `DO NOT ADD` / `MUST NOT WRITE` / `HARD FIREWALL` / `FIREWALL`).** No instruction in the spec contradicts the firewall — the firewall is internally coherent. **Audit result: clean.**

---

## 6. Proposed exact bash

### 6.a Per-CEX endpoint probes (already executed; documented for re-run)

```bash
# Gate.io — 5 endpoints
curl -sS 'https://api.gateio.ws/api/v4/futures/usdt/contracts' --max-time 15 | jq 'length'   # → 719
curl -sS 'https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=BTC_USDT&interval=1h&limit=2' --max-time 10 | jq 'length'  # → 2
curl -sS 'https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT' --max-time 10 | jq '.[0] | {funding_rate, mark_price, total_size, volume_24h_quote}'
curl -sS 'https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT' --max-time 10 | jq '{funding_interval, mark_price}'  # funding_interval=28800 → 8h × 1095

# MEXC — 4 endpoints (OI from ticker, not dedicated endpoint)
curl -sS 'https://contract.mexc.com/api/v1/contract/detail' --max-time 15 | jq '.data | length'   # → 881
NOW=$(date +%s); START=$((NOW - 7200))
curl -sS "https://contract.mexc.com/api/v1/contract/kline/BTC_USDT?interval=Min60&start=$START&end=$NOW" --max-time 10 | jq '{code, time_count: (.data.time | length)}'  # → code:0, count:2 (column-wise!)
curl -sS 'https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT' --max-time 10 | jq '.data | {fairPrice, holdVol, fundingRate, amount24}'  # all-in-one
curl -sS 'https://contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT' --max-time 10 | jq '.data.collectCycle'   # → 8 → 8h × 1095

# KuCoin — 3 endpoints (contracts/active IS the ticker)
curl -sS 'https://api-futures.kucoin.com/api/v1/contracts/active' --max-time 15 | jq '.data | length'   # → 594
NOW_MS=$(date +%s000); START_MS=$((NOW_MS - 7200000))
curl -sS "https://api-futures.kucoin.com/api/v1/kline/query?symbol=XBTUSDTM&granularity=60&from=$START_MS&to=$NOW_MS" --max-time 10 | jq '{code, count: (.data | length)}'  # → code:200000, count:2
curl -sS 'https://api-futures.kucoin.com/api/v1/funding-rate/XBTUSDTM/current' --max-time 10 | jq '.data | {granularity, value}'   # → granularity:28800000ms → 8h × 1095
```

### 6.b venues seed INSERT (post-adapter-merge per chapter)

```bash
# C1 — GATE
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  \"INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, extension_count, notes) VALUES ('GATE', 'shadow', 719, 7190, NOW(), 0, 'PILOT-ADAPTERS-W2 / C1 — Gate.io USDT-M Futures; \$11.9B 24h OI (12.12% global share) per CoinGecko 2026-05-16; 719 USDT perps via api.gateio.ws/api/v4/futures/usdt/contracts Plan-Mode probe 2026-05-19') ON CONFLICT (exchange_id) DO NOTHING\""

# C2 — MEXC
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  \"INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, extension_count, notes) VALUES ('MEXC', 'shadow', 881, 8810, NOW(), 0, 'PILOT-ADAPTERS-W2 / C2 — MEXC USDT-M Futures; \$11.3B 24h OI per CoinGecko 2026-05-16; 881 USDT perps via contract.mexc.com/api/v1/contract/detail Plan-Mode probe 2026-05-19; column-wise candle response') ON CONFLICT (exchange_id) DO NOTHING\""

# C3 — KUCOIN
ssh -i ~/.ssh/algovault_deploy root@204.168.185.24 \
  "docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -c \
  \"INSERT INTO venues (exchange_id, status, asset_count, min_buy_sell_sample, integrated_at, extension_count, notes) VALUES ('KUCOIN', 'shadow', 594, 5940, NOW(), 0, 'PILOT-ADAPTERS-W2 / C3 — KuCoin USDT-M Futures; \$6.3B 24h OI per CoinGecko 2026-05-16; 594 active USDT perps via api-futures.kucoin.com/api/v1/contracts/active Plan-Mode probe 2026-05-19; XBTUSDTM symbol convention (X-prefix BTC + M-suffix USDTM)') ON CONFLICT (exchange_id) DO NOTHING\""
```

Idempotent via `ON CONFLICT (exchange_id) DO NOTHING`. Per-chapter timing: post-deploy + container restart (so adapter exists in dispatch before venues row).

---

## 7. Ambiguous deps + recommended resolutions

| # | Ambiguity | Recommendation |
|---|---|---|
| A | `TradingExchangeAdapter` interface name (spec) vs `ExchangeAdapter` (production) | Inline-correct to `ExchangeAdapter`; same pattern as Wave 1. |
| B | `fetch*` method names (spec) vs `get*` (production) | Inline-correct to production names. |
| C | MEXC OI endpoint `/api/v1/contract/open_interest/{symbol}` returns 403 Akamai Access Denied | Use `/api/v1/contract/ticker?symbol=<sym>` `.holdVol` field for OI; the dedicated OI endpoint appears to be IP/geo-gated. Tested live; matches Wave 1 edgeX pattern of bundling 5 capabilities in one ticker call. |
| D | KuCoin BTC symbol `XBTUSDTM` (X-prefix for BTC) | Implement `KUCOIN_SYMBOL_OVERRIDES = { BTC: 'XBT' }`; `toKucoinSymbol('BTC')` → `'XBTUSDTM'`; `fromKucoinSymbol('XBTUSDTM')` → `'BTC'`. Other coins: `<COIN>USDTM`. |
| E | KuCoin + MEXC TradFi via XAUT (Tether Gold spot-token) vs canonical XAU (gold spot) — **REVISED 2026-05-19 rev 2** | **SAFE TO ALIAS** per semantic-fingerprint price-probe (§2.d): XAUT mark price = $4546-4549 across all 3 venues, vs Gate's XAU = $4555 → 0.15-0.20% drift, well within Tether redemption spread (XAUT is fully-redeemable 1:1 against physical gold). Alias `GOLD → XAUT` on MEXC + KuCoin per Mr.1 "one batch" directive. Gate uses `GOLD → XAU` (prefer spot symbol where both exist). |
| E2 | **SPX_USDT memecoin trap on Gate + KuCoin (NEW)** | Price-probe revealed SPX_USDT = $0.37 on Gate + KuCoin (=SPX6900 memecoin), NOT S&P 500 ($7000+). Do NOT alias `SP500 → SPX` on either venue. Per TRADFI-SYMBOL-ALIAS-W1 `semantic-fingerprint-probe-before-alias-commit` skill — canonical lesson confirmed for second time this wave. SP500 remains HL-only per existing 24-symbol "TIER_3 HL-only" set. |
| E3 | **MEXC literal canonical names for SILVER/COPPER** | MEXC uses descriptive English ticker names (`SILVER_USDT`, `COPPER_USDT`, `USOIL_USDT`, `UKOIL_USDT`) instead of CEX-standard XAG/XCU/CL/BRENT. SILVER + COPPER need NO alias (canonical AlgoVault names match MEXC's literal names). CL → USOIL + BRENTOIL → UKOIL DO need aliases. |
| F | MEXC column-wise candle response (`{time:[], open:[], high:[], low:[], close:[], vol:[]}`) | Adapter writes a `zip` helper to transpose column-wise → row-wise `Candle[]`. ~5 LoC inline; documented in MEXC's `getCandles` method. |
| G | Asset-count delta vs spec estimate | Gate: spec ~721, live 719 (Δ-2); MEXC: spec ~922, live 881 (Δ-41); KuCoin: spec ~606, live 594 (Δ-12). All within natural drift; use LIVE numbers (Factuality LAW). |
| H | seed-signals.ts `DELAY_PER_EXCHANGE: Record<ExchangeId, number>` cascade | ExchangeId widening 8 → 11 forces 3 new keys in DELAY_PER_EXCHANGE (type-system compat); seed-loop body branches OUT of scope per Scope Rule (defer to `PILOT-ADAPTERS-SEED-LOOP-W2`). Same precedent as Wave 1 ASTER/EDGEX. |
| I | Funding cadence consistency | **ALL 3 venues = 8h cadence** (×1095 annualization). Gate.io: `funding_interval:28800s`. MEXC: `collectCycle:8`. KuCoin: `granularity:28800000ms`. No edgeX-style 4h surprise. |
| J | `default-exchange-binance.test.ts` regex widening | Existing canary uses `\['HL',\s*'BINANCE',\s*'BYBIT',\s*'OKX',\s*'BITGET'(?:,\s*'[A-Z]+')*\]` which already accepts trailing additions. No update needed. |
| K | TradFi alias coverage divergence per venue **(REVISED 2026-05-19 rev 2)** | **Gate.io**: 6-entry alias map (`GOLD → XAU, SILVER → XAG, PLATINUM → XPT, PALLADIUM → XPD, COPPER → XCU, NATGAS → NG`) + 16 stocks/ETFs/VIX direct + SPX intentionally OMITTED (memecoin). **MEXC**: 4-entry alias map (`GOLD → XAUT, CL → USOIL, BRENTOIL → UKOIL, PLATINUM → XPT, PALLADIUM → XPD`) + SILVER/COPPER/FX/Index/ETFs direct + SPX OMITTED. **KuCoin**: 4-entry alias map (`GOLD → XAUT, SILVER → XAG, PLATINUM → XPT, PALLADIUM → XPD`) + 26 stocks direct + COPPER/CL/NATGAS/ETFs direct + SPX OMITTED. Full alias maps embedded in §2.a / §2.b / §2.c above. |

---

## 8. system-map.md edge-touch enumeration

Per Map Anchor (6 edge mutations):

| # | Edge | Status |
|---|---|---|
| 1 | NEW `signal-MCP → Gate.io perp CEX (REST)` | ✓ C1 commit |
| 2 | NEW `signal-MCP → MEXC perp CEX (REST)` | ✓ C2 commit |
| 3 | NEW `signal-MCP → KuCoin perp CEX (REST)` | ✓ C3 commit |
| 4 | NEW `venues` rows: GATE + MEXC + KUCOIN | ✓ per chapter |
| 5 | MUTATED `signal-MCP → MCP clients (tools/list)` enum widening 8 → 11 | ✓ per chapter |
| 6 | MUTATED `mcp://algovault/venues` resource shape (11 venues post-C3) | ✓ auto via venues table |
| 7 | MUTATED `evaluate-venues cron → venues table` (6 shadow rows in scope) | ✓ auto via cron |
| 8 | MUTATED `seed-signals cron → 3 new adapter routes` | ⚠ DEFERRED — type-system compat only; seed-loop branch follow-up wave |

---

## 9. Test-runner + test-layout probe

- `jq -r '.scripts.test' package.json` → `vitest run` ✓
- `ls tests/unit/` → flat layout; existing adapter tests: `aster-adapter.test.ts`, `edgex-adapter.test.ts`, `default-exchange-binance.test.ts`, `tradfi-symbol-alias.test.ts`
- New test files: `tests/unit/gateio-adapter.test.ts`, `mexc-adapter.test.ts`, `kucoin-adapter.test.ts`

---

## 10. Plan-Mode verdict (rev 2)

✅ **NO HALT-class findings.** All 3 venues clear the triple-gate (AUM + OI + Gate 3). All 5 capabilities accessible via public REST. Funding cadences uniformly 8h × 1095 (no edgeX-style surprise). Public-copy firewall audit clean (zero verb violations in spec). **Full TradFi catalog probed across all 3 venues (Gate 26 / MEXC 15 / KuCoin 36 TradFi symbols); per-venue TRADFI_ALIASES maps built + price-probe verified per semantic-fingerprint skill; SPX-memecoin trap identified on Gate + KuCoin and intentionally NOT aliased**. Mr.1 directive 2026-05-19 ratified: integrate all TradFi alias maps in ONE batch (no TRADFI-EXTEND follow-up wave needed for these 3 venues).

**Awaiting architect approval before C1 begins.**

If approved:
- **C1 Gate.io** (~280 LoC): adapter + 6-entry TRADFI_ALIASES (GOLD→XAU, SILVER→XAG, PLATINUM→XPT, PALLADIUM→XPD, COPPER→XCU, NATGAS→NG) + dispatch widening + Zod widening + tests + post-deploy venues INSERT.
- **C2 MEXC** (~290 LoC): adapter + 4-entry TRADFI_ALIASES (GOLD→XAUT, CL→USOIL, BRENTOIL→UKOIL, PLATINUM→XPT, PALLADIUM→XPD) + column-wise candle zip helper + same widening.
- **C3 KuCoin** (~310 LoC): adapter + 4-entry TRADFI_ALIASES (GOLD→XAUT, SILVER→XAG, PLATINUM→XPT, PALLADIUM→XPD) + KUCOIN_SYMBOL_OVERRIDES (BTC→XBT) + M-suffix helper + integer-minutes granularity + RUNBOOK Wave-2 CEX appendix.

Version bump + CHANGELOG entry stay OUT of scope per `## Release cadence` daily-release rule.
