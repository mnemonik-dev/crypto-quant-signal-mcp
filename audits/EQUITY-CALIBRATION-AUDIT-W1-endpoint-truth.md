# EQUITY-CALIBRATION-AUDIT-W1 — R0 schema/contract probe (endpoint-truth)

Read-only forensic wave. This repo file records **only structural / schema facts** (column, table, view, predicate existence) — **NO win-rate, edge, or sample numbers** (those are INTERNAL under the equities public-copy HOLD and live in the private vault artifact `EQUITY-CALIBRATION-AUDIT-W1-2026-07-02.md`).

Live probe path: `docker exec crypto-quant-signal-mcp-postgres-1 psql -d signal_performance` (read-only `\d` / `SELECT`). Date: 2026-07-02.

| Claimed primitive (spec/context) | Reality (live probe) | Resolution |
|---|---|---|
| `equity_verdicts` cols: symbol, session_date, call∈{BUY,SELL,HOLD}, confidence, regime, factors_json, engine_version, pfe_horizon_sessions, pfe_pct, outcome_return_pct, outcome_filled_at, created_at | All present (information_schema.columns) | ✅ exists |
| `equity_pfe_by_rank_bucket` view (buckets 1-50/51-100/101-500/etf) | Present; returns bucket rows | ✅ exists |
| `equity_bars_daily` cols: symbol, session_date, open/high/low/close, volume, ingested_at | All present | ✅ exists (benchmark base-rate source) |
| `equity_universe` cols: rank_adv, is_etf, active | All present | ✅ exists |
| `matured` ≡ `outcome_filled_at IS NOT NULL` | Confirmed (only BUY/SELL mature; HOLD never fills an outcome) | ✅ |
| PFE-win predicate `(BUY ∧ pfe_pct>0) ∨ (SELL ∧ pfe_pct<0)` | Matches the shipped source verbatim | ✅ single-derivation (see below) |
| PFE horizon = 5 sessions | `audits/EQUITIES-ENGINE-W1-contracts.md §7`; `PFE_HORIZON_SESSIONS` in `src/lib/equities/equity-constants.ts` | ✅ frozen |
| engine_version scoping | Single `equities-v1` among matured BUY/SELL (no mixed-version headline) | ✅ single version |

## Single-derivation / framing-parity (R1) — code, not numbers
- **Equity PFE**: `src/lib/equities/equity-outcomes.ts` `computePfeOutcome` — entry = close on the verdict session; BUY tracks the highest high, SELL the lowest low; `pfe_pct = (pfePrice − entry)/entry·100`; win = BUY `pfe>0` / SELL `pfe<0`.
- **Crypto PFE**: `src/resources/signal-performance.ts` (≈L85-108) — identical construction (`pfePrice` seeded at entry; `if high>pfePrice` for long / `if low<pfePrice` for short; `pfe_return_pct = (pfePrice − entry)/entry·100`).
- **Verdict: IDENTICAL predicate** → the public equity number, IF published, would be apples-to-apples with the public crypto number. (Whether either is a defensible *edge* is the numeric question answered in the vault artifact.)

## Leakage structural checks (R4) — code paths
- **Decision as-of**: `getRecentBars` (`src/lib/equities/equity-store.ts`) filters `session_date <= $sessionDate` → the verdict uses only bars up to its own session. No forward bars in the decision.
- **Outcome window**: `backfill-equity-outcomes.ts` reads `session_date > verdict.session_date ORDER BY session_date ASC LIMIT horizon` → outcome strictly on sessions +1..+5; entry is the decision session's close. No decision-bar contamination.
- **T+1 ordering**: verdict `created_at` is on a later calendar date than `session_date` for 100% of matured rows → decision predates outcome-bar ingestion.
- **Quarantine**: gap-quarantine emits `regime='quarantined'` on **HOLD** rows only → never enters the BUY/SELL win-rate denominator.

## Fictional-primitive gate
**0 fictional schema primitives** (all claimed columns/tables/views/predicate present + parity confirmed) → no HALT; the audit proceeded to R1–R7 (numeric results in the vault artifact).
