# OPS-FUNDING-ARB-EXPAND-W1 — Plan-Mode endpoint-truth

**Date:** 2026-07-01 · **$REPO:** `/Users/tank/code/crypto-quant-signal-mcp` · **Baseline:** origin/main `affeaf7` (scan wave, deployed) · **Status:** 🛑 **HALT — architect ratification before C1.**

**Headline:** the spec's premise (pre-flag: *"consume the SoT's funding rate directly … C1 = normalization-over-the-SoT"*) is **wrong for funding-arb**. The engine keeps `nextFundingTime` (→ urgency) + HL `getFundingHistory` (→ conviction) — data the SoT (`getVenueUniverse` = current funding + OI only) does NOT carry. Sourcing funding from the SoT would **degrade a public, Merkle-anchored tool** (urgency dead, conviction→MEDIUM fallback). The correct expansion is **per-adapter `getPredictedFundings()` merge**; the SoT's role is the **liquidity gate**, not the funding source.

## §0 Objective + dependency
Expand `scan_funding_arb` beyond its current venues to a quality-filtered promoted subset, per-venue interval-correct + per-leg liquidity-gated, without surfacing false/non-executable spreads. **Dependency (scan SoT):** shipped `affeaf7` — used here ONLY for the liquidity gate (per-leg OI/volume), not funding.

## §1 Architecture truth table (claim | reality | resolution)
| # | Spec/system-map claim | Reality (live @ affeaf7) | Resolution |
|---|---|---|---|
| 1 | funding-arb covers "the original 5 (HL/BINANCE/BYBIT/OKX/BITGET)" | **FALSE — it's 3.** Engine calls `getAdapter()` (default **HL**, exchange-adapter.ts:31) → `HL.getPredictedFundings()` = HL's cross-venue AGGREGATE feed, which returns EXACTLY **`["BinPerp","HlPerp","BybitPerp"]`** (live-confirmed). OKX/BITGET are NOT in it. | correct the record: current = **3** (HL/Bin/Bybit) |
| 2 | "consume the SoT's funding rate directly (no separate fetch)" | The engine needs `nextFundingTime` (urgency, computeUrgency) + 24h `getFundingHistory` (conviction, computeConviction). The SoT `ExchangeAsset` has `fundingRate`+`fundingIntervalHours` but **NO nextFundingTime, NO history**. SoT-sourcing ⇒ urgency dead + conviction→50/MEDIUM fallback. | **do NOT source funding from the SoT** — use per-adapter `getPredictedFundings()` (has nextFundingTime); SoT only gates liquidity |
| 3 | "extract a shared `annualizeFunding`" (C1) | **ALREADY EXISTS** `rank-constants.ts:94` `annualizeFunding(rate, intervalHours) = rate×(24/h)×365` (returns null on unknown interval, never guesses). The engine's own `hourlyRates[v]=rate/period` + `×8760` is mathematically identical. | **reuse** it; retire the local `VENUE_PERIOD_HOURS` (3-entry: Hl=1/Bin=8/Bybit=8) → a per-venue interval source |
| 4 | 12 adapters "already fetch funding" | Per-adapter `getPredictedFundings()` exists on all, but coverage varies (§2). Each returns its OWN venue string (`GatePerp`, `KuCoinPerp`, …) + nextFundingTime, EXCEPT HL (3-venue aggregate). | merge per-adapter feeds by coin; normalize venue strings → ExchangeId |

## §2 Live funding-feed probe — the QUALIFYING candidates (Q-A)
`getAdapter(v).getPredictedFundings()`, BTC row, live 2026-07-01:
| venue | coins | BTC feed | nextFundingTime | verdict |
|---|---|---|---|---|
| HL (aggregate) | 230 | Bin/HL/Bybit | ✓ 8h | ✓ current source |
| BINANCE | 765 | BinPerp | ✓ 8h | ✓ full |
| BYBIT | 603 | BybitPerp | ✓ 8h (per-symbol) | ✓ full |
| GATE | 814 | GatePerp | ✓ 8h | ✓ full |
| KUCOIN | 642 | KuCoinPerp | ✓ 8h | ✓ full |
| ASTER | 579 | AsterPerp | ✓ 8h | ✓ full (note: ASTER is an OI-PROXY for scan but has a REAL funding feed) |
| OKX | 30 | **[]** (BTC absent) | — | ⚠️ weak — only 30 coins, no BTC |
| BITGET | 675 | BitgetPerp | **✗ none** | ⚠️ funding but NO nextFundingTime → urgency degrades |
| MEXC · HTX · BINGX · PHEMEX | 0 / [] | — | — | ✗ EXCLUDE — empty feed (BINGX is a shadow-era stub literally deferred to "when BingX clears promotion gates") |

⇒ **full-feed set = {HL, BINANCE, BYBIT, GATE, KUCOIN, ASTER}** (6). The arb set is a **quality subset ≠ scan-12 AND ≠ 5**: ASTER (scan OI-proxy) qualifies; PHEMEX/MEXC/HTX (scan real-OI) do NOT (no funding feed). Intervals: HL own=1h; the rest 8h (confirm per-venue at C1 — a wrong interval = a false spread on a public tool).

## §3 Liquidity source (Q-B) — the SoT's real role
`getVenueUniverse(venue) -> ExchangeAsset[]` (scan wave) carries `notionalOI_usd` + `volume24h_usd` per coin per venue → the per-leg liquidity gate reads it (a spread surfaces only if BOTH legs clear the floor). Note the 2 scan proxies (ASTER/BINGX) have volume-proxy "OI" — gate ASTER on **volume24h_usd** (real), not notionalOI (proxy).

## §4 Normalization (Q-C)
Reuse `annualizeFunding(rate, intervalHours)`; feed it each venue's live interval. Existing 3 (HL 1h / Bin 8h / Bybit 8h) must annualize IDENTICALLY to today (0-regression AC). The engine's `/period → ×8760` already equals it.

## §5 system-map rows (Plan-Mode verdict = Y)
| Edge | Mutation | Chapter |
|---|---|---|
| `scan_funding_arb` → ranked spreads (mcp/x402/bot) | 3 → qualifying subset (Q-A); interval-normalized + liquidity-gated | C2/C3 |
| adapter `getPredictedFundings()` feeds → merged multi-venue table | NEW merge + venue-string→ExchangeId + `annualizeFunding` reuse | C1 |

## §6 HALT — architect decisions (BLOCKING; no C1 until ratified)
