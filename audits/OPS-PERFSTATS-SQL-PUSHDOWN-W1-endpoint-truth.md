# OPS-PERFSTATS-SQL-PUSHDOWN-W1 — endpoint-truth (Plan-Mode)

**Probed:** 2026-06-07 (live: canonical clone `~/code/crypto-quant-signal-mcp` @ `aec4175` = origin/main, behind 0; prod PG @ 204.168.185.24). **Verdict: 0 fictional primitives.** All anchors exist; the spec's count literals drifted (table grew) but the design is row-count-agnostic. Two architect-decision rows (D1 key-order, D2 recentSignals tie-order). **Do NOT start CH1 until the architect ratifies D1+D2 + the drift corrections below.**

---

## Step 0 — quiescence / clean baseline

| Probe | Result |
|---|---|
| canonical clone branch / sync | `main`, HEAD `aec4175` = origin/main, behind 0 (fetch OK) |
| `git status -s` re `performance-db.ts` | CLEAN — only 5 stale untracked `audits/*.md` (NPM-PUBLISH / chatgpt-submission); **performance-db.ts not dirty** |
| active session on `performance-db.ts`? | NO — last edits were OPS-RATELIMIT-CALLER-ATTRIBUTION / OPS-HL-BACKFILL-BATCH (both shipped, `aec4175` is later). File is "historically hot" but currently quiescent. |
| `PERF_STATS_SQL_PUSHDOWN` in repo/.github/deploy | **ABSENT** (new flag ✓) |
| **CH1 edits will run in a fresh worktree** (`ops/perfstats-sql-pushdown-w1`) per worktree-LAW; this audit committed in CH1. |

## Anchor probe (all confirmed; grep, not line numbers)

| Anchor | Reality (`src/lib/performance-db.ts`, 2240 lines) |
|---|---|
| `getPerformanceStatsAsync` | L1725 — `getPerfStatsBucket()` 5-min bucket; cache (L1729) `PERF_STATS_TTL_MS`; inflight stampede guard (L1736); cache-miss body L1739-1751: `top20 = getTop20ByOI().catch(()=>null)` → `loadSignalsForStats()` → `computeStats(all, top20)` → cache set + `[perf-stats] cache miss … rows=… elapsedMs=…` debug. **Both wrappers kept; only the cache-miss body branches for PG.** |
| `computeStats(all, top20ByOI)` L1796 | the oracle. **No confidence filter** (enforced at write). `nonHold = signal!=='HOLD'`. Full predicate table below. |
| `STATS_COL_PROJECTION` L1672 | `id, coin, signal, timeframe, confidence, created_at, pfe_return_pct, exchange` ✓ (confidence projected, never read). |
| `loadSignalsForStats` L1691 | `SELECT <proj> FROM signals ORDER BY created_at DESC` — NO time-window ✓ (full-table; Merkle-total parity). |
| `classifyAsset` + `getTop20ByOI` | L9 imported from `asset-tiers.js`; `TIER_DEFINITIONS` too. Stays JS. `rollupStats` takes `top20` exactly as computeStats. |
| `getPerformanceStats` (sync) L1703 | SQLite path; **frozen** (leave entirely as-is). |
| `outcome_return_pct` | schema L288/302, backfill UPDATEs L912/1560+, interface L1550 — **never in STATS_COL_PROJECTION, never read by computeStats.** Pushdown selects only `pfe_return_pct`. PII grep-assert in new code. |
| `formatPublicRecentSignal` L1993+ | pure allow-list formatter; computeStats calls it at L1981 on `all.slice(0,20)` with `{id,coin,timeframe,tier:classifyAsset(...),created_at,exchange}`. Reused verbatim by rollup. |
| backend / FILTER | **PG 16.13** (FILTER = 9.4+, fine). SQLite path untouched (pushdown is PG-only). |

## Live PG probe (`-U algovault -d signal_performance` — Path α, NEVER `-U postgres`)

| Metric | Live | Spec claim | Note |
|---|---|---|---|
| total rows | **167,434** | ~152k | table grew; O(rows) design unaffected |
| eval (`pfe_return_pct IS NOT NULL`) | **165,991** | — | live oracle eval count |
| win (`(BUY∧pfe>0)∨(SELL∧pfe<0)`) | **152,073** | — | overall WR ≈ 91.6% |
| pfe==0 rows | **13,918** | — | **= eval − win exactly** → PFE has no "losses" (peak-favorable ≥0 by def); strict `>0`/`<0` correctly excludes pfe==0 from wins. **Fixture MUST include pfe==0 BUY+SELL.** |
| grouped rows `(exchange,coin,tf,signal)` | **14,788** | "few thousand" | ~15k — an 11× collapse (Node never sees 167k). Drift D-a. |
| distinct coins | **804** | ~760 | classifyAsset runs 804× in rollup (cheap). |
| HOLD rows | **0** | "HOLD ARE in the table" | **FALSE** — recordSignal filters HOLD. Drift D-b. Rollup MUST still emit the fixed BUY/SELL/HOLD keys (computeStats iterates the literal list → always emits HOLD={count:0,eval:0,WR:null}). Hand-fixture covers HOLD path. |
| `EXPLAIN ANALYZE` grouped query | **136.2 ms** (Seq Scan 167k → group 14.8k; 3.2ms plan) | "→ ms" | validates ~6s→sub-second. No index needed. |

