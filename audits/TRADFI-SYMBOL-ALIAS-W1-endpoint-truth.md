# TRADFI-SYMBOL-ALIAS-W1 — endpoint-truth.md

**Wave:** per-CEX TradFi symbol aliasing for `get_trade_call` / `get_trade_signal` / `get_market_regime` (v1.11.0 → v1.11.1).

**Date:** 2026-05-15
**Code:** Claude Opus 4.7 (1M)
**Mode:** Plan Mode Step 0 (self-initiated per risk marker: external API first-use against 4 CEX instrument-list endpoints)
**Outcome:** Path-confirmed (no HALT). Plan Mode caught a namespace-collision bug in the auto-generated alias matrix BEFORE code-edit landed. Proceed with execution.

---

## 1. TIER_3 canonical symbol set (re-grepped from current source)

From `src/lib/asset-tiers.ts:43-53` (constant `TRADFI_FALLBACK`, 62 symbols):

```
SPX SP500 XYZ100 GOLD SILVER CL BRENTOIL COPPER NATGAS PLATINUM PALLADIUM
URANIUM ALUMINIUM TTF TSLA NVDA AAPL AMZN GOOGL META MSFT AMD ORCL NFLX
PLTR COIN HOOD INTC MU MSTR BABA LLY COST RIVN TSM CRCL SNDK CRWV HIMS
DKNG BX GME SMSN SOFTBANK HYUNDAI KIOXIA JP225 KR200 DXY VIX USAR URNM
XLE EWY EWJ CORN WHEAT LITE PURRDAT SKHX JPY EUR
```

---

## 2. Per-CEX symbol-list probe (2026-05-15)

| Venue | Endpoint | Symbol count |
|---|---|---|
| Binance USDT-M Futures | `https://fapi.binance.com/fapi/v1/exchangeInfo` | 731 |
| Bybit Linear | `https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000` | 666 |
| Bitget USDT-M Futures | `https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES` | 553 |
| OKX USDT Swaps | `https://www.okx.com/api/v5/public/instruments?instType=SWAP` (filter `settleCcy=="USDT"`) | 319 |

Raw lists persisted at `/tmp/{binance,bybit,bitget,okx}-symbols.txt` for the duration of this session.

---

## 3. Alias-discovery matrix → `audits/TRADFI-SYMBOL-ALIAS-W1-symbol-coverage.csv`

CSV columns: `algovault_canonical, cex, cex_symbol_resolved_to, evidence`. Evidence values: `exact` (CEX-native symbol equals canonical + `USDT` or `-USDT-SWAP`), `alias` (alias-candidate matched), `missing` (no candidate found on that CEX).

### Aggregate

| Venue | exact | alias | missing | total supported |
|---|---|---|---|---|
| Binance | 28 | 4 (post-collision-fix) | 30 | 32 |
| Bybit | 26 | 2 (post-collision-fix) | 34 | 28 |
| Bitget | 33 | 4 (post-collision-fix) | 25 | 37 |
| OKX | 32 | 6 | 24 | 38 |

(Pre-collision-fix probe showed 20 alias rows including 4 spurious `SP500 → SPX` rows. See §3.b namespace-collision section below.)

### 3.a Final TRADFI_ALIASES per adapter

**BINANCE** (`src/lib/adapters/binance.ts`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
};
// → suffix 'USDT' in toBinanceSymbol
```

**BYBIT** (`src/lib/adapters/bybit.ts`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
};
```

