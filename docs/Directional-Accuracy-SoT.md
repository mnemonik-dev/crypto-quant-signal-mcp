# Directional Accuracy — Metric Source of Truth

**Wave:** EDGE-DWR-METRIC-SOT-W1 · **Status:** internal measurement layer · **Created:** 2026-07-02

> **INTERNAL-ONLY — no public surface until the claim ladder passes.**
> Every definition, column, and number in this document — and every value in the
> `directional_labels` table (including `mfe_return_pct` / `mae_return_pct`) — is the
> same data class as `outcome_return_pct`: **never** exposed via MCP, `/api/*`, landing,
> README, or any response path. Public directional/accuracy copy stays frozen (and the
> `/track-record` "Directional Accuracy" mislabel remains parked) until a defined,
> symmetric, ungameable metric produces a benchmark-positive, FDR-corrected,
> out-of-sample-stable edge. This wave builds the ruler; it does not authorize a claim.

## 0. Why this exists

PFE Win Rate (~0.92) is a *peak-favorable-excursion base rate*: it has no adverse barrier,
so an always-BUY strategy scores identically (CRYPTO-EDGE-METRIC-W1: 0/130 cells held a real
edge; AOE-OBJECTIVE-PROBE-W1: 21/21 promoted configs BUY). Before a model can *improve*
directional accuracy, directional accuracy must *exist* as a symmetric, realized, ungameable
metric. **Directional Win Rate (DWR)** is that metric. Expected baseline: **DWR ≈ benchmark
(~50%) in most/all cells — the honest zero, which is SUCCESS for this measurement wave.**

## 1. The label — symmetric triple-barrier race (per signal)

For each crypto BUY/SELL signal, race two symmetric price barriers against a vertical
(time) barrier, using candle high/low on the signal's own venue/symbol/timeframe klines.

- **Barriers:** upper/lower at `entry × (1 ± barrier_pct)`, symmetric.
- **Vertical barrier (`W`):** the signal's PUBLISHED evaluation window (identical to
  `backfill-outcomes.ts` `EVAL_CANDLES`):

  | tf | 3m | 5m | 15m | 30m | 1h | 2h | 4h | 8h | 12h | 1d |
  |----|----|----|-----|-----|----|----|----|----|-----|----|
  | W  | 12 | 12 | 12  | 8   | 8  | 6  | 6  | 4  | 4   | 3  |

  **`1m` is never labeled** — the 1m lane was retired (OPS-1M-SEED-DECOM-W1) and the 3m floor
  is permanent per the latency ruling; 1m signals are counted under coverage reason
  `timeframe_retired` and excluded from the FDR family.

- **`barrier_pct = max(τ · σ_w, 0.30%)`** (stored in **percent**). The `0.30%` floor ≈ 3×
  round-trip taker (2 × 0.05%), so a "win" is a tradeable move, not noise.
- **σ_w** = **sample** stdev (n−1) of `ln(close[t] / close[t−W])` over the trailing **60
  non-overlapping W-candle windows** ending at entry (same venue/symbol/timeframe klines).
  Fewer than **30** windows available → the label is still written with
  `low_vol_history = true` (barrier falls back to the floor) and is **excluded from cell stats**.
- **Ternary outcome (`label`):** **+1** target-touched-first · **−1** adverse-touched-first ·
  **0** timeout (neither inside `W`). Touch test uses candle **high/low**.
