# SCAN-OISCORE-FLIP-W1 — maturation gate (follow-up to SCAN-RANKBY-REFINEMENTS-W1 CH4)

**Status: NOT READY — gated on matured-outcome measurement.** CH4 (SCAN-RANKBY-REFINEMENTS-W1)
INSTRUMENTED a real-OI (contracts-basis) re-base of the verdict's internal `oiScore`
WITHOUT changing the live verdict (`OISCORE_SOURCE` defaults to `price`; the live
call/confidence are byte-identical — golden-set verified). The FLIP (set
`OISCORE_SOURCE=oi`) is this SEPARATE ratified wave and MUST NOT happen until the gate
below is satisfied.

## What CH4 shipped (the instrument)
- `deriveVerdict` (pure, in `src/tools/get-trade-call.ts`) — the score→verdict tail; the
  live verdict + the shadow both project from it (single-derivation).
- `oiScoreFromOiDelta(oiChangePct)` — the PROVISIONAL shadow mapping (mirrors the
  priceChange oiScore thresholds onto the OI %Δ: >5→60, >0→20, <-5→-60, <0→-20).
- `oiscore_shadow` PG table (`migrations/021`) — per real signal: `oiscore_price`,
  `oiscore_oi`, `call_price`, `call_oi`, `conf_price`, `conf_oi`. Fire-and-forget +
  try/catch-isolated write → NEVER blocks/fails the live verdict.
- `OISCORE_SOURCE` firewall (`src/lib/oiscore-source-flag.ts`) — default-deny, default `price`.
- Read-only harness `src/scripts/oiscore-shadow-measure.ts` + `summarizeOiScoreShadow`.

## The gate the FLIP wave MUST clear (ALL of)
1. **N matured signals** — ≥ a statistically meaningful number of `oiscore_shadow` rows whose
   signals have MATURED Phase-E outcomes (the FLIP wave finalizes N + the join methodology:
   `oiscore_shadow` ⋈ `signals`/outcomes by `(symbol, exchange, timeframe, ts)`).
2. **WR non-regression** — `PFE-WR(oi) >= PFE-WR(price)` on the matured shadow set (within a
   ratified tolerance). CH4's harness reports DIVERGENCE only (flips + confidence spread); the
   WR comparison is the FLIP wave's job (requires the matured join).
3. **Mapping ratification** — confirm or refine `oiScoreFromOiDelta` (the provisional candidate)
   against the measured data before flipping.
4. **Architect ratification** — explicit sign-off; then set `OISCORE_SOURCE=oi` on prod.

## Flip + rollback
- Flip: set `OISCORE_SOURCE=oi` in the prod env (container env). The live verdict then uses
  `oiScore_oi`; the historical 91.8% PFE-WR track record is immutable + untouched.
- Rollback: unset `OISCORE_SOURCE` (or set `price`) → instant revert to byte-identical.
- Data Integrity: no verdict value changes until measured + ratified; the flip itself is the
  ONLY behavior change and it is reversible in one env edit.

## How to read the current divergence (anytime, read-only)
`docker exec <ctr> node dist/scripts/oiscore-shadow-measure.js [windowDays]` →
flips / flip-transitions / mean |confidence delta| over the window. NO WR yet (gate #1/#2).
