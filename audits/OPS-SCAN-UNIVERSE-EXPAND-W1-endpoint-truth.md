# OPS-SCAN-UNIVERSE-EXPAND-W1 — Plan-Mode endpoint-truth

**Date:** 2026-06-30 · **$REPO:** `/Users/tank/code/crypto-quant-signal-mcp` · **Baseline:** origin/main `03cd00d` (synced ff-only) · **Status:** 🛑 **HALT — architect ratification required before C1.**

**Headline:** the spec's premise — *"the seed loop already has working universe fetchers for all 12 (`UNIVERSE_FETCHERS`) … reuse/delegate rather than rebuild"* — **under-scopes**. The seed fetchers return **volume-ranked symbols (`string[]`)**; scan needs **OI-ranked rich `ExchangeAsset[]`** (OI + funding + 24h-change) for its default ("top-N by open interest") *and* its rank-by lenses. There are **no OI sources for the 7 new venues**. ⇒ full 12-venue parity is a **7-rich-fetcher build**, not a delegate.

## §0 Wave objective
Collapse the parallel hardcoded 5-venue scan representations into ONE promoted-driven SoT so `scan_trade_calls` covers all 12 promoted venues + auto-tracks future promotions. Per-coin tools + funding-arb untouched. No version bump.

## §1 Representation truth table (claim | reality | resolution)
| # | Spec claim | Reality (live @ `03cd00d`) | Resolution |
|---|---|---|---|
| 1 | `getExchangeTopAssetsWithVolume` 5-only FETCHERS that throws (`exchange-universe.ts:243-277`) | **CONFIRMED.** `PromotedExchangeId`(:51, 5) → `FETCHERS: Record<PromotedExchangeId,(limit)=>Promise<ExchangeAsset[]>>`(:243, 5) → `getExchangeTopAssetsWithVolume`(:265) THROWS(:271). **+ a 2nd thrower `fetchVenueUniverse`(:286)** also on FETCHERS (used by rank-metrics lenses) | both throwers + FETCHERS derive from the SoT |
| 2 | Zod enum `scan-trade-calls.ts:67` | **CONFIRMED** `z.enum(['BINANCE','HL','BYBIT','OKX','BITGET'])` :67 | derive/assert from SoT (C2) |
| 3 | `SCAN_EXCHANGES` `trade-call-scanner.ts:47` | **CONFIRMED** :47 + `ScanExchangeId` type :46 (5) | derive from SoT |
| 4 | x402 Bazaar set `x402-bazaar.ts:220` | **CONFIRMED at :221** (sibling `03cd00d` shifted +1; <3 mismatch → OK) — scan_trade_calls inputSchema `exchange.enum:['BINANCE','HL','BYBIT','OKX','BITGET']` | derive from SoT |
| 5 | `PromotedExchangeId` type | **CONFIRMED** `exchange-universe.ts:51` (5; LOCAL to file, not exported) | widen/derive |
| **6** | *(NOT in spec — new finding)* | **`oi-snapshot-sampler.ts:23 PROMOTED_VENUES` (5-only `ExchangeId[]`)** — the OI sampler feeding the `oi_change` lens via `oi_snapshots` | **add to scope** else `oi_change` lens stays 5-only |
| — | cascade | `ScanExchangeId` is pass-through-consumed by `scan-digest.ts`, `x402-http-routes.ts:153`, `webhook-events.ts:224`, `webhook-api.ts:243`, `scan-digest-scheduler.ts:61`. 68 `ExchangeId` refs total; the per-coin ones (`get_trade_call`/regime) are already 17-wide | widen `ScanExchangeId`/`SCAN_EXCHANGES` → propagates (tsc-exhaustive holds) |

## §2 THE CRUX — rich vs symbols (Q-A)
- **scan** needs `ExchangeAsset[]` (`exchange-universe.ts:24`) — **required** `coin`, `notionalOI_usd`, `volume24h_usd`; optional funding/changePct24h/baseOI. Default ranks by **OI** (`notionalOI_usd`, sort@:239). Rank-by lenses (volume / funding / oi_change / 24h / volatility, via `rank-metrics.ts getRankedUniverse`→`fetchVenueUniverse`) consume the rich optional fields.
- **seed** `UNIVERSE_FETCHERS` (all 17, `seed-signals.ts:738`) return `string[]` — symbols ranked by **24h quoteVolume**. The shadow/new fetchers (e.g. `fetchAsterCoins:579`, `fetchGateCoins:592`) fetch **only** the venue 24h-ticker's `quoteVolume`; **no OI, no funding**.
- **OI sources** (`oi-sources.ts fetchCurrentOiUsd`) are branch-per-venue, effectively the promoted-5 (`if (exchange === 'BINANCE')` …). **NOT the 7 new.**

⇒ "reuse `UNIVERSE_FETCHERS`" yields only a **volume-ranked symbol list** for the 7 — not the OI-ranked rich universe scan advertises, nor the rank-by lenses. **Full parity for the 7 = a 7-venue rich-fetcher build** (OI + funding + 24h-change, per-venue field divergence per the CLAUDE.md `curl <venue> | jq keys` law + OI endpoints).

### Q-A options
| Opt | SoT shape | 7-new parity | Cost | Funding-arb (next wave) |
|---|---|---|---|---|
| **A1 rich** | `getVenueUniverse(venue):Promise<ExchangeAsset[]>` for 12; seed maps `.coin` | FULL (OI default + all lenses) | **HIGH** — 7 rich fetchers + OI sources for 7 | **sets it up** (funding data) |
| **A2 symbol** | `getVenueUniverse(venue,topN):Promise<string[]>` = `UNIVERSE_FETCHERS` for 12 | default only, **VOLUME-ranked** (contradicts "by OI" desc → Factuality); lenses degrade/skip for 7 | LOW | no funding data |
| **A3 tiered** | capability registry: 5 rich + 7 symbol-only (volume default, lenses rejected for 7) + follow-up for rich-7 | default(volume) for 7; lenses 5-only; documented asymmetry | MED | no |

