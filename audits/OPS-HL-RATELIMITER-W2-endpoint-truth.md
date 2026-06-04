# OPS-HL-RATELIMITER-W2 — endpoint-truth (Plan-Mode probe)

- **Wave:** OPS-HL-RATELIMITER-W2 — cross-process HL weight budget (deferred generator fix from OPS-HL-RATELIMIT-W1)
- **Probed:** 2026-06-04, on live state (code repo `crypto-quant-signal-mcp` @ `8b8b669` / v1.20.0; Hetzner `204.168.185.24` container `crypto-quant-signal-mcp-mcp-server-1`; HL official docs; npm).
- **Risk markers present:** cross-host orchestration (SSH crontab edit), identifier cited >1 place (ledger path, weight constants, cron args). Plan-Mode mandatory — **this file produced BEFORE C1; awaiting architect approval.**
- **Verdict:** **NOT a HALT.** 0 fictional primitives — every spec primitive physically exists and behaves as probed. The spec is unusually accurate. BUT three architect decisions are required before C1 because live reality is materially richer than the spec assumed in two places (R2 generator scope, R4 cron scope) plus one calibration risk (AC3). See **§9 Open Decisions**.

---

## §0 — system-map edge enumeration (HL REST producer → consumers)

**Producer:** Hyperliquid REST `POST https://api.hyperliquid.xyz/info` (1200 weight/min **per IP**; Hetzner = one IP).

**Consumers (all run INSIDE container `crypto-quant-signal-mcp-mcp-server-1` → share one IP AND one `/tmp`):**

| # | Consumer | Path to HL | Class | Route |
|---|----------|-----------|-------|-------|
| 1 | MCP tool handlers (`get_trade_call`, `get_trade_signal`, `get_market_regime`, `scan_funding_arb`, `scan_trade_calls`) | `getCandles`/`getAssetContext`/`getPredictedFundings`/`getFundingHistory` | interactive | **via `hlPost`** ✅ |
| 2 | `seed-signals.ts` per-coin loop (10 HL cron lines) | `getAssetContext` + `getCandles` | batch | **via `hlPost`** ✅ |
| 3 | `backfill-outcomes.ts` cron (every 3 min) | `getCandles` | batch | **via `hlPost`** ✅ |
| 4 | in-server `runBackfill()` setInterval (every 5 min, `index.ts:2217-2218`) | `getCandles` | batch | **via `hlPost`** ✅ |
| 5 | `seed-signals.ts::fetchHLCoins` (universe discovery, all `--top`/full HL fires) | `fetch()` std+xyz `metaAndAssetCtxs` | batch | **DIRECT — bypasses `hlPost`** ❌ |
| 6 | `lib/oi-ranking.ts` (`getTopAssetsByOI`/`getXyzAssetsByOI`, imported `index.ts:177`) | direct `fetch()` `metaAndAssetCtxs` | interactive | **DIRECT — bypasses `hlPost`** ❌ |
| 7 | `lib/exchange-universe.ts::getExchangeTopAssetsWithVolume` (scan_trade_calls + asset-tiers) | `fetchWithTimeout()` `metaAndAssetCtxs` | interactive | **DIRECT — bypasses `hlPost`** ❌ |
| 8 | `scripts/monitor.ts:310` HL health ping (cron `*/2`) | direct `fetch()` | (n/a — monitor) | **DIRECT — bypasses `hlPost`** ❌ |

