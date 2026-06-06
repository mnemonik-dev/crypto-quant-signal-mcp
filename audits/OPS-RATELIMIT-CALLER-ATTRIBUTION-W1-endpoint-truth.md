# OPS-RATELIMIT-CALLER-ATTRIBUTION-W1 — endpoint-truth (Plan-Mode)

**Date:** 2026-06-06
**Verdict:** ✅ **RATIFIED → PROCEED** (architect 2026-06-06: Q1=per-event + caller column, **NO** summary-flush layer; Q2=seed in-scope with clean-baseline guard, non-critical-path; all 12 callers endorsed). Originally 🛑 HALT on 3 fictional primitives (the spec assumed the telemetry wave `86074d4` shipped a write-amplification *summary recorder* with `event_count` — it shipped a **per-event fire-and-forget** recorder). Per the V2-RESUME rule the 3 drift-fixes are folded below; no re-dispatch.

### Pre-resolved drift corrections (architect-ratified)

| # | Spec stale primitive | Correction (binding) |
|---|---|---|
| 1 | `event_count` column / 7-col baseline | **No `event_count`.** 7→**8** columns (add `caller` only). The summary premise was a spec defect — wrongly imported from OPS-SEED-ORCHESTRATOR CH3's *connection-spike* finding (the orchestrator's parallel SEED queries, NOT this recorder). |
| 2 | "cron procs flush ≤1 summary row per window" | **DROPPED entirely.** At ~54 throws/min (~1 write/sec, fire-and-forget on the existing pool) write-amplification is a non-issue; Postgres doesn't notice. No summary layer, no follow-up — revisit only if caller telemetry itself later shows write pressure (it won't at this volume). |
| 3 | "window-summary" DB-write path (R2) | **Per-event recorder is the target.** Thread `caller` through the existing per-event `INSERT`. Target = `upstream-weight-budget.ts:215`; ALS = `weightClassContext`; migration = `009`. |

**Q2 resolution:** seed wrap IN-SCOPE with clean-baseline guard, but NOT on the AC4 critical path (the ~54/min driver is interactive/server-side; `seed:<tf>` callers mostly WAIT in the batch lane, not throw). Clean-baseline clear → tag seed at `runAsBatch`. Seed run mid-flight → do **not** HALT; ship the other 11 callers + defer ONLY the seed tag to a 1-line follow-up.

Risk markers present: DB DDL (ADD COLUMN), cross-host (SSH migration pre-apply + `deploy-direct.sh`), non-GHA deploy path, identifier cited in >1 place. Plan-Mode mandatory; spec says "wait for architect."

---

## Step 0 — system-map edge-touch enumeration

No EXTERNAL edge mutation. No new MCP tool. `tools/list`=9 unchanged. No response-shape change. Internal only:
- **`rate_limit_events` table** gains a `caller text NOT NULL DEFAULT 'unknown'` column + index `(ts, venue, caller)`. Producer = the recorder; consumers = the weekly digest (`shadow-digest-weekly.ts`) + ad-hoc ops queries. **No public consumer** (internal observability table; never surfaced via MCP/API/landing).
- **`recordRateLimitEvent` / `recordRateLimitEventImpl`** signatures gain `caller` (producer-internal).
- **budget ALS context** (`upstream-weight-budget.ts`) gains a `caller` dimension (internal).
- **12 entry points** set `caller` (9 tool handlers + grid_warmer/seed/backfill) — internal.

`system-map.md updated: Y` on ship (annotate the `rate_limit_events` table + recorder with the caller dimension).

---

## Primitive probe table (`claim | reality | resolution`)

