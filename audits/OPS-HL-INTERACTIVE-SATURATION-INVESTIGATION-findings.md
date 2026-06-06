# OPS-HL-INTERACTIVE-SATURATION-INVESTIGATION — findings

**Date:** 2026-06-06 · **Type:** read-only diagnosis + recommendation (NO code shipped) · surfaced by OPS-RATELIMIT-TELEMETRY-DIGEST-W1's first live read.

## TL;DR

HL REST is saturated at **~2–3× its 1200 wt/min hard limit**, BOTH lanes (interactive + batch). The dominant cause is a **cache-stampede on a throttled resource**: `getTop20ByOI()` — called by **every** `getTradeSignal` (get-trade-call.ts:150) — only caches on SUCCESS, so once HL is throttled the cache never fills and every call (the grid's 42 internal scorers/50s + the rest) **re-attempts the HL fetch**, each attempt throwing on the saturated budget → a self-sustaining throw storm. A secondary contributor is a **process-boundary cache leak** (the `module-level-warmer-process-boundary-gate` skill from sibling OPS-GRID-PROCESS-BOUNDARY-W1): the same HL caches are **ungated**, so every short-lived seed-cron process cold-fills them — redundant HL batch load. **Budget-tune cannot fix this** (1150 is already 50 under HL's 1200 hard cap; demand is 2–3× over).

## Evidence (read-only)

| Probe | Result |
|---|---|
| HL interactive throws (durable, 70 min) | **5,375** (~76/min, sustained); ledger pinned `used 1147/1150`, `interactiveUsed 461 + throws 109`/min |
| HL batch lane | **1,827 waits + 86 skips** (seeds contending) — only HL + OKX(8) appear; HL is the sole saturated venue |
| Per-second throw distribution (1 min) | **bursty** — all in 3 clusters (s24:59, s33:26, s47:26) → machine-driven, not spread user traffic |
| request_log tool volume (20 min) | **1.0 get_trade_call/min** (internal) vs **126 HL throws/min** → NOT tool-layer-driven; direct `hlInfoPost` |
| seed-3m-standard.log (active, 279K lines) | HL lines are **`batch_wait`/`batch_skip`** (276+21 / 3000) → the seeds' HL calls are correctly BATCH (the 1827 waits) |
| `getTop20ByOI` callsite | get-trade-call.ts:150 `await getTop20ByOI()` — runs for **every** getTradeSignal (incl. the grid's 42 internal/50s) |
| `getTop20ByOI` cache logic | asset-tiers.ts:144-166 — sets cache ONLY on success (L156); on HL-fetch failure returns stale/FALLBACK but **does NOT set the cache** → next call re-attempts |
| process-boundary gate on HL caches | `grep -c isShortLivedScript` = **0** in asset-tiers.ts / oi-ranking.ts / exchange-universe.ts (the grid WAS gated by OPS-GRID-PROCESS-BOUNDARY-W1) |
| ruled out | grid scoring (BINANCE, confirmed HL-free in cross-asset-grid.ts), scan_funding_arb (predicted-fundings TTL-cached), isMemeCoinLiquid (per-exchange), funding-cache (DB read), seeds-as-interactive (they're batch) |

## Root cause (two coupled mechanisms)

1. **Cache-stampede / no negative-caching (PRIMARY amplifier of the interactive throws).** `getTop20ByOI()` is on the hot path of every `getTradeSignal`. It caches the HL top-20 for 1h **on success only**. When the HL budget is saturated, the HL fetch throws (`UpstreamRateLimitError`) → the catch returns `FALLBACK_TOP20` but leaves `cachedTop20` unset → the **next** getTradeSignal re-enters the fetch → throws again. The server's grid warmer issues 42 internal `getTradeSignal`/50s, so this is ≥42 HL-fetch-attempts/50s that can never succeed while saturated → each is an interactive throw → keeps HL saturated → the cache never fills → self-sustaining. (Once an attempt *does* succeed, it caches 1h and the storm pauses — explaining the bursty-but-sustained shape.)

2. **Process-boundary cache leak (SECONDARY, the batch side).** `getTop20ByOI` / `getXyzSymbolSet` (oi-ranking) and the `isMemeCoinLiquid`→`exchange-universe` HL fetch are **not** `isShortLivedScript`-gated. Every short-lived seed-cron process (the 3m all-17-venue seed + every other TF line) cold-fills these HL caches → redundant HL batch fetches the long-lived server already had cached. This is the exact leak `OPS-GRID-PROCESS-BOUNDARY-W1` fixed for the grid; the skill explicitly says **"audit OTHER warmers"** — these are the un-audited ones. It piles batch load onto HL, helping keep the shared budget saturated (the trigger for mechanism 1).

**Why not budget-tune:** ceiling 1150 is 50 under HL's 1200/min hard limit. Demand is ~2–3× over. There is no headroom.

## Recommendations (priority order)

1. **`OPS-HL-TOP20-NEGATIVE-CACHE-W1` (smallest, highest impact — breaks the stampede).** In `getTop20ByOI`'s catch, SET the cache to the served value with a SHORT negative-TTL (e.g. `cachedTop20 = { coins: FALLBACK_TOP20 (or stale), fetchedAt: Date.now() - (CACHE_TTL_MS - 60_000) }`, or a dedicated `negativeUntil`), so a throttled fetch is NOT retried on the very next call. SAFE: it already returns FALLBACK on failure today — this only stops the per-call RETRY (the classification degradation is identical, the retry storm is gone). Apply the same negative-cache to `getXyzSymbolSet` if it has the same shape. Plan-Mode (hot path).
2. **`OPS-HL-CACHE-PROCESS-BOUNDARY-W1` (the codified skill).** Apply the existing `isShortLivedScript(process.argv[1])` predicate (performance-db.ts:63, the one the grid fix used + the `module-level-warmer-process-boundary-gate` skill) to `getTop20ByOI` / `getXyzSymbolSet` / exchange-universe `fetchHL`: short-lived seed crons serve cache-or-FALLBACK, never trigger an HL refresh. **Prove-the-skip-is-safe first** (skill caveat): the seed READS the top-20 for tier classification (not response-only like the grid's `also_see`), so verify `FALLBACK_TOP20` is acceptable for seed classification — if not, give the crons a bulk-warmed/persistent HL top-20 (the `background-warmer-for-expensive-cache-miss` complement) rather than gating to empty.
3. **`OPS-RATELIMIT-CALLER-ATTRIBUTION-W1` (make the telemetry self-pin).** Extend `rate_limit_events` + `recordRateLimitEvent` with a `caller`/`source` tag so the next read names the exact server-side interactive driver definitively (closes the one residual gap in this investigation — the server-side interactive HL caller couldn't be pinned 100% statically). Generator move: the telemetry should identify its own sources.
4. **`OPS-HL-WEBSOCKET-W{NEXT}` (structural endgame).** HL's websocket feed (allMids / activeAssetCtx / etc.) has NO REST weight budget — migrating the hot HL reads removes the bottleneck for both lanes. The digest trigger's recommendation; warranted if demand persists after 1+2.
5. **NOT re-tune the budget** (no headroom). **Interim: NOT an emergency** — the budget + HL→Binance fallback is preventing an HL IP-ban; the cost is HL-requested interactive signals frequently served by Binance (a provenance degradation, ironically just after OPS-GRID-EXCHANGE-TRUTH-W1 fixed the grid's provenance label). Document as a known degraded state until 1/2/4 land. Digest's 25-interactive-throws/wk threshold will correctly fire weekly until addressed.