## The rollupStats contract — EXACT computeStats predicates (the byte-equivalence spec)

Grouped row = `{exchange, coin, timeframe, signal, cnt, pfe_eval, pfe_win}` where `pfe_eval = count FILTER(pfe IS NOT NULL)`, `pfe_win = count FILTER(pfe IS NOT NULL ∧ ((BUY∧pfe>0)∨(SELL∧pfe<0)))`. **The critical subtlety: "count" means different sums per aggregate** —

| Output field | `count` = | `evaluated` = | `pfeWinRate` = | nonHold? incl HOLD? |
|---|---|---|---|---|
| `totalCalls` (top-level) | Σcnt **ALL** (incl HOLD) | — | — | ALL |
| `overall.totalCalls` | Σcnt nonHold | — | — | nonHold |
| `overall.totalEvaluated` / `pfeWinRate` | — | Σpfe_eval nonHold | Σpfe_win/Σpfe_eval nonHold | nonHold |
| `byCallType.BUY/SELL` | **Σpfe_eval** (count==eval!) | Σpfe_eval | Σpfe_win/Σpfe_eval | per type |
| `byCallType.HOLD` | Σcnt HOLD | 0 | **null** | HOLD |
| `byTimeframe.<tf>` | **Σpfe_eval** (count==eval!) | Σpfe_eval | Σpfe_win/Σpfe_eval | nonHold, that tf |
| `byAsset.<coin>` | Σcnt **ALL** (incl HOLD) | — (no eval field) | Σpfe_win/Σpfe_eval nonHold | count=ALL, WR=nonHold |
| `byTier.tier<N>` | Σcnt nonHold (coin∈tier) | Σpfe_eval | Σpfe_win/Σpfe_eval | nonHold; `assets`=sorted distinct nonHold coins∈tier |
| `byExchange.<ex>` | Σcnt nonHold | Σpfe_eval | … | nonHold |
| `byExchange.<ex>.byTimeframe` | **Σpfe_eval** | Σpfe_eval | … | nonHold |
| `byExchange.<ex>.byTier` | Σcnt nonHold (coin∈tier) | Σpfe_eval | … | nonHold (NO `assets`) |
| `byExchange.<ex>.byCallType` | BUY/SELL Σpfe_eval; HOLD Σcnt | Σpfe_eval | HOLD null | per type |
| `byExchange.<ex>.byAsset` | Σcnt ALL (incl HOLD) | — | Σpfe_win/Σpfe_eval nonHold | count=ALL |

Other invariants: `period.from = MIN(created_at)`, `period.to = MAX(created_at)` → `new Date(s*1000).toISOString().split('T')[0]` (YYYY-MM-DD). `classifyAsset(coin, top20)` at coin level (804×). `exchange||'HL'` fallback. `methodology` = static `METHODOLOGY`. Tier key `tier${N}`. `pfe ?? 0` then strict `>0`/`<0` (pfe==0 ⇒ not a win — matches SQL FILTER). Order: byCallType `[BUY,SELL,HOLD]`, byTimeframe `TF_ORDER`, byTier `TIER_DEFINITIONS` (all deterministic, reproducible); byAsset/byExchange first-seen (see D1).

## D1 — key-order resolution (ARCHITECT DECISION)

`byAsset` / `byExchange` (+ nested `byAsset`) key order in computeStats = first-seen in the `created_at DESC` scan = effectively coins by `MAX(created_at) DESC` **with non-deterministic tie order** (created_at is unix SECONDS, no id tiebreak in `loadSignalsForStats` → ties resolve by PG physical order, NOT reproducible from aggregates). **So raw `JSON.stringify` equality is neither achievable NOR currently guaranteed even between two computeStats runs.**

**Consumer audit (does any consumer depend on key ORDER?):**
- `monitor-pfe.ts evaluatePfeWinRate` → reads scalar `overall.pfeWinRate` — order-independent ✓
- `src/index.ts:1500/1521` `Object.entries(byTimeframe/byExchange).filter(…)` — byTimeframe is TF_ORDER (reproduced); byExchange re-emitted filtered, but landing hydrates `byExchange.<EX>` **by key** (index.ts:2799) — order cosmetic ✓
- `agent-forum-post.ts` iterates byTimeframe (TF-sorted) + byAsset — **cosmetic** display in a generated post ✓
- `seed-signals.ts:350` `Object.entries(byAsset).sort(…)` — **sorts itself** ✓
- `capabilities.ts:92` `Object.keys(byAsset).length` — count only ✓
- `website-drift-canary.py` (host) — checks values by key per manifest ✓