| # | Spec primitive (claim) | Probe | Reality | Resolution |
|---|---|---|---|---|
| 1 | `rate_limit_events` has `event_count` column (§Context L24) | `\d rate_limit_events` live | ❌ **FICTIONAL** — 7 cols only: `id, ts, venue, kind, http_or_body_code, class, wait_ms` | Migration 009 adds **`caller` only**; `event_count` does not exist anywhere (DB, migrations ≤008, recorder INSERT) |
| 2 | "cron procs flush ≤1 summary row per window" (§Context L25) | read `recordRateLimitEventImpl` + 5 sites | ❌ **FICTIONAL** — recorder is **per-event** `INSERT` fire-and-forget from **every** process; no summary/flush layer | **Q1 fork** → recommend per-event `caller` (write-rate-neutral) |
| 3 | "window-summary" DB-write path (R2 L30) | grep recorder sites | ❌ **FICTIONAL** — the budget's per-window "window" is a **log line**, not a DB write | Thread `caller` through the per-event recorder; drop "window-summary" |
| 4 | `AsyncLocalStorage` budget context carries `class` (L23) | `upstream-weight-budget.ts:62` | ✅ REAL — `weightClassContext`, `currentWeightClass()` (default `interactive`), `runAsBatch`/`runAsInteractive` | Extend to carry `caller` |
| 5 | recorder, **5 wired sites** from `86074d4` (L23) | grep | ✅ REAL — budget `201`(wait/batch) `215`(throw/interactive **← target**) `229`(skip/batch) + fetch `97`/`106`(throw/ban) | Thread `caller` |
| 6 | throw site `_upstream-fetch.ts` (L23) | grep `:97/:106` | ✅ REAL (reads `req.cls ?? currentWeightClass()`) | Read `currentCaller()` likewise |
| 7 | digest `⚡ Rate-limit telemetry (7d)` (`shadow-digest-weekly.ts`, L23) | prior wave | ✅ REAL (`buildRateLimitSection`/`aggregateRateLimit`/`p95`) | R4: add per-caller HL sub-block |
| 8 | `scripts/deploy-direct.sh` + `--verify-only` (L11) | read | ✅ REAL — `full` / `--verify-only` / `--help`; image **rebuilds on host** (only needs source landed, NOT origin); gate = healthy(40s) + dist files + `/mcp` 3-step → `tools/list`==9 | Deploy path |
| 9 | stampede fix `c840be7` **LIVE** (L14) | `docker exec` | ✅ REAL — `coalescedCache` in `/app/dist/lib/coalesced-cache.js`; deployed SHA `c840be7` | Confirms `deploy-direct.sh` works |
| 10 | candidate callers (L19): `get_trade_call … backfill` | grep entry points | ✅ MOSTLY — **9** tool handlers (not 5) + **3** batch (`grid_warmer`@cross-asset-grid:341, `seed:<tf>`@seed-signals:990, `backfill`@index:2223 + backfill-outcomes:143) | Tag **all 9 tools + 3 batch = 12** callers (generic ALS tag, zero cost) |
| 11 | migration `0XX` (R1) | `ls migrations` | ✅ `008_rate_limit_events.sql` is last | **`009_rate_limit_events_caller.sql`** |
| 12 | HL still saturated (~50/min) for the payoff window (L15) | live `GROUP BY` | ✅ REAL — **~54/min** throws last 30 min | AC4 window will have data |

