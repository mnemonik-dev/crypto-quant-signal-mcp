# OPS-SEED-ORCHESTRATOR-W1 — endpoint-truth (Plan-Mode Step 0, 2026-06-05)

**VERDICT: ✅ GREEN — BUILDABLE.** All core primitives verified live against `origin/main`. **0 fictional primitives** (HALT threshold ≥3 NOT met). **4 inline spec-text corrections** (none block the build) + **2 resolved notes**. Architect approval requested before CH1. Checkout: `~/code/crypto-quant-signal-mcp/`; deploy dir `/opt/crypto-quant-signal-mcp/`; container `crypto-quant-signal-mcp-{mcp-server,postgres}-1`.

## Probe results (claim | reality | resolution)

| # | Claim (spec) | Reality (probed live) | Resolution |
|---|---|---|---|
| P1 | `origin/main` has `766d3bb`; tree clean | ✓ `766d3bb` on origin/main. Tree NOT clean: `M docs/SUBMIT_AWESOME_YUZEHAO_MCP.md` (parallel editorial) + untracked audits/.cjs | Build on a **worktree off origin/main** → clean baseline. Note N6. |
| P2 | `p-limit 3.1.0` pinned; CJS `require` works | ✓ `"p-limit": "3.1.0"` (package.json:81); in-container `require('p-limit')` → `function` | OK. (Latest 7.3.0 is ESM-only — pin is load-bearing; documented, not a HALT.) |
| P3 | seed-signals.ts chassis anchors | ✓ `UNIVERSE_FETCHERS`(705) `seedExchange`(737) `main()`(801) venue-loop `for(const venueId of venuesToSeed)`(852) `listVenues`/`stampSeedingStarted`(54) `runAsBatch`(52) `parseArgs`→`explicitExchanges`(194/304) `IDEMPOTENCY_WINDOWS`(138) `VALID_TIMEFRAMES`(161). `runVenueSeed`/`runVenuesWithConcurrency`/`rotateVenues` absent (= to-build) | OK — chassis is exactly the venue-table-driven loop the spec describes. |
| P4 | ~45 standard lines (5×9) | ✓ **45** single-exchange standard lines = 30 no-top (1h,2h,4h,8h,12h,1d) + 15 with-top (5m,15m,30m). Also: 3m-all17=1, shadow=9, backfill=1, equities=3 | **CORRECTION C2:** spec Rule-6 regex `--timeframe X --exchange` misses lines with `--top` between the flags → reports 30. Correct probe: `crontab -l \| grep -E 'seed-signals.js --timeframe' \| grep -cE ' --exchange (HL\|BINANCE\|BYBIT\|OKX\|BITGET)( \|$)'` = **45**. Topology matches spec; the *probe command* is fixed — **no real count delta**. |
| P5 | pg gate `psql -U postgres` | ❌ `-U postgres` → `FATAL: role "postgres" does not exist`. ✓ `-U algovault -d signal_performance` → 13 conns | **CORRECTION C1:** all CH3/CH4 pg gates use `docker exec crypto-quant-signal-mcp-postgres-1 psql -U algovault -d signal_performance -tAc '…'`. (Spec L203 pre-flagged this for Step-0 resolution — confirmed.) |
| P6 | logrotate absent → CH4 ships a stanza | ✓ `/etc/logrotate.d/algovault-seed-signals` has `/var/log/seed-*.log {` glob — **covers `seed-orch-*.log`** | **NOTE N5:** CH4 **SKIPS** the new logrotate stanza (glob already covers the new logs). |
| P7 | monitor check-registration pattern | ✓ `FAIL_THRESHOLDS`(111; `backfill:1`,`pfe_winrate:1`) `checkDatabase`(268) `checkBackfillQueue`(348) `const checks`(377) + `consecutiveFails` cross-cycle gate | OK — CH2 freshness check registers as `FAIL_THRESHOLDS.seed_freshness=3` per R2.2. |
| P8 | deploy.yml `docs/**` paths-ignored (CH4 R4.4) | ❌ live `paths-ignore` = `activation-funnel/snapshots/**`, `activation-funnel/README.md`, `ops/systemd/**`, `ops/monitoring/**` — **NO `docs/**`, NO `*.md`** (CLAUDE.md's list is stale) | **CORRECTION C3:** the CH4 `docs/RUNBOOK-…` commit **WILL** trigger a deploy (no-op rebuild + ~10 s restart). Resolution: **bundle the runbook in the CH4 code/crontab commit** → one deploy; OR accept the restart. `ops/monitoring/**` (the gate script) IS ignored ✓. |
| P9 | algovault-monitoring 7 consumers → "8th" | system-map already shows `consumer #8`; status.md:436 "8th send_telegram"; parallel `OPS-BINANCE-RATELIMITER-W1` (11:00) may have added one | **CORRECTION C4:** CH4 **live-counts** the consumer ordinal at write time (do NOT hardcode "8th"). |
| — | ops/ dir in deploy checkout | ✓ `/opt/crypto-quant-signal-mcp/ops` exists | OK |

## Identifier diff (R-section vs AC-section vs live) — CONSISTENT
- Flags `--concurrency`, `--status promoted`, `--top` — same across CH1 R1.1 / CH3 R3.2 / CH4 R4.1. New helpers `runVenueSeed`, `runVenuesWithConcurrency`, `rotateVenues` — same R↔AC. Summary contract `[seed-orchestrator] tf=…` — same producer (R1.6) ↔ consumers (CH3/CH4 grep, gate). Paths `ops/cron/seed-orchestrator-crontab.sh`, `ops/monitoring/seed-orchestrator-gate-48h.sh`, `docs/RUNBOOK-SEED-ORCHESTRATOR.md`, `src/scripts/monitor-seed-freshness.ts`, `/var/log/seed-orch-<TF>.log`, markers `# BEGIN/END OPS-SEED-ORCHESTRATOR-W1` — consistent. Containers live-verified. **Only drift = the psql user (C1).**

## System-map edge enumeration (Map Anchor)
- §2/§1 host crontab → `seed-signals.js` producer edge: **CHANGED** at CH3/CH4 (45 per-exchange → 9 per-TF). §3 algovault-monitoring: **+1 consumer** (gate script; ordinal live-counted per C4). monitor→DB / monitor→TG: no new edge. MCP tools / API / schema / publish: **NONE**. Update system-map.md same-commit in CH4 (`updated: Y`).

## Connection-budget invariant (live-measured)
Baseline now **13/100** (post parallel-deploy recreate). Post-migration absolute worst (all fire): server 12 + 9 orch×2 + 9 shadow×2 + 3m 2 + backfill 2 + equities ~3 ≈ **55**; typical <30 (stagger). Ramp 6→17 venues: **+0** (venues join existing per-TF processes). ✓ ≪ `max_connections=100`.

## Parallel-session activity (Build Rule 3 — entries since 08:49 UTC)
- **`OPS-BINANCE-RATELIMITER-W1` (11:00 UTC, ✅ GREEN)** — cross-process Binance weight budget + 418 handling. **This FIXES the cross-asset-grid 418/slow-grid TG spam flagged last turn.** The orchestrator's bounded concurrency now COMPOSES with their venue budgets (no conflict — orchestrator invokes the same seeder, which calls the budgets).
- `DEV-CITATION-SURFACES-W1 R4` (11:20 — docs/PRs, disjoint).
- Containers Up ~1 min (active deploys). → **Rebase the worktree onto latest origin/main** (includes their Binance budget); D1 firewall preserves shadow/3m/backfill/equities/monitor cron lines byte-identically (diff-proven in CH3/CH4 gates).

## Cron safe-window (re-probe live before EACH CH3/CH4 apply, per Build Rule 4)
Long-TF boundaries to avoid: 8h `40,42,44,46,48 0,8,16`; 12h `50,52,54,56,58 0,12`; 1d `… 0`. Pick a window ≥4 h clear.

## Plan-Mode verdict
✅ **GREEN — proceed to CH1 on architect approval.** 0 fictional primitives (no HALT); 4 inline corrections (C1 psql user, C2 count regex, C3 docs-not-paths-ignored, C4 consumer ordinal live-count) + 2 resolved notes (N5 logrotate covered, N6 worktree baseline). The wave's generator (per-venue×TF process explosion) and all dependencies are real and verified.
