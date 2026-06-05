# OPS-SHADOW-PIPELINE-W1 — Plan-Mode Step 0 + Step-0.5 (endpoint-truth + CPU frontier + identifier-diff + HALT triage)

**Wave:** OPS-SHADOW-PIPELINE-W1 (Tier-2, 6 chapters sequential) — Deliverables B+C+D of the Shadow-Venue Pipeline brief.
**Date:** 2026-06-01 (probed ~08:00–08:12 UTC). **Effort:** Plan-Mode read-only — 0 edits, 0 state mutation.
**Prompt:** `Prompt/ops-shadow-pipeline-w1.md`.

## Verdict preview
✅ **NO HALT.** 12/12 instruments endpoints return **200** from the Hetzner production host (0 fictional). Hotfix-A dependency satisfied. **Frontier verdict = (5a) FITS on current 2-vCPU box** at a coarse staggered cadence — **no Hetzner upgrade required.** Two notable **drifts** flagged (both benign, see §Drift): (1) the `seed-shadow-1m` cron is **already removed** (Mr.1, ~07:36 UTC today) → C3 removal is a no-op confirm; (2) `byExchange.<promoted>.byTimeframe.1m` is a public surface that **freezes** now that 1m seeding stopped → needs a Data-Integrity decision (Q-H). Awaiting architect ratification of Q-A…Q-H before any mutation.

---

## R0.0 — `$REPO` + clean baseline
| Claim | Reality | Resolution |
|---|---|---|
| canonical `/Users/tank/code/crypto-quant-signal-mcp` | HEAD `931cda8` = **origin HEAD** (my hotfix-A commit); branch main | ✅ USE; in-scope files (`seed-signals.ts`/`evaluate-venues.ts`/`venue-store.ts`/`types.ts`) CLEAN — no concurrent-session HALT |

## Probe results (`claim | reality | resolution`)

