# CRYPTO-PFE-BENCHMARK-AUDIT-W1 — R0 schema/contract probe (endpoint-truth)

Read-only forensic wave. **Structural / schema / code facts only — NO win-rate, edge, or sample-count numbers** (those are INTERNAL and live in the private vault artifact `CRYPTO-PFE-BENCHMARK-AUDIT-W1-2026-07-02.md`).

Live probe path: `docker exec crypto-quant-signal-mcp-postgres-1 psql -d signal_performance` (read-only) + `curl` public GET of `/api/performance-public`. Date: 2026-07-02.

| Claimed primitive | Reality (live probe) | Resolution |
|---|---|---|
| `signals` table w/ `signal`, `confidence`, `timeframe`, `coin`, `exchange`, `created_at`, `regime` | All present | ✅ |
| `pfe_return_pct` **and** `mae_return_pct` (+ `outcome_return_pct`) stored per signal | All present; `mae_return_pct` populated for every evaluated row | ✅ → benchmarks reconstruct from stored columns (data source **A**, no kline re-fetch) |
| PFE predicate = entry-anchored peak favorable excursion, BUY→highest high / SELL→lowest low, win = BUY `pfe>0` / SELL `pfe<0` | `computePFEMAE` (`src/resources/signal-performance.ts` ≈L64-110) matches; **byte-identical to the equity predicate** | ✅ parity |
| Evaluation windows per timeframe (12/12/12/12/8/8/6/6/4/4/3 candles) | `EVAL_CANDLES` (`signal-performance.ts` L14-18) matches the published table; `max(pfe_candles) ≤ EVAL_CANDLES` per timeframe (no window overrun) | ✅ |
| Public number injects from `/api/performance-public` | `overall.pfeWinRate` served live; read-only replica reproduces it exactly | ✅ |
| `confidence` type | `INTEGER` (0–100), not a 0–1 float | noted (loader divides by 100) |

## Code-vs-published-methodology (R1) — findings (code facts, no numbers here)
1. **The disclosed `confidence >= 60%` filter is NOT applied by the live aggregation.** `getPerformanceStatsAsync` → `loadSignalsForStats` runs `SELECT … FROM signals ORDER BY created_at DESC` with **no** `WHERE confidence >= 60`, and `computeStats` filters only `signal !== 'HOLD'` + `pfe_return_pct != null`. Recording (`recordSignal`) does not gate confidence either. So the live number is computed over signals of **all** recorded confidences, while `methodology.signalFilter` states "Confidence >= 60%." → **methodology copy does not match the computation** (factuality finding; magnitude in the vault artifact).
2. **The "89.4%" figure in circulation is stale** — the live `/api/performance-public` SoT value differs (authoritative value in the vault artifact / live API).

## Leakage structural checks (R4) — code paths
- **Decision as-of:** `get-trade-call` generates each signal from candles ≤ signal time (live generator).
- **Eval window:** `computePFEMAE` slices candles with `time ≥ signalTime` to `EVAL_CANDLES[tf]`; `max(pfe_candles) ≤ bound` for every timeframe → no forward-candle overrun.
- **Ordering:** outcome candles are strictly after `created_at`.

## Fictional-primitive gate
**0 fictional schema primitives** (all columns/table/predicate/windows present + parity confirmed) → no HALT; audit proceeded to R1–R7 (numeric results in the vault artifact).

## Read-only note (AC1)
`signals` is a **live append-only** production table (the signal-recorder writes continuously). `count(*)` drifts upward during any audit regardless of reads; the read-only proof is *zero write/DDL statements issued* (only `\d`/`SELECT`/`curl` GET), with the small count delta attributable to live production, not to this audit.