- **Same-candle ambiguity** (both barriers inside one candle's high–low range): **−1
  conservative** + `ambiguous_candle = true`. Ambiguity rate is reported per timeframe; any
  `3m`/`5m` cell > 10% flags a follow-up refinement wave (this wave does NOT build sub-candle
  resolution).
- **SELL races mirror** (target below entry). **HOLD excluded** (dashboard rule: Total Trade
  Calls = BUY + SELL only; HOLD is not persisted in `signals`).
- **`t_hit_candles`** = 1-indexed candle of first touch; `NULL` on timeout.
- **`mfe_return_pct` / `mae_return_pct`** are REUSED verbatim from `signals.pfe_return_pct` /
  `signals.mae_return_pct` (identical eval window; Q4 architect scope-reduction). They are
  signed **price-perspective** percentages (BUY: mfe ≥ 0, mae ≤ 0; SELL mirror). The labeler
  recomputes them from klines only for a non-fatal sanity WARN; it never fails on mismatch.

### Versioned `barrier_spec`

`tau{X.X}-floor{0.30}-v1` — the primary spec is **`tau1.0-floor0.30-v1`**; sensitivity specs
**`tau0.5-floor0.30-v1`** and **`tau2.0-floor0.30-v1`** are written from the same klines
(τ only changes `barrier_pct`). The primary drives all headline stats.

## 2. The metrics (per cell)

**Family = `timeframe × tier × confidence-bin × regime`** (reused from CRYPTO-EDGE-METRIC-W1):
- tier: `T1` (coin ∈ {BTC, ETH}) else `rest`
- confidence-bin: `c52_59` (<60) · `c60_74` (<75) · `c75_100` (≥75)
- regime: `coalesce(regime, 'none')`
- **Powered floor: `n ≥ 50` decided calls** (wins + losses; timeouts excluded).

- **`DWR = wins / (wins + losses)`**; timeout-rate reported alongside (timeouts excluded from
  the denominator).
- **Benchmarks** from the SAME windows + SAME klines: empirical always-BUY DWR + always-SELL
  DWR (**computed, not assumed complements** — timeouts + conservative ambiguity break the
  complement identity) + analytic 50% reference.
- **`Directional Edge = DWR − max(alwaysBUY, alwaysSELL)`**; Wilson 95% CI on DWR; edge CI vs
  the fixed benchmark.
- **Pesaran-Timmermann** (`edge-stats.pesaranTimmermann`) z/p per cell, computed twice:
  (a) all decided calls, (b) non-overlapping subsample (first call per symbol per window-length
  — serial-dependence control). One-sided upper p (certifies directional skill). **Constant-side
  cells** (all-BUY or all-SELL predictions) → `PT_NA_CONSTANT_SIDE` — the test is undefined by
  design; an all-BUY cell can never certify skill.
- **BH-FDR q = 0.05** across the powered family (`edge-stats.benjaminiHochberg`) + Bonferroni
  cross-check (`edge-stats.bonferroni`). Any FDR survivor → **time-split walk-forward**: first
  **70%** calendar-time (by `created_at`) train-discovery / last **30%** holdout; a cell
  survives only if it keeps the same sign **and** PT p < 0.05 in the holdout.

## 3. Single-derivation stats module

`src/scripts/edge-stats.ts` is the **one** canonical implementation of the edge/directional
statistics — a leaf module importing nothing from the project. It exports `wilsonInterval`,
`benjaminiHochberg`, `bonferroni`, `normalCdf`, `excessZP` (MOVED verbatim from
`calibration-audit.ts`, which now re-exports them — interface-preserved) plus the new
`pesaranTimmermann` and `dwrFromLabels`. E3′ (the meta-model wave) and any future AOE
promotion-gate retrofit import from here — never re-derive the math.

## 4. Gate semantics (what counts as an edge)

A cell holds a **validated** directional edge only if ALL hold on the primary spec:
1. `n ≥ 50` decided calls (powered);
2. `Directional Edge > 0` with the DWR Wilson CI separated from the benchmark;
3. PT survives BH-FDR at q = 0.05 across the family (Bonferroni cross-checked);
4. walk-forward holdout keeps the sign **and** PT p < 0.05.

Zero validated cells is the **expected** and **honest** baseline for the current engine and
counts as SUCCESS for this wave. No public claim, version bump, or copy change is authorized by
a green result here — that is a separate, Mr.1-gated remediation wave.
