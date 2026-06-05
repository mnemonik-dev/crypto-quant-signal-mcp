# OPS-BINANCE-RATELIMITER-W1 — endpoint-truth + root-cause (systematic-debugging)

- **Probed:** 2026-06-05, live (Hetzner container logs + code @ `7477486`).
- **Trigger:** Telegram spam — "Cross-asset grid slow-grid circuit breaker TRIPPED. Last 3 refreshes: 53.7s, 59.5s, 119.7s …" repeating every few minutes.
- **Verdict:** root cause CONFIRMED (live logs), durable generator fix shipped. **NOT the HL weight budget** (the ~58s ≈ HL window-roll was a red herring).

## Root cause (Phase 1 — confirmed by `docker logs`)

Live cell-skip logs: `[cross-asset-grid] cell skipped: BNB/15m: Binance API 418: I'm a teapot` (×many). So:

1. **Grid scores via Binance, not HL.** `cross-asset-grid.ts:202` calls `getTradeSignal({coin,timeframe,internal:true})` with **no `exchange`** → `get-trade-call.ts:116` `const exchange = input.exchange || 'BINANCE'` → defaults to Binance. The `GridCell.exchange:'HL'` label + the "scores via HL" comment were stale/wrong.
2. **418 mishandled.** `binance.ts:binGet` caught only `429`; **HTTP 418 (IP-ban) fell through to a generic `Error` (line 219) and was RETRIED** (line 224) → slow cells. And because it wasn't `UpstreamRateLimitError`, the grid's `rateLimitFailures++` backoff (counts only that type) **never tripped** → the 50s warmer kept hammering → ban persisted/escalated.
3. **Slow refreshes** (418 + retry + timeout across 42 cells @ concurrency 6 ≈ 58-119s) trip the **slow-grid breaker** (`>30s`), whose `sendAlert` had **no cooldown** → spam (amplified by repeated container restarts from the day's deploys, each resetting module state).
4. **Why now:** the 12-venue shadow ramp (parallel `OPS-SHADOW-PIPELINE-W1 V2`) pushed AGGREGATE cross-process Binance load (default-exchange `get_trade_call` + the grid warmer + Binance seed crons, all one Hetzner IP) past Binance's **2400 weight/min IP limit** → 418. That session tuned **shadow** venues only ("Promoted values unchanged") — Binance (promoted) had **no cross-process budget**. That gap is **consumer #2 of `upstream-weight-budget.ts`** (the planned evolution per the W2 WIS).

## Fix (commit — TDD, 5 new tests; full suite +0 new failures)

- **`upstream-weight-budget.ts`**: NEW `binanceWeightBudget` singleton (consumer #2; CEILING 2000 / RESERVE 800, 400 under the 2400 IP limit; VITEST-isolated like HL).
- **`binance.ts`**: `weightForBinance(path,params)` mapper (verified vs fapi docs: all-symbol `ticker/24hr`=40, `premiumIndex` all=10, `klines` 1-10 by limit, single-symbol=1, default 5). `binGet` now `acquire()`s before every fetch (interactive throws over ceiling; batch waits→SKIP). **418 AND 429 → `UpstreamRateLimitError('Binance')` thrown IMMEDIATELY (no retry)** — stops re-hammering the ban + gives the grid backoff the signal it needs. `binGet` is the SOLE Binance chokepoint (one `fetch`).
- **`cross-asset-grid.ts`**: slow-grid `sendAlert` now cooldown-gated (≤1/hr per process) — defense-in-depth; the budget + 418→fast-throw remove the slow refreshes that trip it. Stale "scores via HL" comment corrected.

Effect: aggregate Binance load capped <2400 → no 418; if a 418 still occurs it's typed → grid backoff pauses the warmer (self-heal) + adapter fast-fails (no slow retry) → slow-grid breaker stops tripping → alert spam ends. Binance seeds (batch via `runAsBatch`) throttle gracefully; grid + live `get_trade_call` (interactive) get the 800 reserve.

## Flagged (NOT fixed here — needs own sign-off)

**Grid scoring-vs-label discrepancy**: cells score via **Binance** (default) but are LABELED `exchange:'HL'` in the PUBLIC `closest_tradeable`/`try_next` response (asserted in `get-trade-signal-envelope.test.ts`, `trade-call-also-see.test.ts`, `leaderboard-cell-trim.test.ts`). Changing the label is a public-shape change; pinning scoring to HL would overload the HL budget (42 cells/50s ≈ 1100 wt/min). → **`OPS-GRID-EXCHANGE-TRUTH-W1`** to resolve direction with the owner. The Binance budget makes the current (Binance-scored) behavior safe in the meantime.
