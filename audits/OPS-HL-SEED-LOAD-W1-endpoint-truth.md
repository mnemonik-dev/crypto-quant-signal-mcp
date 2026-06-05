# OPS-HL-SEED-LOAD-W1 — endpoint-truth (fast-tracked follow-up to OPS-HL-RATELIMITER-W2)

- **Probed:** 2026-06-05, live state (HL API, code repo @ `2c4ae63`).
- **Trigger:** OPS-HL-RATELIMITER-W2's 14h soak showed the new HL weight budget pinning its 1000 ceiling (49-101 interactive throws/window → HL→Binance fallbacks; HL seeding throttled to ~1/15 min). Architect chose "Finalize W2 + fast-track OPS-HL-SEED-LOAD-W1."
- **Approach (architect pre-approved):** bound the HL outcome-backfill candle window so it stops over-fetching.
- **Verdict:** **NOT a HALT.** 1 critical primitive (HL `candleSnapshot.endTime`) live-verified; no fictional primitives; no cascade; Data-Integrity-safe.

## Root cause

`backfill-outcomes.ts` + `runBackfill` (signal-performance.ts) call `getCandles(coin, tf, signalTimeMs)` with **no upper bound** → HL `candleSnapshot` returns `[signalTime, now]` (capped ~5000 candles). For an old signal `signalTime` is hours/days back, so the fetch pulls thousands of candles to use only `evalCount` (~8). HL weight = `20 + ceil(items/60)` → **~104 per backfill fetch** (vs ~22 for a real eval window). That over-fetch (~5-13×) dominated the budget's 700/min batch lane and starved seeds + overflowed interactive.

## Primitive truth table

| Claim | Probe | Result |
|---|---|---|
| HL `candleSnapshot` honors `req.endTime` (bounds the response) | live `curl` BTC 15m, startTime + endTime=start+10·15m | **11 candles** returned (bounded) vs **101** without endTime (to-now) → ✅ endTime works |
| Adding `endTime?` to `ExchangeAdapter.getCandles` = no 17-adapter cascade | `grep "async getCandles" src/lib/adapters/*.ts` | 16 adapters impl `(coin,interval,startTime,_dex?)`; trailing-optional param ⇒ narrower impls stay assignable (TS) → only HL adapter + interface touched ✅ |
| Bounded window preserves outcome math | read `computePFEMAE` + backfill consume | uses `candles.filter(time>=signalTime).slice(0,evalCount)` → window `[signalTime, signalTime+(evalCount+2)·candleMs]` yields the identical evalCount candles → **PFE/MAE byte-unchanged** ✅ |

## Fix (commit — TDD, 3 new tests)

- `src/types.ts`: `getCandles(…, dex?, endTime?)` — optional trailing param.
- `src/lib/adapters/hyperliquid.ts`: `getCandles` accepts `endTime`, sets `req.endTime` when given, computes `weightHint` from the bounded window (`expectedCandleItems(interval, startTime, endTime)` exported + endTime-aware). Other adapters ignore it.
- `src/scripts/backfill-outcomes.ts` + `src/resources/signal-performance.ts`: pass `endTime = signalTimeMs + (evalCount + 2) * candleMs`.
- `tests/hyperliquid-endtime.test.ts` (NEW): endTime → request; omitted when absent; `expectedCandleItems` bounded.

Expected effect: HL backfill weight ~104 → ~21 (~5×). Total HL demand drops below the 1000 ceiling → interactive throws → 0, batch waits/skips collapse, HL seeding cadence recovers. R6-equivalent live gate: post-deploy window telemetry `throws`→0 + HL insert rate recovers to CEX parity. Closes OPS-HL-RATELIMITER-W2's GREEN_WITH_CAVEAT retroactively.