| # | Probe | Reality | Resolution |
|---|---|---|---|
| 2 | hotfix-A dep (`seeding_started_at` + `no_pipeline_yet` live) | `seeding_started_at` **present**; `no_pipeline_yet` 2 hits in deployed dist; **`promoted_at` ALSO already present** | ✅ dep satisfied; **Q-E: `promoted_at` needs NO migration** (already in schema since EXCHANGE-SHADOW-PROMOTE-W1) |
| 3 | ExchangeId enum-widening cascade | Only exhaustive `Record<ExchangeId,…>` literals: `DELAY_PER_EXCHANGE` (**already 17 keys**) + the NEW `UNIVERSE_FETCHERS` (C1). `Map<ExchangeId>` (exchange-adapter, asset-tiers) are lazy — no compile-time exhaustiveness. `venue-coverage`/`capabilities` use `ExchangeId[]`. | ✅ **Q-B: only `UNIVERSE_FETCHERS` must be exhaustive** (tsc enforces); 12 shadow stubs in C1, filled C2 |
| 4 | seed-signals structure | 5 hardcoded `exchanges.includes()` blocks (HL/BINANCE/BYBIT/OKX/BITGET); 5 `fetch*Coins`; `seedExchange`@479; `main`@526; `getRestrictedUniverse`@294; `SHADOW_TIMEFRAMES=['1m','3m']`@150; `DELAY_PER_EXCHANGE`@56; `--exchange`/`--exchange-list` parse confirmed | matches brief |
| 5 | promoted-seed 0-regression baseline | crontab: 5 promoted venues × {5m top50, 15m top100, 30m top100, 1h, 2h, 4h, 8h, 12h, 1d} + `seed-shadow-3m` (HL top20 + 4-venue top50). Universe via `fetch{HL,Binance,Bybit,OKX,Bitget}Coins`. C1 must preserve byte-equivalently. | baseline recorded for C1 gate |
| 6 | 12 instruments endpoints (live, Hetzner) | **ALL 200** (see §Endpoint table) | ✅ **0 fictional → NO HALT** |
| 7 | CPU baseline | `nproc=2`; load 0.87→0.94 (15-min) = **~47% normalized** (post-1m-removal); mcp-server 21–49% of 1 core; peak transient 1.52 during cron overlap | ✅ **<60% — no mandatory pre-deploy investigation chapter**; fits frontier (§Step-0.5) |
| 7b | `seed-shadow-1m` locate + 1m consumer audit | **1m cron ABSENT** (log frozen 07:36 UTC; no `* * * * *` line); `seed-shadow-3m` retained + fresh (08:07). `byExchange.<promoted>.byTimeframe` **includes `1m`** (public); top-level `byTimeframe` strips it. | ⚠️ **Q-H: 1m already removed (drift); public per-exchange 1m now frozen → decision needed** |
| 8 | `promoted_at` pre-check | **present** (see probe 2) | Q-E: no migration |
| 9 | `byExchange` shape | keys per venue: `{exchange, count, evaluated, pfeWinRate, byTimeframe}`; **NO `outcome_return_pct`/`outcome_price`/Phase-E** anywhere; 5 promoted venues | ✅ Q-F: PFE-WR-only confirmed; snapshot allowed/forbidden keys recorded |
| 10 | `send_telegram.sh` | `/opt/algovault-monitoring/send_telegram.sh` (executable, 5327B) | ✅ report + promote-confirm call it; no inline gating |
| 11 | test runner | `package.json` `"test":"vitest run"` | ✅ vitest (not jest); new tests → `tests/unit/` |
| 13 | deploy.yml paths-ignore | present (`ops/systemd/**`, `activation-funnel/**`, …); `src/scripts/*` DOES deploy | ✅ audits/*.md non-deploying; seed/evaluate run as host cron (reached via deploy git-pull+build) |
| 14 | PILOT-ADAPTERS audits | all 4 (W1/W2/W3A/W3B) present in `$REPO/audits/` | ✅ no re-derive needed |

## Endpoint table (12/12 live 200 from Hetzner — symbol convention + ranking field for C2)

| Venue | Instruments endpoint (200) | Symbol → coin | Ranking field |
|---|---|---|---|
| ASTER | `fapi.asterdex.com/fapi/v1/ticker/24hr` | `<COIN>USDT` (Binance-style) | `quoteVolume` (no bulk OI; vol proxy) |
| EDGEX | `pro.edgex.exchange/api/v1/public/meta/getMetaData` | nested `data.contractList[]` | needs meta+ticker join (C2 detail) |
| GATE | `api.gateio.ws/api/v4/futures/usdt/contracts` | `name`=`BTC_USDT` | `trade_size`/vol (or `/tickers` join) |
| MEXC | `contract.mexc.com/api/v1/contract/detail` | `symbol`=`BTC_USDT` | join `/ticker` vol; OI in `/open_interest` |
| KUCOIN | `api-futures.kucoin.com/api/v1/contracts/active` | `XBTUSDTM` → **BTC=XBT, `M` suffix** | `turnoverOf24h`/`volumeOf24h` in-call |
| PHEMEX | `api.phemex.com/public/products` | `data.products[]` perpetual | join `/v3/ticker/24hr/all` |
| BINGX | `open-api.bingx.com/openApi/swap/v2/quote/contracts` | `symbol`=`BTC-USDT` (hyphen) | join `/quote/ticker` vol |
| HTX | `api.hbdm.com/linear-swap-api/v1/swap_contract_info` | `contract_code`=`BTC-USDT` | join `/v2/linear-swap-ex/market/detail/batch_merged` vol |
| WEEX | `api-contract.weex.com/capi/v2/market/contracts` | `cmt_btcusdt` | `/capi/v2/market/tickers` `volume_24h` |
| BITMART | `api-cloud-v2.bitmart.com/contract/public/details` | `BTCUSDT` (filter `product_type=1`) | `open_interest` in-call |
| XT | `fapi.xt.com/future/market/v1/public/symbol/list` | `btc_usdt` (filter `contractType=PERPETUAL`) | `/q/agg-ticker` vol |
| WHITEBIT | `whitebit.com/api/v4/public/futures` | `BTC_PERP` (filter `money_currency=USDT`) | `stock_volume`/`open_interest` in-call |

(KUCOIN BTC→XBT mapping + EDGEX/PHEMEX nested-shape parsing are C2 implementation details — the adapters already have base URL + symbol mapper; the universe fetcher adds the list+rank.)

---

## Step-0.5 — Cadence × Sample × CPU frontier (the load-bearing decision)

### 1. Normalized CPU baseline (post-1m-removal)
- `nproc=2`. 15-min load **0.94 → ~47% normalized**. mcp-server CPU 21–49% of one core; postgres ~2%. Transient peaks ~1.52 (76%) only during overlapping cron fires + my probing. **Sustained <60% — healthy.**
- **1m-removal credit: already banked.** The `seed-shadow-1m` cron (every-minute, 5 coins × 5 venues = 25 `getTradeSignal`/min) was removed ~07:36 UTC (Mr.1, pre-wave). My baseline was measured at 08:05+ → already reflects its absence. So there is **no additional credit to gain** — but the budget is computed against the already-lighter post-removal box.

### 2. Per-venue seed cost (from live `seed-shadow-3m` production data)
- 4-venue 3m cycle (`--exchange-list BINANCE,BYBIT,OKX,BITGET --top 50`): per venue **~24–40s wall** (delay-dominated: 50 coins × 200–400ms = 10–20s + API/compute), CPU ~25–49% of **one** core during the run. Sequential (one venue at a time) → bounded peak.
- Extrapolation to top-30: ~30 coins × 300ms ≈ 9s delay + work ≈ **~15–25s/venue/cycle**, ~25% of one core.

### 3. Meaningful-sample floor (proposed)
- Promoted `min_buy_sell_sample` = `asset_count × 10` (HL 1360 … BITMART 9490) — calibrated to **multi-timeframe promoted volume**; unreachable at a single coarse shadow timeframe.
- **Statistical floor for an 80%-WR verdict:** binomial SE at p=0.80 → n=500 gives 95% CI ≈ ±3.5% (n=300 → ±4.5%; n=246 → ±5%). **Propose shadow `min_buy_sell_sample = 500`** (Phase-E-backfilled BUY/SELL) — enough to trust an 80% call, decoupled from `asset_count`.

### 4. Reachability
- At **15m timeframe, top-30**: ~30 signals/fire × 96 fires/day = ~2,880 signals/day/venue; BUY/SELL fraction historically ~10% → **~288 BUY/SELL/day** → 500-floor reached in **~2 days** (well within the 15-day window; Phase-E backfill lags ~hours–1 day). Even a **30m** cadence reaches 500 in ~4 days.

### 5. Decision branch → **(5a) FITS on current box**
- 12 shadow venues at **15m/top-30, staggered** (1 venue per off-:00 slot, never concurrent): adds ~+0.15–0.25 to load → new sustained ~**57% normalized** (peak bounded by single-venue concurrency).
- **30m/top-30** alternative: ~+0.08–0.13 → ~**52% normalized** (more long-term headroom for future venues; floor in ~4 days).
- **No upgrade required.** (Reference if ever needed: CPX31 4-vCPU ~$24/mo, CPX41 8-vCPU ~$44/mo — live-reconfirm via `hcloud` before citing. NOT triggered.)
- **Recommendation:** 15m/top-30/floor-500 (fast accrual, fits) OR 30m/top-30/floor-500 (max long-term headroom). Architect picks (Q-A/C/D).

---

## Drift findings (flagged, benign)
1. **`seed-shadow-1m` already removed (Mr.1, ~07:36 UTC today).** Spec assumes C3 removes it; reality = already gone (log frozen 07:36; no every-minute cron). → **C3 removal becomes a no-op CONFIRM** (`crontab -l | grep -q seed-shadow-1m` → already absent = pass). Backup-crontab + 48h-gate steps still apply for the **shadow-line ADD**.
2. **Public `byExchange.<promoted>.byTimeframe.1m` now frozen.** Top-level `byTimeframe` strips shadow timeframes (no 1m); per-exchange `byTimeframe` does NOT (1m present). With 1m seeding stopped, that per-exchange 1m count stops growing. Existing rows are never deleted. → **Q-H decision:** (a) strip 1m from per-exchange `byTimeframe` to match the top-level strip (clean, no stale number shown), or (b) accept the frozen per-timeframe breakdown (minor, non-headline). Note: this is Data-Integrity-adjacent (a public number that silently stalls) → recommend **(a) strip** for consistency, scoped into C3 or C4. Pre-existing inconsistency exposed by Mr.1's removal, not introduced by this wave.

## HALT triage
| Class | Count | Outcome |
|---|---|---|
| Fictional instruments endpoints | 0/12 (all 200) | NO HALT |
| Structural mismatches | 0 | — |
| Benign drifts (1m already removed; public 1m frozen) | 2 | flag + Q-H |

**→ NO HALT.** Not V2-RESUME class. Proceed after Q-A…Q-H ratification.

---

## Architect ratification (Q-A … Q-H)
- **Q-A — Frontier:** (5a) FITS on current 2-vCPU box; **no upgrade**. Confirm.
- **Q-B — `UNIVERSE_FETCHERS` signature:** `Record<ExchangeId, (topN:number)=>Promise<string[]>>`; sole new exhaustiveness site (tsc-enforced); `DELAY_PER_EXCHANGE` already 17-key. Confirm.
- **Q-C — Shadow cadence:** recommend **15m / top-30 / staggered off-:00** (alt 30m). Pick.
- **Q-D — Shadow `min_buy_sell_sample` floor:** **500** (binomial ±3.5% @95% on 80% WR). Confirm/adjust.
- **Q-E — `promoted_at`:** already present → **no migration**; `evaluate-venues` Branch-1 → `ready_for_promotion` (no auto status flip for shadow). Confirm.
- **Q-F — `byExchange` snapshot:** allowed `{exchange,count,evaluated,pfeWinRate,byTimeframe}`; forbidden `{outcome_return_pct,outcome_price,phase_e*}`; add-only on promotion. Confirm.
- **Q-G — system-map rows:** add seed→signals source-of-truth refactor (+12 producers), new cron, `promote-venue.ts`/`retire-venue.ts`/`venue-readiness-report.ts` components, evaluate auto-promote narrowing. **system-map.md updated: Y.**
- **Q-H — 1m drift:** 1m cron already removed → C3 = no-op confirm; **public per-exchange `byTimeframe.1m` now frozen → recommend strip (a)**. Decide strip vs accept.

## Identifier diff (pin spelling across spec/code/gate/status/commits)
`UNIVERSE_FETCHERS` · `seeding_started_at` · `promoted_at` · `ready_for_promotion` · `stampSeedingStarted` · `setPromotedAt` · 12 fetchers `fetch{Aster,Edgex,Gate,Mexc,Kucoin,Phemex,Bingx,Htx,Weex,Bitmart,Xt,Whitebit}Coins` · `SHADOW_VENUE_TOP_N` / `SHADOW_VENUE_TIMEFRAME` (cadence consts) · readiness glyphs `✅⏳⚠️🔌⏱🟢`. (Note: GATE adapter file = `gateio.ts`, class `GateAdapter`; fetcher named `fetchGateCoins`.)

## Chapter edit plan (after ratification)
- **C1**: `UNIVERSE_FETCHERS` registry (5 real + 12 stub, tsc-exhaustive); `main()` reads `listVenues()` status∈{promoted,shadow}; status-tier cadence hook; 0-regression promoted baseline gate.
- **C2**: 12 `fetch<Venue>Coins` (live endpoints §table; fail-soft `[]` on error); per-fetcher unit tests (mock real JSON shape).
- **C3**: shadow cadence (Q-C) + `stampSeedingStarted()` first-signal stamp + shadow `min_buy_sell_sample`=floor (Q-D) + crontab backup + **confirm 1m absent (no-op)** + add staggered shadow lines + **Q-H public-1m handling** + 48h CPU gate (framework-consumed).
- **C4**: `promote-venue.ts`/`retire-venue.ts` + disable shadow auto-promote (`ready_for_promotion`) + `byExchange` shape-snapshot drift-check (no `promoted_at` migration — present).
- **C5**: `venue-readiness-report.ts` + 06:05 UTC cron; 17-venue digest via `send_telegram.sh`; READY-TO-LAUNCH block; PFE-WR-only grep gate.
- **C6**: status.md + system-map.md + WIS; firewall greps.

**Gate tokens:** `CH1_GREEN`…`CH6_GREEN`.

---

# V2-RESUME (2026-06-05) — parity cadence on CPX42 (supersedes the 2026-06-01 15m-only sizing)

**Trigger:** prompt rewritten 2026-06-05 14:04. Mr.1 upgraded the box (2-vCPU → **CPX42 8-vCPU/16GB**) and directed **promoted-parity seeding +3m** for the 12 shadow venues — superseding V1's 15m-only/floor-500 cadence. This is the canonical V2-RESUME: C1/C2/C4/C5 shipped 2026-06-01 are **unchanged**; the work is concentrated in **C3** + a thin confirm of the rest.

## Pre-resolved drift corrections (V1 shipped → V2 state)
| # | V1 (2026-06-01, shipped) | V2 (2026-06-05) | Action |
|---|---|---|---|
| 1 | C1 `UNIVERSE_FETCHERS` registry + table-driven `main()` + `--status` | unchanged | **thin confirm** (deployed: `UNIVERSE_FETCHERS`×6 in dist) |
| 2 | C2 12 shadow fetchers | unchanged | **thin confirm** (deployed: `fetchWeexCoins`×3) |
| 3 | C3 cadence = **15m-only top-30** | **full promoted matrix +3m** (3m/5m/15m/30m/1h/2h/4h/8h/12h/1d) | **REPLACE cron** |
| 4 | C3 `min_buy_sell_sample` = **500** (all 12) | **revert to originals** (ASTER 4100 … BITMART 9490) | **REVERT prod UPDATE** |
| 5 | C3 `DELAY_PER_EXCHANGE` shadow = 300ms (all) | **per-venue from SoT** (250/750/250/300/250/300/250/150/300/500/400/200) | **code edit** |
| 6 | C3 48h gate (fired 06-03, inactive) | new 48h gate for the parity mutation | **re-arm** |
| 7 | C4 promote/retire + `ready_for_promotion` | unchanged | **thin confirm** (live: `promote-venue GATE` refuses) |
| 8 | C5 readiness report + 06:05 cron | unchanged (auto-reflects new cadence) | **thin confirm** |

## Step-0.5 — parity-load feasibility (verify, not size)
- **Probe 1 box identity:** `nproc=8`, 15 GB RAM, hostname AlgoVault-MCP = **CPX42 ✓ (no HALT)**.
- **CPU baseline:** load 0.75 (15-min) / 8 vCPU = **~9% normalized**; mcp-server 5% of one core, 4.5 GB. Parity 5→17 venues ≈ 3.4× seed load on 4× CPU at 9% baseline ⇒ **trivially FITS, peak ≪ 60%** (Q-A).
- **Throttle audit:** per-venue `DELAY_PER_EXCHANGE` from the SoT table (§2), all ≤50% of documented budget; gentlest on ban-escalators BITMART(500)/XT(400)/PHEMEX(300); EDGEX 750ms (unpublished limit). 

## Parity template (live promoted cron matrix, captured 2026-06-05)
`5m top50 · 15m top100 · 30m top100 · 1h · 2h · 4h · 8h · 12h · 1d` — each × 5 promoted venues, per-`--exchange` lines.
**Shadow parity = this matrix + 3m**, schedulable as **10 `--status shadow` lines** (one per tf; each seeds all 12 venues sequentially — bounded peak, reuses V1 `--status` architecture), staggered off the promoted minutes.

## ⚠️ KEY DECISION (Q-C) — interval-gap handling: substitution-parity vs aggregateKlines
**Finding (code-as-written vs prompt-assumed):** the prompt assumes a NEW `aggregateKlines(candles,factor)` primitive (3×1m→3m, 2×1h→2h, 2×4h→8h, 3×4h→12h) for venues missing native long bars. BUT:
- **No aggregation mechanism exists.** The adapters (shadow AND promoted) use **SUBSTITUTION fallback** — e.g. `weex.ts '2h':'1h','8h':'4h','12h':'4h'`, `phemex.ts '2h':3600 // no 2h; fall back to 1h`, `bitget.ts '2h':'1H'`. A `2h` request returns coarser native candles labeled `2h`.
- **Promoted venues serve their dashboard 8h via this same substitution** (Build Rule 3 forbids changing promoted behaviour).
- ∴ **TRUE parity ("seed exactly like the promoted venues" — Mr.1) = shadow reuses the SAME substitution.** The shadow adapters ALREADY have these maps. Zero new code; zero promoted/shadow divergence.
- Building `aggregateKlines` (shadow-only) would make shadow venues **diverge from** (be more correct than) promoted — anti-parity + Build-Rule-3 tension + large per-adapter wiring.

**Resolution options for the architect:**
- **(1) Substitution-parity [RECOMMENDED]:** shadow venues use the existing substitution fallback, identical to promoted. No `aggregateKlines`. Literal parity, 0-regression-safe, minimal C3. Missing-interval signals are coarser-resolution (same fidelity promoted venues already ship).
- **(2) aggregateKlines for BOTH:** build it + wire into promoted+shadow → correct bars everywhere, consistent — but VIOLATES Build Rule 3 (changes promoted); needs Mr.1 to lift that + a bigger wave.
- **(3) aggregateKlines shadow-only:** the prompt's literal text → correct shadow bars but promoted/shadow inconsistency.

## HALT triage
0 fictional primitives, 0 HALT. Box confirmed, endpoints live (SoT-cited; my V1 fetchers use older-but-still-200 paths — WEEX /capi/v2, XT v1, MEXC contract.mexc.com — optional V3 upgrade deferred, non-blocking). The aggregateKlines question is a genuine design decision (Q-C), not a fictional.

## Ratifications
- **Q-A:** parity FITS on CPX42 (~9% baseline, peak ≪60%) — confirm.
- **Q-C:** interval-gap handling — **(1) substitution-parity recommended** vs (2)/(3) aggregateKlines. **DECISION NEEDED.**
- **Q-D:** revert shadow `min_buy_sell_sample` 500 → originals — confirm.
- **Q (delays):** per-venue `DELAY_PER_EXCHANGE` from SoT §2 — confirm.

## AMENDMENT (2026-06-05 14:19) — seed-shadow-3m ALSO retired (cutover), updates Q-H + probe 7b
**Prompt re-edited (line 18):** BOTH `seed-shadow-*` experiment lines retired. 1m REJECTED on **<1s serving-latency** (not WR) — internal-cron-only removal; **1m stays in the on-demand tool `timeframe` enum, schemas UNTOUCHED** (live-verified `get_trade_call BTC 1m` works). 3m PROMOTED → cut into the standard matrix.

**Probe 7b (re-run live 2026-06-05):**
- `seed-shadow-3m` = **2 lines** (`1-58/3 … --timeframe 3m --exchange HL --restricted-universe 20`; `1-59/3 … --timeframe 3m --exchange-list BINANCE,BYBIT,OKX,BITGET --top 50`).
- **0 main-pattern 3m lines ⇒ `seed-shadow-3m` is the SOLE 3m producer** ⇒ **add-before-remove cutover MANDATORY** (not straight removal).
- **Continuity baseline (promoted 3m, last 24h):** BINANCE 220 · BITGET 266 · BYBIT 442 · HL 11 · OKX 213 (Σ≈1152/day). HL low (restricted-universe 20).
- **3m is PUBLIC** — top-level `byTimeframe.3m` WR **94.6%** (matches the prompt). Retiring without replacement freezes a public number ⇒ Data Integrity violation.

**Q-H resolution (UPDATED):**
1. **1m:** `seed-shadow-1m` already absent (retired by OPS-1M-SEED-DECOM-W1) → no-op confirm. 1m on-demand tool path untouched.
2. **3m cutover (add-before-remove):** (a) ADD a standard 3m line `--timeframe 3m --top 50` table-driven (all 17 venues — promoted full-universe top-50 replaces the restricted-universe experiment; shadow venues get 3m via the same line); (b) run ≥1 cycle, VERIFY promoted 3m accrual within **±20%** of the Σ≈1152/day baseline; (c) THEN remove the 2 `seed-shadow-3m` lines. Net promoted 3m change ≈ 0. Shadow venues without native 3m substitute 3m→5m (per Q-C decision) — does NOT affect the public (promoted-only) 3m number.

**Updated C3 cron plan (replaces V1's single 15m line):**
- 3m cutover: `--timeframe 3m --top 50` (all 17, table-driven) [+verify ±20% → remove seed-shadow-3m×2].
- Shadow parity (9 lines, `--status shadow`): 5m top50 · 15m top100 · 30m top100 · 1h · 2h · 4h · 8h · 12h · 1d.
- Per-venue `DELAY_PER_EXCHANGE` shadow values from SoT §2 (code edit).
- Revert shadow `min_buy_sell_sample` 500 → originals.
- New 48h CPU gate (re-arm).
- All staggered off the promoted minutes + each other; no 1-minute interval.

**Step-0 VERDICT: ✅ NO HALT (V2-RESUME).** Box CPX42 confirmed; parity fits (~9% baseline); 0 fictional primitives; 3m cutover path resolved (sole producer → add-before-remove). One design decision pending architect: **Q-C (substitution-parity vs aggregateKlines)**. Awaiting Q-A/Q-C/Q-D + delays confirmation before state mutation.