→ **No consumer depends on byAsset/byExchange key ORDER.**

**RECOMMENDED RESOLUTION:** byte-equivalence gate = **deep VALUE equality with recursive canonical key-sorting** (both computeStats + rollupStats outputs canonicalized before compare). To minimize public-response churn, **add `max(created_at) AS max_ca, max(id) AS max_id` to the grouped query** so rollup can order byAsset/byExchange by `MAX(created_at) DESC, MAX(id) DESC` — the closest *deterministic* reproduction of computeStats's intent (and strictly better than today's tie-nondeterminism). R3.2 public-shape gate compares **canonically** (values + key-sets identical; residual order tolerated, already non-deterministic). Alternative if architect wants raw-stringify: also `, id DESC` tiebreak `loadSignalsForStats` (one-time published-order shift, values unchanged — Data-Integrity two-commit).

## D2 — recentSignals[] tie-order (ARCHITECT DECISION — NEW, spec's D1 only covered object keys)

`recentSignals = all.slice(0,20)` (newest 20 by `created_at DESC`, **no id tiebreak**) → ARRAY order, tie-nondeterministic at the 20-row boundary. CH2's separate `LIMIT 20 ORDER BY created_at DESC` fetch is a DIFFERENT query/plan (top-N heapsort) → may return a different tie order than `loadSignalsForStats`'s full-sort slice → recentSignals[] could byte-mismatch at a tie boundary (rare — ~few signals/min, but not never). **RECOMMENDED:** CH2 recentSignals fetch uses `ORDER BY created_at DESC, id DESC LIMIT 20` (deterministic); the equivalence gate compares recentSignals by the **set of formatted records keyed by id** (order-tolerant) since the oracle's own boundary order is non-deterministic. (Same root cause as D1; cheap to accept.) rollupStats takes the 20 raw rows as a param + formats via the shared `formatPublicRecentSignal` (row-free pure fn preserved).

## Identifier diff (R vs AC) — all consistent

| Identifier | Value | OK |
|---|---|---|
| flag | `PERF_STATS_SQL_PUSHDOWN` (env, default false, default-deny on malformed) | ✓ absent today |
| fns | `aggregateSignalsSql`, `rollupStats`, `aggregateRowsInJs` (CH1 in-JS analogue) | ✓ |
| container / db / auth | `crypto-quant-signal-mcp-{mcp-server,postgres}-1` · `signal_performance` · `-U algovault` | ✓ |
| fixture / snapshot | `audits/perfstats-fixture-2026-06-07.json`, `audits/api-performance-public-shape-snapshot-2026-06-07.json`, `audits/perfstats-equivalence-probe.js` | ✓ |
| oracle (frozen) | `computeStats`, `getPerformanceStats` (sync) | ✓ never edited |

## Map Anchor / deploy

- `system-map.md updated: n-a` — internal compute-path change; `/api/performance-public` shape+values byte-equivalent; no edge/column/tool change. Last-touched row at close-out.
- **deploy.yml paths-ignore (LIVE, corrects CLAUDE.md):** ignored = `activation-funnel/snapshots/**`, `activation-funnel/README.md`, `ops/systemd/**`, `ops/monitoring/**`. **NOT ignored:** `docs/**`, `audits/**`, `*.md`, `ops/cron/**` → CH2 (audits probe) + CH3 (docs/RUNBOOK) commits **DO redeploy**. R3.4 acceptable: bundle the CH3 RUNBOOK commit with the R3.1 flag-flip (which restarts via `docker compose up -d` anyway). (Broader fix = `OPS-DEPLOY-PATHS-IGNORE-W1`, out of scope.)

## Per-chapter readiness

- **CH1** (pure rollup + oracle, ships dark): ready. Capture `audits/perfstats-fixture-2026-06-07.json` (full 167k projected cols OR ≥50k slice covering every ex/tf/coin-tier + pfe==0 BUY/SELL + null-pfe + single-exchange; HOLD via hand-fixture since live=0) + golden `computeStats` output. Predicate table above is the rollup spec. recentSignals via D2.
- **CH2** (SQL path dark, flag default OFF, live e2e): ready. Query per R2.1 **+ `max(created_at), max(id)` per group (D1)**; recentSignals `LIMIT 20 … , id DESC` (D2); period query `min/max/count`. No `outcome_*`, no time-window, no confidence filter. FILTER PG-only → SQL-shape test PG-gated; rollup covered by CH1 (dual-backend rule).
- **CH3** (flip + verify + close-out): ready. `docker compose up -d` (env_file reload); canonical-compare `/api/performance-public` pre/post; record `[perf-stats]` elapsedMs before/after; RUNBOOK; status.md + system-map n-a note + WIS.
