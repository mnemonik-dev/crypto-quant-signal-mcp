# Provenance audit — `oi_change_pct` (SCAN-RANKBY-W3 CH1, READ-ONLY)

**Date:** 2026-06-27 · **Wave:** SCAN-RANKBY-W3 CH1 · **Prod version probed:** `1.20.1`
**Classification: `MISLABELED_PRICE_PROXY`** (architect-ratified 2026-06-27).

The public `oi_change_pct` field — surfaced in `get_trade_call` `indicators` and in the `_receipts`
"factors" proof block of every signal — is **the 24h price change, not an open-interest delta.** It
is computed as `priceChange × 100`. On a non-trivial fraction of assets the real OI delta has the
**opposite sign**, so the field can publicly assert "OI rising / bullish" while open interest is
actually falling. This is a Factuality (#1) + Data-Integrity violation and is fixed at the source in
W3 CH3 (unconditional, two-commit).

---

## 1. Code trace (source of `priceChange`)

`src/tools/get-trade-call.ts`:
- **L245** — `const priceChange = assetCtx.prevDayPx > 0 ? (currentPrice - assetCtx.prevDayPx) / assetCtx.prevDayPx : 0;`
  → `priceChange` is the **24h price return** (last vs prior-day price). No open-interest term.
- **L506** — `oi_change_pct: parseFloat((priceChange * 100).toFixed(1)),`
  → the public "OI change %" field is literally `priceChange × 100` (the 24h price change %), rounded to 1 dp.

`priceChange` is also consumed at **L307–310** to derive the internal `oiScore` (verdict scoring) — see §5 (out of scope, flagged).

`src/lib/receipts.ts`:
- **L121–123** — `oiDirection(oiChangePct)` → `bullish` if `≥0.5`, `bearish` if `≤−0.5`, else `neutral`.
- **L145–146** — pushes `{ factor: 'oi_change_pct', direction: oiDirection(ind.oi_change_pct), value: signedPct(...) }` into `_receipts.factors`.
  → the public proof block labels the **price** change as an **OI** factor with a bullish/bearish direction.

---

## 2. Empirical cross-check (live, 2026-06-27 ~14:13 UTC)

Live prod `get_trade_call(coin, exchange=BYBIT)` `indicators.oi_change_pct` / `_receipts` factor, vs the
venue's actual 24h price change (`tickers.price24hPcnt`) and actual 24h OI delta (`/v5/market/open-interest?intervalTime=1d`):

| coin | tool `oi_change_pct` (public) | `_receipts` factor | venue price change 24h | **venue REAL OI delta 24h** | verdict |
|---|---|---|---|---|---|
| **BTC** | **+1.4%** | `oi_change_pct +1.4% · bullish` | **+1.34%** | **−1.0%** | tool == price; **OI actually FELL → wrong sign** |
| ETH | +1.6% | `oi_change_pct +1.6% · bullish` | +1.64% | +3.0% | tool == price; magnitude wrong (OI +3.0%) |
| SOL | +2.2% | `oi_change_pct +2.2% · bullish` | +2.21% | +3.0% | tool == price; magnitude wrong (OI +3.0%) |
| WIF | (tool rejects — illiquid on BYBIT) | — | +19.5% | −1.0% | a covered coin here would report "+19.5% OI" while OI fell 1% |

**Finding:** in every sampled case the tool value equals the **price change** (1.4≈1.34, 1.6≈1.64,
2.2≈2.21) and diverges from the **real OI delta**. For **BTC** — the flagship asset — the public
`_receipts` block asserted "open interest +1.4%, bullish" at the same instant open interest was
**falling 1.0%**. The label is wrong both in magnitude (always) and in sign (BTC, WIF).

---

## 3. Public surfaces emitting `oi_change_pct` as "OI"

| # | surface | file:loc | kind |
|---|---|---|---|
| 1 | `get_trade_call` → `indicators.oi_change_pct` | `src/tools/get-trade-call.ts:506` | **LIVE output** |
| 2 | `_receipts.factors` "oi_change_pct" (bullish/bearish, every `get_trade_call`/`scan_trade_calls`) | `src/lib/receipts.ts:145-146` (+ `oiDirection` L121-123) | **LIVE output** |
| 3 | x402 Bazaar tool-listing sample | `src/lib/x402-bazaar.ts:97` (`oi_change_pct: 1.4`) | static public example |
| 4 | public docs JSON example | `landing/docs.html:315` (`"oi_change_pct": 2.4`) | static public example |
| 5 | LangChain integration page | `landing/integrations/langchain.html:229` | static public example |
| 6 | CrewAI integration page | `landing/integrations/crewai.html:228` | static public example |
| 7 | LlamaIndex integration page | `landing/integrations/llamaindex.html:222` | static public example |
| 8 | Microsoft Agent Framework page | `landing/integrations/maf.html:245` | static public example |

(Internal, non-public: the type decl `src/types.ts:262 oi_change_pct: number` — corrected to optional in CH3 so warming can omit the field.)

**Impact:** 2 live-output surfaces (#1, #2 — the same underlying field, projected into both the
indicators map and the receipts proof) reach every agent/user on every signal; 6 static doc/sample
surfaces (#3–#8) teach integrators the field is an OI delta. All 8 are corrected in W3 CH3.

---

## 4. Ratified fix scope (W3 CH3 — UNCONDITIONAL)

Per the architect ratification (2026-06-27), Factuality (#1) > deferral: fix at the source, this wave.
- **One source:** W3 CH2 builds `computeOiDelta` over a real `oi_snapshots` time-series; the new
  `oi_change` lens **and** this public factor both read it (single-derivation LAW). No 2nd path.
- **Two-commit:** (1) wire `oi_change_pct` to `computeOiDelta`, **OMIT** the field during warming
  (the `_receipts` factor auto-skips an absent value); update the 6 static examples to truthful copy;
  (2) retire the `priceChange × 100` proxy for the field.
- **Warming = OMIT** (never show a stale/wrong value — omission beats a wrong sign).
- **Window = 24h** (trader-standard); echo `oi_change_window`. Backfill from venue OI-history where
  available (Bybit/Binance/OKX) to shrink the one-time 24h warming; HL warms forward.
- The superseded standalone fix task (`task_99e364df`) is dismissed — folded here.

## 5. Non-blocking flag (out of W3 scope)

The internal **`oiScore`** (`get-trade-call.ts:307-310`) is ALSO derived from `priceChange`, i.e. the
verdict's "OI momentum" scoring component is actually price momentum. Correcting it would **change
verdicts** (BUY/SELL/HOLD), which is out of W3's scope ("may NOT change the verdict engine") and is an
alpha-affecting quant decision, not a labeling fix. **W3 leaves the verdict byte-identical** and only
corrects the public *displayed* field/factor/docs. Filed as a separate verdict-quant follow-up (WIS,
CH4). NB: because the verdict was scored on price-momentum-as-OI but the corrected factor will show
real OI, the receipts factor becomes *more truthful* (real OI context) even though the engine's
internal scoring is unchanged — an improvement, not a new inconsistency.

---

**Mutations during CH1:** none (this artifact only). `git status` clean except this file.