**Fictional count = 3** (#1/#2/#3 — all the assumed summary recorder) → **≥3 → HALT** per the LAW.

---

## Identifier diff (R-section ↔ AC-section)

| Identifier | R cite | AC cite | Match? |
|---|---|---|---|
| venue string | `getAdapter('HL')` / `venueName` | AC4 `venue='Hyperliquid'` | ✅ adapter `venueName='Hyperliquid'` |
| `tools/list` count | R3 "each MCP tool handler" (9 `server.tool`) | AC5 `tools/list`=9 | ✅ 9 |
| target throw row | R2 throw site `215` (interactive `BUDGET_CEILING`) | AC4 `kind='throw'` | ✅ `caller` read at 215 |
| migration file | R1 `0XX` | (none) | → 009 |
| default value | R2 default `'unknown'` | AC4 "dominant driver `!= 'unknown'`" | ✅ consistent (unknown = un-tagged path) |

No mismatches.

---

## The ONE design fork (why this is a HALT, not a silent inline fix)

The spec's premise (summary recorder + `event_count`) is wrong **and propagates** — it is the mental model Cowork will carry into the downstream **HL-WEBSOCKET** wave this unblocks. Correcting the SoT at the source matters. And it creates a genuine scope decision I must not make unilaterally:

- The spec asserts a write-amplification constraint ("cron procs flush ≤1 summary row per window") **that does not exist** — crons write per-event today.
- Adding `caller` to the **existing** per-event writes is **write-rate-neutral** (same rows, +1 column) and fully achieves AC4's payoff (the ~54/min interactive driver is server-side per-event already).
- So the "summary-flush" layer is **orthogonal** to this wave — but the spec assumed it was already there. Whether to build it (now / follow-up / never) is an architect call.

---

## Proposed execution plan (contingent on Q1 = "proceed per-event")

- **C1 / R1** — `migrations/009_rate_limit_events_caller.sql`: `ALTER TABLE rate_limit_events ADD COLUMN IF NOT EXISTS caller text NOT NULL DEFAULT 'unknown';` + `CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ts_venue_caller ON rate_limit_events (ts, venue, caller);` (keep the existing `(ts,venue)` index — no removal, Data Integrity). **Pre-apply via SSH** (independent of GHA); commit as idempotent code. Append the column to `docs/RUNBOOK-POSTGRES-MAINT.md` inventory.
- **C2 / R2** — extend the budget ALS to carry `caller` (parallel `callerContext` ALS or widen the store to `{class, caller}`); `currentCaller()` getter (default `'unknown'`); `runAsCaller(name, fn)` helper. Thread `caller` into `recordRateLimitEvent(venue, kind, code, cls, waitMs?, caller?)` → `recordRateLimitEventImpl` INSERT (now 6 cols). **Preserve the cycle-break** (thin lazy-`import()` recorder untouched in shape). Read `currentCaller()` at all 5 sites.
- **C3 / R3** — wrap each of the **9** `server.tool` handlers with `runAsCaller('<tool_name>', …)`; set `caller` alongside the existing `runAsBatch` at grid_warmer / seed (`seed:<tf>`) / backfill. **Re-run clean-baseline check before touching `seed-signals.ts`** (firewalled in the last 2 waves) — HALT if a seed run is mid-flight (Q2).
- **C4 / R4** — digest: per-caller HL breakdown (top callers by throw count) in the `⚡ Rate-limit telemetry (7d)` section.
- **C5 / R5** — tests: recorder persists `caller`; ALS default `unknown`; digest groups by caller; **fail-open** (DB-down → fetch path unaffected). Clean `rm -rf dist && npm run build`.
- **Deploy** — `scripts/deploy-direct.sh` (full) → its gate self-verifies healthy + `tools/list`=9; **manual AC3 caller-grep** `docker exec <ctr> grep -c caller /app/dist/lib/rate-limit-events.js` (deploy-direct's hardcoded gate #2 checks the stampede files, not caller). **AC4 payoff gate** at +20 min: `GROUP BY caller`. status.md + `system-map.md updated: Y` + WIS.

---

## Cowork Q-block (copy-paste)

> **OPS-RATELIMIT-CALLER-ATTRIBUTION-W1 — Plan-Mode HALT (spec baseline drift, 3 fictional primitives).**
> The wave is sound and ~95% executable, but the spec's `rate_limit_events` recorder description is wrong — it assumes the telemetry wave `86074d4` shipped a write-amplification *summary* recorder with an `event_count` column. Live probe: it shipped a **per-event** recorder; there is **no** `event_count` column and **no** summary-flush layer.
>
> **Q1 (blocking).** Add `caller` to the existing **per-event** recorder — one extra column on writes that already happen, **zero write-rate change**, AC4 payoff achieved. The "summary-flush per window" the spec assumes isn't needed for attribution and is a separate concern. **Proceed per-event [RECOMMENDED], or do you want a write-amplification summary-row layer built (this wave / a follow-up)?**
>
> **Q2 (confirm).** `seed-signals.ts` was firewalled the last two waves (active seed sessions). R3 needs a 1-line `caller='seed:<tf>'` wrap at its existing `runAsBatch` (line 990). Confirm in-scope; I'll re-run the clean-baseline check and HALT if a seed run is mid-flight.
>
> **FYI (no decision).** I'll tag all **9** tool handlers + **3** batch callers = 12 (not just the 5 HL-touching ones listed) — generic ALS tag, zero cost, future-proofs "what's driving venue X" for every venue.
