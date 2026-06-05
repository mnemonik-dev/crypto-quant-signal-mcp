# OPS-GRID-PROCESS-BOUNDARY-W1 — Plan-Mode endpoint-truth

**Wave class:** INTERNAL (META tier). No version bump. Plan-Mode light (probe-first; hold only on NEW drift).
**Probed:** 2026-06-06 against `origin/main` @ `6838e10` (= baseline SHA for the +0-new-failures gate).
**Sequencing:** second of the two cross-asset-grid waves; `OPS-GRID-EXCHANGE-TRUTH-W1` (`6a09a44`) already landed → anchors rebased onto post-GRID-TRUTH state. Clean baseline: no uncommitted edits to `cross-asset-grid.ts` or `seed-signals.ts`.

## §1 Root cause (probed from origin, end-to-end)
1. **Process-boundary violation.** `seedExchange` (`src/scripts/seed-signals.ts:788`) calls `getTradeSignal({coin,timeframe,includeReasoning:false,exchange,license:INTERNAL_LICENSE})` — **without `internal:true`** → the enrichment block (`src/tools/get-trade-call.ts:525`, gated only on `!input.internal`) runs `getTryNext`/`getClosestTradeable` → `getGridSnapshot()` → a fresh cron has an empty cache → triggers a full 42-cell Binance-scored refresh **inside the seed process**. N concurrent crons = N×42 hidden Binance calls + a seed-fire stall (first coin awaits the in-flight refresh).
2. **Per-process alert state.** `lastSlowGridAlertAt` cooldown (`cross-asset-grid.ts:99`) is module-level → each short-lived cron has its own → 5 concurrent crons = 5 alerts/min. A cooldown can never work across short-lived processes.
3. **Stale breaker semantics.** Post-budget-unification cells WAIT behind the venue weight budget instead of erroring; "3 refreshes >30s" measures the budgets working, not upstream failure → the self-recovering fallback pages forever (~11/hr). Per the alert contract: "Recovery alerts are noise — default silent recovery."

## §2 Primitive truth table (claim | reality | resolution)

| # | Spec primitive | Reality (probed) | Resolution |
|---|---|---|---|
| 1 | `refreshGrid`/`refreshGridIfStale`/`getGridSnapshot` | EXIST (cross-asset-grid.ts L200/L321/L347) | used as-is |
| 2 | `lastSlowGridAlertAt`, `SLOW_GRID_ALERT_COOLDOWN_MS`, `sendAlert(` trip | EXIST (L99/L100/L279; import L32). `grep -rn` → only refs are inside this file | removed (R2); no external consumer |
| 3 | `isShortLivedScript` (performance-db.ts) | EXISTS L63 = `/[\\/]scripts[\\/]/.test(path)` → `dist/scripts/seed-signals.js`=true, `dist/index.js`=false | gate primitive (R1) |
| 4 | vitest default identity | vitest runner path has no `/scripts/` → `isShortLivedScript(process.argv[1])`=false=server | existing grid tests unaffected by default |
| 5 | `runAsBatch` (upstream-weight-budget.ts) | EXISTS L69 = `weightClassContext.run('batch', fn)` ALS | wrap at inflight-creation (R3); covers warmer + cold-start; no index.ts edit |
| 6 | warmer tick (src/index.ts) | EXISTS L2244-2257, `refreshGridIfStale()` boot+5s & every 50s, skipped when `NODE_ENV==='test'` | unchanged (inherits batch lane via the module) |
| 7 | scorer override seam | EXISTS `_setScorerOverride`/`_getScorerOverride` L420-426 | drives R1/R4 |
| 8 | seedExchange reads only call/confidence/price | VERIFIED seed-signals.ts:797 | zero data impact |
| 9 | enrichment fields response-only, not persisted | VERIFIED get-trade-call.ts:525-559 (`recordSignal` reads signal/confidence/price) | zero data impact |

## §3 Drifts (0 fictional → V2-RESUME PROCEED)
- **D1 (pre-existing):** AC2 cites `try_next`; live response key is `also_see` (legacy `try_next` stripped by OUTPUT-SANITIZE-W1 C5; `types.ts:300/307`). Verify `also_see`/`closest_tradeable`; intent "server path intact, keys unchanged" holds.
- **D2 (vacuous):** R4 "update any tests asserting the old alert" — ZERO existing tests assert the grid `sendAlert` (`grep -rn sendAlert tests`=∅; telegram mocks are for `sendVenueStatusChange`). Added a spy-asserts-zero regression guard instead.
- **D3 (in-scope behavior change):** R3 SWR changes `getGridSnapshot`'s stale path from block→serve-stale+background-kick → `cross-asset-grid.test.ts` Test 3 rewritten to the SWR contract. The 13 other grid tests use cold/fresh paths (verified case-by-case) — unaffected.

## §4 Implementation (all in `src/lib/cross-asset-grid.ts`)
- **R1:** `let _processIsShortLived = isShortLivedScript(process.argv[1])` resolved once at module load + `_setProcessIdentityForTest(isScript)` seam. `getGridSnapshot()` and `refreshGridIfStale()` short-circuit (cache-or-empty / no-op) when short-lived.
- **R2:** removed `sendAlert` call + `lastSlowGridAlertAt`/`SLOW_GRID_ALERT_COOLDOWN_MS` machinery + the `telegram.js` import. Kept the forensic `console.warn` (full measured-durations) + fallback sizing.
- **R3:** `ensureRefreshInflight()` wraps `refreshGrid()` in `runAsBatch` (covers warmer + cold-start). `getGridSnapshot()`: fresh→return; stale→serve immediately + `void refreshGridIfStale()` coalesced background kick; cold→block-and-fill.

## §5 Test-mock blast radius (necessary consequence of the spec-mandated import)
`cross-asset-grid` now imports `isShortLivedScript` from `performance-db` and calls it at module load. **5 test files** mock `performance-db` AND transitively load the grid (via `get-trade-call`): `get-trade-signal-envelope`, `get-trade-signal`, `trade-call-tradfi-hardening`, `trade-call-reasoning-sanitization`, `trade-call-also-see`. Each partial mock gained `isShortLivedScript: () => false` (server identity = vitest default; `performance-db` import is side-effect-free, backend is lazy, so this preserves their prior behavior exactly — pre-wave there was no gate).

## §6 AC1 results (live)
- Wave tests green: `grid-process-boundary.test.ts` 6/6, `cross-asset-grid.test.ts` 11/11 (incl. rewritten SWR test).
- **Full suite +0 NEW failures vs `6838e10`** — proven by a git-worktree baseline run + `comm -13` diff of failing-file sets (new-failures set empty; the 21 pre-existing failures are the design/copy/knowledge/snapshot/dashboard dev-checkout cluster, identical at baseline).
- `tsc --noEmit` clean; `rm -rf dist && npm run build` clean; dist grep: `isShortLivedScript`+`runAsBatch` present, `sendAlert`+`telegram` absent, `_setProcessIdentityForTest` exported.

## §7 Public-shape impact
`system-map.md updated: n-a` — internal process-boundary + alert-path change. No new edge/component. Server `get_trade_call` response keys UNCHANGED (`also_see`/`closest_tradeable` still emitted on the server path); seed-proc behavior change touches only response-only fields that are omitted + unread + unpersisted there. No `audits/*-shape-snapshot` needed (no public-endpoint shape change).
