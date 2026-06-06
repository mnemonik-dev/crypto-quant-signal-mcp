# OPS-RATELIMIT-TELEMETRY-DIGEST-W1 — Plan-Mode endpoint-truth

**Date:** 2026-06-05 · **Tier:** META (operator telemetry) · single-session sequential · markers: cross-host (DB pre-apply via SSH) + new DDL.

- **Verdict:** **NOT a fiction-HALT — 0 fictional primitives** (every cited primitive live-verified). **3 minor drifts** (digest is a container repo script not a `/opt/*` host script; `W{NEXT}` emitted-literal not send-time-resolved; the "typed-throw site" is 2 sites + a 3rd budget self-throttle throw) — all resolved below within spec intent. **No V2-RESUME clause in spec + the wave does NEW DDL pre-applied to prod + wires the hot-path transport → architect ratification gate BEFORE C1** (per default Plan-Mode + the risk markers).

---

## §1 — Primitive probe (claim | reality | resolution)

| Spec primitive | Probe | Reality | Resolution |
|---|---|---|---|
| fail-open recorder pattern (`equity_symbol_misses`) | `src/lib/equities/equity-misses.ts` | ✅ `recordSymbolMiss(pool,…)` = try → `pool.query(INSERT)` + success-log; catch → warn (fail-open); caller `void`-s it | mirror as `recordRateLimitEvent` |
| recorder must work from MCP server AND seed crons (pool capped 2) | `getBackend()` in performance-db.ts:714; `recordSignal` uses `getBackend().run(sql,…)` | ✅ shared module singleton; `b.run` is already **fire-and-forget on PG** (recordSignal returns void, never throws); both the long-lived server + the `docker exec` seed crons call `getBackend()` | recorder = `getBackend().run('INSERT INTO rate_limit_events …')` — no new pool |
| no circular dep (transport → recorder → DB) | `grep import.*upstream/_upstream/venue-budget src/lib/performance-db.ts` | ✅ **empty** — performance-db imports none of the transport → clean DAG | recorder in performance-db.ts (or thin `rate-limit-events.ts`); safe to import from the transport |
| `_upstream-fetch.ts` typed-throw site | `grep "throw new UpstreamRateLimitError" …` | ✅ **TWO**: L96 (banStatus → code=HTTP status) + L103 (banBodyCode → code=body code) | record at BOTH; `kind='throw'`, `http_or_body_code=<status\|bodycode>`, `class=currentWeightClass()` |
| `upstream-weight-budget.ts` wait/skip summary sites | `grep event:'…' …` | ✅ L203 `interactive_throw`, L216 `batch_skip`, L235 `batch_wait` (+ L302 `window` aggregate) — each has `this.venue`, cls, weight, wait_ms | record at L203/216/235 (NOT per-retry — see §4) |
| migration precedent `006_*`/`007_*` | `ls migrations/` | ✅ 001-007; **next = `008`**; `006_equity_misses.sql` = `CREATE TABLE IF NOT EXISTS … BIGSERIAL PK … TIMESTAMPTZ DEFAULT now()` + `CREATE INDEX IF NOT EXISTS`, pre-applied via SSH before commit | `008_rate_limit_events.sql` same shape |
| DB `signal_performance` reachable + table greenfield | `docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance` | ✅ reachable; `to_regclass('public.rate_limit_events')` = **NULL (greenfield)**; `equity_symbol_misses` present; **no schema_migrations table → pure pre-apply convention** | pre-apply 008 via SSH; commit IF-NOT-EXISTS code = no-op |
| live **weekly digest** vehicle | host `crontab -l` + repo grep | ✅ `0 0 * * 0 docker exec … node dist/scripts/shadow-digest-weekly.js` — **`src/scripts/shadow-digest-weekly.ts`** (Sun 00:00 UTC; `dbQuery` + `sendDigest` from telegram.js; `--dry-run` seam) | R3 extends THIS repo script (DRIFT-1) |
| `RUNBOOK-POSTGRES-MAINT.md` (R1 VACUUM row) | `ls docs/` | ✅ exists; "Append-only tables → monthly VACUUM (ANALYZE)" section | append `rate_limit_events` row |
| `OPS-<CLASS>-W{NEXT}` template; no literal `W1` | runbook + CLAUDE.md | ✅ template form mandated; `send_telegram.sh` resolves via status.md grep — but the digest uses `sendDigest` (telegram.js), not `send_telegram.sh` | emit literal `OPS-…-W{NEXT}` (DRIFT-2) |

## §2 — DRIFT items + resolutions (3, all minor / non-fictional)