**Recommendation: A1** — the true generator fix: full lens parity for 12, de-dups seed↔scan into one rich registry, and builds the rich funding data `OPS-FUNDING-ARB-EXPAND-W1` will consume. It explicitly overrides the spec's "reuse, don't rebuild" (invalidated by the rich-vs-symbols gap). If scope must shrink, **A3** ships default-scan-for-12 now + a rich-lens follow-up; **A2 is not recommended** (silently re-defines "top-N by open interest" as volume for the 7 — a Factuality/public-copy violation).

## §3 derive-from-promoted (Q-B): compile-time vs runtime
- "promoted" is **runtime** (`listVenues('promoted')`, venue-store DB). The scan reps are **compile-time** (Zod enum, `ScanExchangeId` union, `SCAN_EXCHANGES` const) — can't read the DB.
- `EXCHANGES` (`capabilities.ts:42`) = the static **12 promoted** (HL,BINANCE,BYBIT,OKX,BITGET,ASTER,BINGX,GATE,HTX,KUCOIN,MEXC,PHEMEX). `ExchangeId` (`types.ts:103`) = **17 configured** (5 shadow EDGEX/WEEX/BITMART/XT/WHITEBIT are in ExchangeId + `UNIVERSE_FETCHERS` but NOT in EXCHANGES).
- **Proposal:** single compile-time SoT = `EXCHANGES` → derive `ScanExchangeId`/`SCAN_EXCHANGES`/Zod-enum + the runtime dispatch from it; a unit test asserts `EXCHANGES` (promoted) == `listVenues('promoted')` so a DB promotion without a capabilities edit (or vice-versa) fails CI. Adding a 13th promoted venue → appears in all reps (tsc-exhaustive), zero scan edits.

## §4 Per-venue OI probe — the CONTRACT (live @ 2026-06-30; research file absent → probed direct)
| venue | endpoint(s) | OI? | notionalOI_usd basis | volume24h_usd | funding | 24h% |
|---|---|---|---|---|---|---|
| GATE | `/futures/usdt/tickers` (1) | ✅ REAL | `total_size × quanto_multiplier × mark_price` | `volume_24h_quote` | `funding_rate` | `change_percentage` |
| MEXC | `/contract/ticker` + `/contract/detail` (contractSize) | ✅ REAL | `holdVol × contractSize × lastPrice` | `amount24` (USDT) | `fundingRate` | `riseFallRate` |
| KUCOIN | `/contracts/active` (1) | ✅ REAL | `openInterest × multiplier × markPrice` | `turnoverOf24h` | (sep endpoint) | `priceChgPct` |
| HTX | `swap_open_interest` + `batch_merged` (2) | ✅ REAL | `amount(coin OI) × price` | batch_merged | `swap_batch_funding_rate` | batch_merged |
| PHEMEX | `/md/v2/ticker/24hr/all` (1) | ✅ REAL | `openInterestRv × markPriceRp` | `turnoverRv` | `fundingRateRr` | `openRp→closeRp` |
| ASTER | `/fapi/v1/ticker/24hr` (1) | ❌ PROXY | `quoteVolume` (Binance-fork, no bulk OI; only per-symbol `/fapi/v1/openInterest`) | `quoteVolume` | premiumIndex | `openPrice` |
| BINGX | `/swap/v2/quote/ticker` (1) | ❌ PROXY | `quoteVolume` (no OI in bulk ticker) | `quoteVolume` | premiumIndex | `priceChangePercent` |

**5 REAL OI** (GATE, MEXC, KUCOIN, HTX, PHEMEX) + **2 PROXY** (ASTER, BINGX — labeled `notionalOI_usd = quoteVolume`, mirroring the EXISTING Binance fetcher which is itself a volume proxy, `exchange-universe.ts:127`). ⇒ **Q-D triggers: de-specify "by open interest" → "by open interest / liquidity"** (next release; already true for Binance). Q-C caveat applied: oi / oi_change lenses exclude the proxy venues (+ Binance) — labeled — but they appear in default + volume + funding lenses. Per-venue fail-soft = skip, never 500.

## §5 Test baseline
`tests/scan-trade-calls.test.ts:105`: `it('rejects a shadow venue not in the promoted-5 enum', () => expect(SCHEMA.safeParse({exchange:'ASTER'}).success).toBe(false))` — **STALE** (ASTER is promoted now but scan rejects it; this is the gap). Flip to assert ACCEPT in C3. Full suite-green confirmed at C1 baseline (`rm -rf dist && npm run build && vitest run`).

## §6 Identifier diff (R vs AC)
Consistent — `scan_trade_calls`, "12 promoted", channels mcp/x402/bot/webhook all match across spec sections. No mismatch.

## §7 system-map rows (Plan-Mode verdict = Y)
| Edge | Mutation | Chapter |
|---|---|---|
| `scan_trade_calls` → ranked calls (mcp/x402/bot/webhook) | 5→12 promoted; auto-tracks promotion | C2/C3 |
| `exchange-universe FETCHERS` ↔ seed `UNIVERSE_FETCHERS` | UNIFY into one venue→universe SoT | C1 |
| `oi-snapshot-sampler PROMOTED_VENUES` (6th rep) | 5→12 | C2 |

## §8 HALT — BLOCKING. No C1 until Q-A/Q-B/Q-C ratified. Q-D applies only if A2/A3.