**BITGET** (`src/lib/adapters/bitget.ts`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
};
```

**OKX** (`src/lib/adapters/okx.ts`):
```ts
const TRADFI_ALIASES: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  COPPER: 'XCU',
  NATGAS: 'NG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
};
// → composed as `${alias}-USDT-SWAP` in toOKXInstId
```

### 3.b ⚠ Namespace collision caught in Plan Mode (load-bearing!)

The naive grep-against-symbol-list emitted `SP500 → SPX` as an alias candidate on all 4 CEXs (`SPXUSDT` / `SPX-USDT-SWAP` exists everywhere). Live probe revealed the price collision:

| Venue / coin | Returned price | What is this asset? |
|---|---|---|
| `SP500` on HL | $7414.80 | ✓ S&P 500 index (canonical) |
| `SPX` on HL | $0.408 | SPX6900 memecoin (HL standard perp) |
| `SPX` on BINANCE (probe) | $0.408 | SPX6900 memecoin (CEX has the meme, NOT the index) |
| `XPT` on BINANCE (alias for PLATINUM) | $1986.51 | ✓ Platinum spot (~$1900-2000) |
| `XPD` on BINANCE (alias for PALLADIUM) | $1427.40 | ✓ Palladium spot (~$1300-1500) |
| `XAU` on BINANCE (alias for GOLD) | $4555.98 | ✓ Gold spot (~$4500-4600) |
| `XAG` on BINANCE (alias for SILVER) | $77.63 | ✓ Silver spot (~$80) |

`SP500 → SPX` alias DROPPED from all 4 adapter maps. `SPX` (memecoin) stays as an exact-match on all 4 CEXs (it's a crypto memecoin, not a TradFi instrument — same on every venue). `SP500` reclassified as HL-only in `venue-coverage.ts`.

This is exactly the failure mode the spec's Method §3 ("Probe results MAY differ from web-research expectations — trust the live API") was meant to catch. Confirms the namespace-collision-after-naive-grep WIS pattern from CHANGE-DEFAULT-EXCHANGE-W1.

### 3.c HL-only TIER_3 symbols (23) — written into `venue-coverage.ts` as `['HL']`

```
ALUMINIUM, BRENTOIL, BX, CORN, DKNG, DXY, EUR, HYUNDAI, JP225, JPY,
KIOXIA, KR200, PURRDAT, RIVN, SKHX, SMSN, SOFTBANK, TTF, URANIUM, URNM,
VIX, WHEAT, XYZ100
```

Plus `SP500` reclassified to HL-only after §3.b namespace-collision fix → 24 HL-only TIER_3 symbols total.

### 3.d Partial-coverage TIER_3 symbols (14) — per-venue list in `venue-coverage.ts`

```
AMD     [BINANCE, BITGET, OKX]                    (missing on Bybit)
BABA    [BINANCE, BITGET, OKX]                    (missing on Bybit)
COPPER  [BINANCE, BITGET, OKX]                    (Bybit missing; OKX uses XCU alias)
COST    [BINANCE, BITGET]                         (missing on Bybit, OKX)
CRWV    [BINANCE, BITGET, OKX]                    (missing on Bybit)
GME     [BINANCE, BITGET]                         (missing on Bybit, OKX)
HIMS    [BITGET]                                  (missing on BINANCE, Bybit, OKX)
LLY     [BINANCE, BITGET, OKX]                    (missing on Bybit)
NATGAS  [BINANCE, BITGET, OKX]                    (Bybit missing; OKX uses NG alias)
NFLX    [BINANCE, BITGET]                         (missing on Bybit, OKX)
PALLADIUM [BINANCE, BITGET, OKX]                  (Bybit missing; aliased to XPD)
PLATINUM  [BINANCE, BITGET, OKX]                  (Bybit missing; aliased to XPT)
USAR    [BINANCE, BITGET, OKX]                    (missing on Bybit)
XLE     [BITGET]                                  (missing on BINANCE, Bybit, OKX)
```

All partial-coverage symbols ALSO listed on HL by definition (TIER_3 = HL xyz dex).

---

## 4. Live trade-call gate (CEX-native probe pre-deploy)

Probes the CEX-native alias-target directly (before the alias map lands in code). All returns live data — confirms the alias targets are valid:

| Canonical → Resolved | Venue | Result | Spot-price sanity |
|---|---|---|---|
| GOLD → XAU | BINANCE | HOLD $4555.98 | ✓ gold spot |
| SILVER → XAG | BINANCE | HOLD $77.63 | ✓ silver spot |
| GOLD → XAU | BYBIT | HOLD $4555.47 | ✓ gold spot |
| SILVER → XAG | BYBIT | HOLD $77.62 | ✓ silver spot |
| PLATINUM → XPT | BINANCE | HOLD $1986.51 | ✓ platinum spot |
| PALLADIUM → XPD | BINANCE | HOLD $1427.40 | ✓ palladium spot |
| COPPER → XCU | OKX | HOLD $6.29 | ✓ copper spot |
| NATGAS → NG | OKX | BUY $3.128 | ✓ NG futures |
| SP500 (HL control) | HL | HOLD $7414.80 | ✓ S&P 500 index (HL-only) |
| SPX (memecoin control) | HL | HOLD $0.408 | ✓ SPX6900 memecoin |

---

## 5. HALT-class finding check

Spec rule: "Architect re-review required ONLY if the matrix surfaces a HALT-class finding (e.g. ≥1 TIER_3 symbol returns missing on ALL 5 venues — would invalidate the asset's Tier-3 classification entirely)."

**Result:** No HALT-class finding. 23 of 62 TIER_3 symbols are CEX-missing on all 4 non-HL venues — but ALL of them are still HL-supported (TIER_3 = HL xyz dex by definition). HL is the 5th venue. The 23 "HL-only" symbols inherit HL coverage and are NOT missing-on-all-5. Proceed without architect re-review.

---

## 6. Plan-Mode verdict

✅ **No HALT.** Coverage matrix drives the alias maps in 4 adapters + the `venue-coverage.ts` static dataset. Namespace collision (`SP500 → SPX` would have routed S&P 500 index lookups to SPX6900 memecoin) caught BEFORE any code-edit landed via §4's spot-price sanity probe. Proceed with execution per spec Requirements 1–14.

Out-of-scope flags surfaced for WIS:
- 14 TIER_3 symbols have only PARTIAL CEX coverage (1–3 venues missing). When a caller hits `{coin: "HIMS", exchange: "BINANCE"}`, the new `TRADFI_SYMBOL_UNSUPPORTED_ON_VENUE` error path activates with `suggested_venues: ["HL", "BITGET"]`. The pattern is reusable for any future asset that lands on a subset of venues.
- `getDexForCoin` in `src/lib/asset-tiers.ts:102-107` returns `'standard'` for `SPX` (treats it as crypto perp on HL); this is consistent with the §3.b finding that `SPX` is the memecoin everywhere. `SP500` is the index. Document this conceptual distinction in venue-coverage.ts comments.