**Non-consumer (resolved spec open-question):** TG bot `algovault_bot` (`/opt/algovault-bot`, python). `grep -r hyperliquid /opt/algovault-bot` = **0 hits**. It reads Postgres `signal_performance` directly (`asyncpg`/`psycopg`) and calls the MCP `/mcp get_trade_call` endpoint. **It never calls HL directly** → already covered (its HL traffic flows through consumer #1, interactive). No coverage gap.

**New edge for `system-map.md` (AC6):** `HL REST producer edge: internal weight-budget throttling added (WeightBudget ledger at /tmp); host cron HL seed lines timing-only (if R4 runs).`

---

## §1 — Primitive truth table (claim | reality | resolution)

| Spec claim | Probe | Reality | Resolution |
|---|---|---|---|
| `hlPost(` = single chokepoint every HL **adapter** method routes through | `grep hlPost src/lib/adapters/hyperliquid.ts` | TRUE for adapter (getCandles L125, getMeta…Coalesced L55, getPredictedFundings L169, getFundingHistory L193). FALSE for repo as a whole — 4 direct fetchers bypass it (§0 #5-8). | **Q1 (architect).** Literal R2 leaves #5-8 unbudgeted. |
| `getMetaAndAssetCtxsCoalesced` exists; acquire once per real fetch | `grep`, read L43-67 | EXISTS. Cache/inflight returns (L47/L51) never call `hlPost`; only the real fetch (L55) does. | ✅ Putting `acquire` inside `hlPost` ⇒ coalesced meta pays exactly once per real fetch, **for free**. No special-casing needed. |
| `META_TTL_MS` | L34 | `= 60_000` ✅ | confirmed |
| `DELAY_PER_EXCHANGE` HL: 750 | `seed-signals.ts:58` | EXISTS as `Record<ExchangeId, number>` (HL value present; used L735/L852) | ✅ confirmed |
| `UpstreamRateLimitError('Hyperliquid', seconds)` typed throw | read `errors.ts:23-38` | ctor `(exchange: string, retryAfterSeconds: number\|null=null)`; props `.code='UPSTREAM_RATE_LIMIT'`, `.exchange`, `.retryAfterSeconds` | ✅ R1 interactive-throw signature matches exactly; R5 test asserts `.retryAfterSeconds` |
| `toolErrorContent` emits `{error_code, exchange, retry_after_seconds, suggestion}` | read `index.ts:123-137` | EXACT: `retry_after_seconds: err.retryAfterSeconds`, `suggestion` from `EXCHANGE_FALLBACKS` | ✅ interactive-throw with `secondsToWindowRoll` populates `retry_after_seconds` → 429-fallback contract preserved |
| `EXCHANGE_FALLBACKS` keyed by exchange | `errors.ts:186-192` | `Hyperliquid: ['BINANCE','BYBIT','OKX','BITGET']` ✅ adapter throws `'Hyperliquid'` | ✅ key matches |
| `npm test` = `vitest run` | `package.json:25` | `"test": "vitest run"` ✅ | ✅ confirmed |
| `AsyncLocalStorage` (Node ≥18 stable, no new dep) | `grep async_hooks`; container `node --version` | Node **v20.20.2** in container; ALS already used in `license.ts:38`, `cross-asset-grid.ts:167` | ✅ stable, established pattern, zero new dep |
| `proper-lockfile@4.1.2` sanctioned fallback exists on npm | `npm view proper-lockfile@4.1.2 version` | `4.1.2` ✅ | ✅ available if `O_EXCL` flaky |
| All HL processes share one container (ledger viability) | live `crontab -l` + `docker ps` | **ALL seed/backfill crons** = `docker exec crypto-quant-signal-mcp-mcp-server-1 node …`. MCP server = PID 1 same container. | ✅✅ **load-bearing assumption TRUE** — `docker exec` shares mount ns ⇒ `/tmp` identical across all node processes |
| `/tmp` ledger writable by service user | `docker exec … id; touch /tmp/.probe` | uid=1000(node); `/tmp` = `drwxrwxrwt`; `TMP_WRITABLE`; no existing ledger (greenfield) | ✅ confirmed; new module writes absolute `/tmp/...` (no `__dirname` issue) |
| HL budget = 1200 weight/min/IP | WebFetch HL docs 2026-06-04 | "REST requests share an aggregated weight limit of **1200 per minute**" | ✅ verified primary source |
| `weightFor` table (20 base; candle +1/60; funding +1/20; l2Book-class=2) | WebFetch HL docs | EXACT match to official wording (see §6) | ✅ **byte-accurate** |
| `tools/list` = 9 | `grep -c 'server.tool('` index.ts | exactly **9** (get_trade_call, get_trade_signal, scan_funding_arb, get_market_regime, get_equity_call, get_equity_regime, scan_trade_calls, search_knowledge, chat_knowledge) | ✅ AC5 frozen; this wave adds 0 tools |
| live health = 1.20.0 | `curl api.algovault.com/health` | `{"version":"1.20.0"}` ✅ | confirmed |
| build = CJS (`__dirname`, not `import.meta.url`) | `tsconfig.json` | `target ES2022 / module Node16 / moduleResolution Node16` | ✅ new module: use absolute `/tmp` paths, avoid `import.meta.url` (TS1470) |

---

## §2 — LIVE HL seed cron inventory (the R4 reality)

Spec assumed "3m line + 5m/15m/1h/4h/1d UNVERIFIED". **Reality: 10 HL seed lines.** All `docker exec …mcp-server-1 node dist/scripts/seed-signals.js …`:

| Line | Timeframe | Universe | Minute field | Fire-minutes |
|---|---|---|---|---|
| 171 | 3m | `--restricted-universe 20` | `1-58/3` | 1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 |
| 11 | 5m | `--top 50` | `1,6,…,56` | every 5 from :01 |
| 20 | 15m | `--top 100` | `2,17,32,47` | |
| 29 | 30m | `--top 100` | `5,35` | |
| 38 | 1h | **full universe** (no `--top`) | `15` | :15 hourly |
| 47 | 2h | **full universe** | `30` (h0,2,…,22) | |
| 56 | 4h | **full universe** | `10` (h0,4,8,12,16,20) | |
| 65 | 8h | **full universe** | `40` (h0,8,16) | |
| 74 | 12h | **full universe** | `50` (h0,12) | |
| 83 | 1d | **full universe** | `20` (h0) | |

**HL self-collisions (same fire-minute):**
- `3m × 5m` at minutes **{1,16,31,46}** — 4×/hour. **CRT-unavoidable** (3-min ∩ 5-min lattices always intersect; the spec already concedes this: *"3m∧5m intersect once/15min by CRT — accept, the bucket arbitrates"*). Shifting the 5m offset cannot remove it.
- `3m × 4h` at **:10** (6×/day) — avoidable (shift 4h off 3m's `≡1 mod 3` lattice).
- `3m × 8h` at **:40** (3×/day) — avoidable.
- **None fire at :00** (3m is `1-58/3`, 5m starts :01, long-TF at :10/:15/:20/:30/:40/:50). The header comment "HL at :00" (cron L3) is **stale** — :00 is now BITGET 5m. R4's "none at :00" requirement is already satisfied.

⚠️ **full-universe long-TF fires** (1h/2h/4h/8h/12h/1d, no `--top`) pull the **entire ~230-perp universe** → ≈ 230×~23 + meta ≈ **~5,300 weight per fire**. Under the batch ceiling (§3) one such fire spans ~7 min of bucket windows. (Per-coin 750 ms delay already stretches it to ~3 min wall-clock; the bucket extends it.)

---

## §3 — Recomputed load math (real inventory) — feeds AC3 risk (Q3)

Effective batch budget = `CEILING − INTERACTIVE_RESERVE = 1000 − 300 = 700 weight/min`.

Per-fire weight (meta coalesced once; candle ~22; +40 if `fetchHLCoins` budgeted):

| Line | Weight/fire | Period | ≈ weight/min (avg) |
|---|---|---|---|
| 3m ×20 | ~460 | 3m | ~153 |
| 5m ×50 | ~1,160 | 5m | ~232 |
| 15m ×100 | ~2,260 | 15m | ~151 |
| 30m ×100 | ~2,260 | 30m | ~75 |
| 1h full | ~5,300 | 60m | ~88 |
| 2h full | ~5,300 | 120m | ~44 |
| 4h/8h/12h/1d | ~5,300 | — | ~22/11/7/4 |
| backfill (cron 3m + in-server 5m) | ≤1,100/fire, HL-ready subset only | — | ~50-200 (trickle) |

**Σ batch average ≈ 790-950 weight/min vs 700/min batch ceiling.** Aggregate HL **batch** demand is the **same order as / slightly above** the batch throughput. Implication: the bucket correctly protects interactive users (total ≤1000 < 1200 ⇒ no more user-facing 429s — the wave's goal), **but it will surface chronic batch-seed throttling/lag** that the 429s previously hid. At collision boundary minutes the small 3m fire competes with a big batch fire; starved `acquire()`s hit the 65s cap → forced retry → throw → seed "errors". **AC3 ("errors ≤ 2 per 3m fire") is the gate most at risk** under peak windows. This is the genuine surfaced truth: *current HL seed load is near the full 1200 IP budget*; the bucket converts "429 storm hits users" into "seeds run slower / partially" — the right trade, but AC3 may need loosening or the load reducing. → **Q3.**

---

## §4 — Direct-fetch (bypass-`hlPost`) surface — the generator gap (Q1)

`grep -rn 'api.hyperliquid.xyz' src/` → real direct fetchers (not the adapter `BASE_URL`):

- `seed-signals.ts:361,366` — `fetchHLCoins`: std + xyz `metaAndAssetCtxs` (~40 weight/fire) on every `--top`/full HL fire. **batch** context.
- `oi-ranking.ts` (`HL_INFO_URL`, L81 xyz + std) — `getTopAssetsByOI`/`getXyzAssetsByOI`, imported by `index.ts`. **interactive** (MCP server).
- `exchange-universe.ts:49` — `getExchangeTopAssetsWithVolume`, used by `scan_trade_calls` + `asset-tiers`. **interactive**.
- `monitor.ts:310` — HL health ping, cron `*/2` (`docker exec … monitor.js --mode critical`).

All four are **in-container** → all read the same `/tmp` ledger → all are *budgetable*. The spec's R2 ("wire `hlPost`") covers only the adapter. The wave's stated GENERATOR goal — *"every HL REST caller — current and future — structurally cannot exceed the IP budget"* — is **NOT** achieved by literal R2 alone; CLAUDE.md LAW is *"fix at the generator, not the lane."* → **Q1.**

---

## §5 — Identifier diff (R-section ↔ AC-section) — required before state mutation

| Identifier | R-section | AC/R6 / elsewhere | Match? |
|---|---|---|---|
| ledger path | `/tmp/algovault-hl-weight.json` (R1) | grep token `algovault-hl-weight` (R6) | ✅ token substring matches |
| lock path | `/tmp/algovault-hl-weight.lock` (R1) | — | ✅ |
| module src | `src/lib/upstream-weight-budget.ts` (R1) | dist grep `/app/dist/lib/upstream-weight-budget.js` (R6) | ✅ tsc maps src→dist 1:1 |
| CEILING / INTERACTIVE_RESERVE | 1000 / 300 (R1) | used by R5 tests | ✅ no conflicting cite |
| HL budget | 1200 (Method) | CEILING 1000 = 200 under (R1) | ✅ consistent |
| container | `node dist/scripts/seed-signals.js` (Method, generic) | live `crypto-quant-signal-mcp-mcp-server-1` | ✅ generic resolves to live name |

**No contradictory identifiers.** Diff gate passes.

---

## §6 — `weightFor` vs official HL docs (re-verified 2026-06-04)

> "REST requests share an aggregated weight limit of **1200 per minute**." · "All other documented info requests have **weight 20**." · candleSnapshot: "additional rate limit weight **per 60 items** returned." · fundingHistory class: "additional weight **per 20 items** returned." · "weight **2**: l2Book, allMids, clearinghouseState, orderStatus, spotClearinghouseState, exchangeStatus."

Spec R2 mapper = **exact**: base 20; `candleSnapshot` 20+ceil(items/60); `fundingHistory` 20+ceil(items/20); l2Book-class → 2; unknown → 20 (never under-count). Adapter currently emits only `metaAndAssetCtxs`/`candleSnapshot`/`predictedFundings`/`fundingHistory` (+`dex:xyz`); the weight-2 list is anticipatory/future-proof.

**`weightHint` source (R2 design note, inline-resolvable):** `getCandles(coin, interval, startTime)` has no item count in the body, but item count is derivable: `expectedItems = ceil((Date.now() − startTime) / intervalMs)`. Probed call sites — `get-market-regime.ts` fetches up to 168 candles (→ weight 23), `get-trade-call.ts`/seed/backfill fetch ~100 (→ 22). Computing `weightHint` from `(startTime, interval)` inside `getCandles` self-adjusts and never under-counts. No fictional primitive.

---

## §7 — Runtime / build facts confirmed for the new module

- Container user `node` (uid 1000); `/tmp` `drwxrwxrwt` → lock + ledger writable; greenfield (no stale ledger).
- Node v20.20.2 → `AsyncLocalStorage`, `fs.openSync(...,'wx')` (`O_EXCL`) both available.
- CJS build (`module Node16`) → use absolute `/tmp/...` constants; **do not** use `import.meta.url`.
- `git -C crypto-quant-signal-mcp status -s` = clean baseline (only pre-existing untracked audit `.md` + `.x402-mainnet-bootstrap.cjs` from prior waves; no tracked-file modifications, no parallel-session staged edits). `core.hooksPath` to be set to `hooks` at C1 per AOE rule.
- Test baseline: capture fresh `npm test` count on `8b8b669` before C1 (prior status notes ~15 pre-existing failures as of GEO-MEASUREMENT-W3 2026-06-02; R5 = "zero NEW failures vs that fresh baseline").

---

## §8 — CLAUDE.md gates that bind C4 (host-side cron)

If R4 runs (any cron mutation): **48h-scheduled-gate pattern** for cron load-mutation waves; `crontab -l > /tmp/crontab.bak.ops-hl-ratelimiter-w2-<UTC>` backup; **cron safe-window probe** (`ssh … 'date -u && systemctl list-timers'` — next safe window ≥4h, defer if ≤30 min before a fire or ≤2 h after); sorted-diff proving **minute-fields-only** change; args byte-identical. Snapshot-sampler `:00`-avoidance already satisfied.

---

## §9 — OPEN DECISIONS (architect / Cowork) — copy-paste Q-block

**Plan-Mode HALT-test:** 0 fictional primitives ⇒ not a fiction-HALT. Proceeding to C1 is blocked only on these scope/calibration choices, because two are wider than the spec's stated scope and one risks an AC.

> **Q1 — R2 generator scope (the core "generator vs lane" call).**
> `hlPost` is the chokepoint for *adapter* methods only. Four in-container callers fetch HL `metaAndAssetCtxs` *directly*, bypassing `hlPost`: `seed-signals.fetchHLCoins` (batch, ~40 wt/HL-fire), `oi-ranking`, `exchange-universe` (both interactive, scan/tier paths), `monitor.ts` (cron */2). Literal R2 leaves them unbudgeted, so the wave's "every HL caller structurally cannot exceed" goal is not met.
> **Pick:** (A) **Generator-true (recommended):** extract one budgeted `hlInfoPost(body,{cls,weightHint})` primitive; route the adapter's `hlPost` AND all 4 direct fetchers through it → chokepoint claim becomes literally true. (B) **Hybrid:** wire `hlPost` per R2 + add `budget.acquire` inline at the 4 direct sites; defer consolidation. (C) **Literal R2:** wire `hlPost` only; accept ~40-80 unbudgeted wt/fire + monitor pings, document the residual.

> **Q2 — R4 cron stagger scope.**
> Live crontab has **10** HL seed lines, not the "3m (+maybe a few)" assumed. `3m × 5m` overlap at {1,16,31,46} is **CRT-unavoidable** (spec concedes the bucket arbitrates it). Avoidable HL self-collisions: `3m × 4h` @:10, `3m × 8h` @:40. None fire at :00 already.
> **Pick:** (A) **Skip R4 (recommended):** the bucket is the structural fix; lowest host blast-radius; document skip in status.md. (B) **Minimal:** shift only the 2 avoidable long-TF collisions (4h@:10, 8h@:40) off the 3m lattice; leave 3m×5m to the bucket; 48h-gate + backup + safe-window. (C) **Full:** attempt max de-collision of all 10 lines (note: 3m×5m still impossible by CRT).

> **Q3 — AC3 calibration risk (load > batch ceiling).**
> Aggregate HL *batch* demand ≈ 790-950 wt/min vs 700/min effective batch ceiling (CEILING 1000 − RESERVE 300). The bucket protects interactive users (its goal) but will surface chronic seed throttling; at collision minutes the 3m fire can starve past the 65s cap → throw → AC3 "errors ≤ 2 per fire" may trip.
> **Pick:** (A) lower `INTERACTIVE_RESERVE` (e.g. 300→150 → 850 batch; interactive HL is low-volume/bursty); (B) relax AC3 to "errors ≤ N OR ≥1 bucket batch-wait logged" (treat throttle-driven skips as success, not failure — seeds are idempotent across fires); (C) pair with seed-load reduction (`--top 100` on the 6 full-universe long-TF lines); (D) accept as-is and observe.

**Until Q1-Q3 are answered I will not start C1.** Recommended defaults if the architect says "proceed with your judgment": **Q1=A, Q2=A, Q3=B.**

---

## §10 — ARCHITECT RATIFICATIONS (approved 2026-06-04) — spec-of-record for C1

Architect (Mr.1) approved the wave with the following amendments. These OVERRIDE the original spec text where they conflict.

**Q1 → Generator-true (A).** Extract a single budgeted `hlInfoPost(body, { cls, weightHint })` primitive. Route the adapter's `hlPost` AND all 4 direct fetchers (`seed-signals.fetchHLCoins`, `oi-ranking`, `exchange-universe`, `monitor.ts`) through it. The chokepoint claim becomes literally true.

**Q2 → Minimal R4 (my recommendation, delegated).** Host-side, AFTER code green, under the 48h-gate. Shift only the 2 avoidable long-TF×3m start-collisions: **4h `:10`→`:12`**, **8h `:40`→`:42`** (both land off the 3m `1-58/3` lattice, off the 5m lattice, and off every other HL line; verified free). Keep **all 10 HL lines off `:00`** (already true). Leave 3m×5m residual to the bucket (CRT-unavoidable, conceded). Backup `crontab -l`, safe-window probe, sorted-diff = minute-fields-only, args byte-identical.

**Q3 → Relax AC3 (1).** Ratifications:

1. **AC3 rewrite — split error classes:**
   - `upstream_429` (real HTTP 429 from HL): **gate = 0** across 3 consecutive HL 3m fires. This is what the wave kills.
   - `bucket_batch_wait` / `bucket_skip`: expected, logged, **NEVER** counted as fire errors. **≥1 logged wait during a long-TF collision window = positive proof the arbiter engaged → assert it.**
   - Cadence health: 3m fire wall-clock **< 180s** for 3 consecutive fires; long-TF full-universe fires only need to complete before their OWN next fire (stretch fine — seeds idempotent).

2. **R1 AMENDMENT — batch `acquire` must NOT throw under chronic saturation.** Behavior: batch loops window-rolls up to **5 min total wait per coin**, then returns **SKIP** (seed logs the coin skipped, same semantics as `InsufficientCandles` skip; next fire retries). **Throw is interactive-only** (`UpstreamRateLimitError`). Implementation: batch-skip is a distinct internal signal — surfaced as a dedicated `WeightBudgetSkipError` (or equivalent) that batch callers (`seedExchange` per-coin loop, `backfill-outcomes`, `runBackfill`) catch → increment a **skip** counter (NOT the error counter) and `continue`. The user-facing `UpstreamRateLimitError` throw stays interactive-only.

3. **Constants unchanged: `CEILING = 1000`, `INTERACTIVE_RESERVE = 300`.** No tuning without data. Add **per-minute lane telemetry** to the structured log line: `{ batch_used, interactive_used, waits, skips, throws }`. `// TODO: revisit by 2026-06-18` with one week of telemetry.

4. **Do NOT add `--top 100` to the long-TF lines in this wave** (data-coverage change → own sign-off). Flag **`OPS-HL-SEED-LOAD-W1`** in status.md Issues, attaching: per-line wt/fire, wait p95, skip count, hour-boundary drain time.

5. **Sanity ack:** worst shared boundary (6 long-TF lines ≈ 31.8K wt) ≈ ~45 min drain at 700/min — acceptable: users stay protected by the reserve; every line completes inside its own cadence. R4 stagger spreads those boundaries; all HL lines stay off `:00`.

**Status: APPROVED → proceeding to C1.**