- **DRIFT-1 — the "weekly digest vehicle on the monitoring host" is a CONTAINER repo script, not a `/opt/algovault-monitoring/*` host script.** The live weekly digest is `src/scripts/shadow-digest-weekly.ts` (deployed to the container, fired by a host cron `0 0 * * 0 docker exec …`). **Resolution:** R3 extends the repo script (the digest content is built there); the only host/cross-host surface is the cron trigger (unchanged) + the DB pre-apply. (There is also a Sun 09:00 `chat-analytics-digest` + a daily `algovault-bot-digest.timer`; the SHADOW weekly digest is the venue-focused one → correct home for a per-venue rate-limit section.)
- **DRIFT-2 — `W{NEXT}` is emitted as a literal template, not send-time-resolved.** `send_telegram.sh`'s status.md-grep resolution is a HOST-wrapper feature; `shadow-digest-weekly` sends via `telegram.js sendDigest` (container, no status.md access). **Resolution:** the trigger lines emit the literal template `Action: dispatch OPS-SHADOW-BUDGET-W{NEXT}` / `OPS-HL-WEBSOCKET-W{NEXT}` — the `{NEXT}` placeholder IS the non-hardcoded form; operator/Cowork resolves the number at dispatch (same as the autopilot's template pre-resolution). AC3 ("grep proves no literal wave number") **passes** — `W{NEXT}` contains no digit.
- **DRIFT-3 — three throw KINDS, not one "typed-throw site".** (a) venue-ban throw in `_upstream-fetch` L96/103 (`http_or_body_code`=418/429/403/45001…); (b) budget self-throttle `interactive_throw` in `upstream-weight-budget` L203 (we hit OUR ceiling BEFORE the fetch — `http_or_body_code='BUDGET_CEILING'`). **No double-count:** `acquire()` throws BEFORE the fetch, so the ban-throw (post-fetch) never fires on the same request. **Resolution:** record both — they are distinct telemetry and BOTH feed the triggers (HL interactive throws = budget self-throttle; shadow venue throws = bans). The `_upstream-fetch` catch (L106) re-throws `UpstreamRateLimitError` WITHOUT re-recording (recorder is at the throw site, not the catch).

## §3 — Design decisions (sensible defaults; flag for architect)

1. **HL batch-wait p95 computed in JS, not SQL `percentile_cont`.** Per the dual-backend rule (`percentile_cont` is PG-only, fails SQLite), the digest fetches HL batch `wait_ms` rows and computes p95 in JS — keeping the **trigger-line logic a pure function** unit-testable both sides of the threshold (R4) without a live PG.
2. **Recorder fire-and-forget via `getBackend().run` (fail-open).** Short-lived seed crons may drop the last in-flight row on exit — **best-effort-acceptable** (telemetry; the ≥3-shadow-throws/wk + sustained-HL thresholds tolerate ±1). Budget sites are rare/low-freq, so even an inline `void` add is off-hot-path in practice.
3. **1 `wait` row per acquire-wait, not per loop iteration** (spec R2): record once when an `acquire()` first waits, carrying the eventual total `wait_ms` (or sample the first wait) — NOT per window-roll sleep.
4. **Digest = shadow-digest-weekly (Sun 00:00), extended in place.** No new TG path; the rate-limit section renders zeros when healthy; trigger lines appear only on trip.

## §4 — system-map edge-touch (Step 0)

- **NEW component** `rate_limit_events` table (signal_performance) — producer: `recordRateLimitEvent` (from `_upstream-fetch` + `upstream-weight-budget`, fire-and-forget); consumer: `shadow-digest-weekly` (weekly read). **NEW section** on the existing `shadow-digest-weekly → Telegram (sendDigest)` digest edge. NO new TG ALERT path (digest section only); `tools/list`=9 unchanged; no public response-shape change. **system-map.md updated: Y** (new table + recorder producer edges + digest-section read edge).

## §5 — Plan (R1-R4) + pre-apply

- **C0 pre-apply** (cross-host, gated): `docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance < migrations/008_rate_limit_events.sql` BEFORE the code commit; verify `\d rate_limit_events`.
- **R1** — `migrations/008_rate_limit_events.sql`: `rate_limit_events(id BIGSERIAL PK, ts TIMESTAMPTZ DEFAULT now(), venue TEXT, kind TEXT /* throw|wait|skip */, http_or_body_code TEXT NULL, class TEXT /* interactive|batch */, wait_ms INT NULL)` + `CREATE INDEX IF NOT EXISTS … (ts, venue)`. RUNBOOK VACUUM row.
- **R2** — `recordRateLimitEvent(venue, kind, code, cls, waitMs?)` in performance-db.ts via `getBackend().run` (fail-open). Wire: `_upstream-fetch.ts` L96/L103 (ban throws, `currentWeightClass()`); `upstream-weight-budget.ts` L203 (`throw`/`BUDGET_CEILING`/interactive), L216 (`skip`/batch), L235 (`wait`/batch/wait_ms — once per acquire).
- **R3** — extend `shadow-digest-weekly.ts`: 7d per-venue `dbQuery` (throws/waits/skips × interactive/batch) + JS p95 of HL batch waits; render a "Rate-limit telemetry (7d)" section (zeros when clean); emit `Action: dispatch OPS-SHADOW-BUDGET-W{NEXT}` (≥3 shadow throws/wk) / `OPS-HL-WEBSOCKET-W{NEXT}` (HL interactive throws sustained OR HL batch-wait p95 > 20s) ONLY on trip. `--dry-run` renders it.
- **R4** — vitest: recorder fail-open (DB down → throw still propagates, fetch path unaffected); digest query shape (per-venue rows); pure trigger-line logic both sides of each threshold; grep no-literal-wave-number.

**Acceptance:** AC1 vitest +0 new + DB-down fail-open; AC2 forced throw → row in `rate_limit_events` + GROUP BY returns it; AC3 `--dry-run` renders section w/ live 7d data, no trigger line untripped, forced-threshold renders `W{NEXT}` (grep no literal number); AC4 zero new TG paths + status.md + system-map.md:Y + WIS. No version bump (META/internal).

**HALT-gate before C0/C1: architect ratification** (new DDL pre-applied to prod + hot-path transport wiring + live TG digest extension). 0 fictional → defaults above are execution-ready on ratification.
