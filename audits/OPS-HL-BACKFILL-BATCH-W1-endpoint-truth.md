# OPS-HL-BACKFILL-BATCH-W1 — endpoint-truth (Plan-Mode, light)

**Date:** 2026-06-06
**Verdict:** ✅ **READY — 0 fictional primitives** (the spec is built from `OPS-RATELIMIT-CALLER-ATTRIBUTION-W1`'s live finding; every primitive verified). **ONE architect-confirm** (the spec's gated question): batch-class **alone** vs batch-class **+ in-flight guard**. Wait for architect before C1.

Risk markers: identifier (`runBackfill`) cited >1 place; deploy via the non-GHA path; one architect-confirm. Light Plan-Mode.

## Architect ratified (2026-06-06): **Option B** + 5 binding items

1. **Wrap lazy `runBackfill` in `runAsBatch` + module-level `backfillInflight` single-flight** mirroring `cross-asset-grid.ts:339 ensureRefreshInflight` EXACTLY (set-on-start / `.finally` clear-on-settle); keep the `signal_perf_backfill` tag. ✅ implemented (`src/resources/signal-performance.ts`).
2. **Confirm-before-coalescing (CONFIRMED):** `runBackfill()` is a GLOBAL no-arg sweep — `getSignalsNeedingUnifiedBackfillAsync(): Promise<SignalRecord[]>` (`performance-db.ts:1593`) takes **no args** (all due outcomes, not asset-parameterized by the calling read). → sharing one in-flight is sound; reader B's needs are satisfied by reader A's sweep.
3. **Freshness ack:** the read returns `getPerformanceStatsAsync()` (untouched) → coalescing only the background fire-and-forget backfill changes nothing a read returns. Zero Data-Integrity/freshness impact; no freshness-gate.
4. **Pattern-threshold (generator hygiene):** `backfillInflight` is the **2nd** hand-rolled pure-single-flight-void wrapper (`ensureRefreshInflight` = 1st; `coalescedCache` doesn't fit — caches a value, this returns none). Below the 3-example threshold → **inline this wave**; WIS-flag: a 3rd warrants a shared `singleFlight()` helper.
5. **Unit test:** 2 concurrent reads → one shared sweep, batch class. ✅ `tests/unit/signal-perf-backfill-batch.test.ts` (3 cases: single-flight+batch, guard-clears-on-settle, fail-open).

---

## Step 0 — system-map edge-touch

NO new edge. The change is a **weight-class flip (interactive → batch)** on the EXISTING `signal_perf_backfill → HL (REST)` producer edge. No new component, no MCP tool, `tools/list`=9, no response-shape change. `system-map.md updated: Y` on ship (class annotation on the existing edge — extends `OPS-HL-RATELIMITER-W2`'s "in-server runBackfill = batch" to the lazy path it missed).

---

## Primitive probe table (`claim | reality | resolution`)

| # | Spec primitive | Probe | Reality | Resolution |
|---|---|---|---|---|
| 1 | lazy `runBackfill` in `getSignalPerformance` is interactive, tagged `signal_perf_backfill` | read | ✅ `src/resources/signal-performance.ts:121` `runAsCaller('signal_perf_backfill', () => runBackfill()).catch(()=>{})` — fire-and-forget, never blocks the read (returns `getPerformanceStatsAsync()` next line) | R1: wrap in `runAsBatch` |
| 2 | `runAsBatch`/`runAsCaller`/`callerContext` exist (attribution wave) | grep | ✅ `upstream-weight-budget.ts`; `runAsBatch(fn, caller?)` sets BOTH batch class + caller tag | `runAsBatch(() => runBackfill(), 'signal_perf_backfill')` |
| 3 | the OTHER `runBackfill` sites already use `runAsBatch`; the lazy is the ONLY interactive one | grep `runBackfill(` | ✅ 3 call sites total: `index.ts:2223/2224` (scheduled, `runAsBatch('backfill')`) + `signal-performance.ts:121` (lazy, interactive). The 3-min standalone cron (`backfill-outcomes.ts main()`) + seed are SEPARATE outcome-backfill fns (already `runAsBatch`) | confirmed — lazy is the sole interactive path |
| 4 | live driver = 100% `signal_perf_backfill` interactive | live GROUP BY | ✅ NOW: `signal_perf_backfill\|interactive\|throw = 324/15min (21.6/min)`; `backfill\|batch\|wait` (the scheduled copy yields correctly) | AC2 'before' baseline = 21.6/min (in the spec's 25–54 range) |
| 5 | `runBackfill` in-flight/coalesce guard? | grep | ❌ **NONE** — plain async (`getSignalsNeedingUnifiedBackfillAsync` → `slice(0,50)` → for-loop). Concurrent reads CAN stack N backfills | **architect-confirm** (below) |
| 6 | the ~6-min spike driver (which reader?) | host crons + in-server timers | external read traffic — host crons are weekly/daily (forum-post Sun, drift-canaries Mon/Tue), NOT 6-min; the only in-server timer (`index.ts:2224`, 5-min) is the BATCH `backfill`, not the lazy path | batch-class fixes it regardless of reader |
| 7 | per-backfill HL over-fetch | read | ✅ already bounded — `getCandles(...,fetchEndTime)` = `signalTime + (evalCount+2)*candleMs` (`OPS-HL-SEED-LOAD-W1`), not `[signalTime, now]` | no change needed |
| 8 | `rate_limit_events.caller` live (AC2 query) | (my wave) | ✅ migration 009 live | AC2 payoff query ready |
| 9 | `deploy-direct.sh` (GHA down) | recon | ✅ used 4× last wave; host at `c9f415a`, origin at `81fa239` | use it — see coordination note |

**Identifier diff:** `runBackfill` (R1) → 3 sites, only the lazy interactive (✅); `signal_perf_backfill` tag preserved; venue `'Hyperliquid'` (AC2) ✅; `tools/list`=9 (AC1) ✅. No mismatch. **0 fictional primitives.**

---

## ⚠️ Coordination note (deploy)

Host = `c9f415a` (my last deploy); origin/main = **`81fa239`** = the SIBLING wave `X402-BAZAAR-HTTP-REDECLARE-W1`'s x402 PaymentRequired-header fix (committed + pushed, not yet deployed). `deploy-direct.sh` resets the host to origin/main, so **my deploy will ALSO land `81fa239`**. It is **firewalled** (the x402 routes mount only when `X402_FACILITATOR=cdp` AND `BAZAAR_DISCOVERABLE=true`; production defaults `legacy`/`false` → routes 404 → production byte-identical), so landing it is **safe / no production impact at default flags**. Flagging for awareness — a sibling's commit deploys via this wave's deploy.

---

## THE architect-confirm (the spec's one gated question): batch-only vs batch + in-flight guard

`runBackfill` has **no in-flight guard** (probe #5), so concurrent `getSignalPerformance` reads can stack N independent backfills (each fetching candles for the same overlapping pending signals — redundant HL work).

- **Option A — batch-class ONLY (spec default; SUFFICIENT for the payoff).** Wrap the lazy call in `runAsBatch`. Interactive throws collapse to ~0 (AC2 met). Stacking persists but is now **self-limiting**: in batch the stacked backfills WAIT under budget pressure and SKIP after ≤5min (`OPS-HL-RATELIMITER-W2` semantics) — they never throw, never touch the interactive reserve. Redundant HL calls remain (minor batch-lane waste). Minimal change; zero freshness risk.
- **Option B — batch-class + a single-flight in-flight guard (RECOMMENDED, idiomatic).** Add a module-level `let backfillInflight: Promise<void>|null` so concurrent reads SHARE one batch backfill (`if (inflight===null) inflight = runAsBatch(...).finally(()=>inflight=null)`). Eliminates the redundant stacking entirely. **No user-facing change** — the backfill is fire-and-forget; the read response (`getPerformanceStatsAsync`) is untouched, so freshness of the returned stats is identical; only the BACKGROUND backfill coalesces. **This is the exact pattern already in the codebase** — `cross-asset-grid.ts:339 ensureRefreshInflight` single-flights the grid warm the same way. ~4 extra lines + a unit test.

**Recommendation: Option B.** It fully achieves AC2 AND retires the redundant-stacking sub-issue with zero freshness/user-facing impact, using the codebase's own established single-flight idiom. Option A is a valid conservative fallback (achieves the payoff; leaves the minor batch-lane redundancy). Both keep the `signal_perf_backfill` tag.

---

## Execution plan (contingent on the architect-confirm)

- **C1 / R1** — `src/resources/signal-performance.ts:121`: `runAsCaller('signal_perf_backfill', () => runBackfill())` → `runAsBatch(() => runBackfill(), 'signal_perf_backfill')` (swap the import `runAsCaller`→`runAsBatch`); **Option B** adds the module-level `backfillInflight` single-flight guard around it.
- **C2 / R2** — unit test: a `getSignalPerformance` read issues its backfill in **batch** class (assert the budget sees `currentWeightClass()==='batch'` during the backfill, not `interactive`); fail-open preserved (a backfill error never affects the read). Option B: + assert two near-simultaneous reads share ONE in-flight backfill.
- **C3 / R3** — Option A → document "batch-class sufficient; stacking self-limits in batch" in this audit. Option B → the guard IS R3.
- **Deploy** — `deploy-direct.sh` (lands `81fa239` too — firewalled). **AC2 payoff** (20-min): `signal_perf_backfill` interactive throws → ~0 (now batch waits). **AC3** live provenance: repeated `get_trade_call BTC HL 15m` served by HL (not Binance fallback). **AC4 sibling close**: annotate `OPS-HL-CACHE-STAMPEDE-GENERATOR-W1` C4 (throw-collapse achieved here via backfill re-class, not the stampede). status.md + `system-map.md: Y` + WIS.
