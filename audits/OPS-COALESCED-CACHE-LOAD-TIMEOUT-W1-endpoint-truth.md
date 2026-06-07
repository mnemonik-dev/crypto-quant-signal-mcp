# OPS-COALESCED-CACHE-LOAD-TIMEOUT-W1 — endpoint-truth (Plan-Mode, light)

**Probed:** 2026-06-07, worktree `ops/coalesced-cache-load-timeout-w1` @ origin/main `80eafa4`. **Verdict: 0 fictional primitives, 0 NEW drift → PROCEED** (prompt: proceed-without-hold if probes match). **Architect decision: R4 (monitor 3× retry) IN.** One implementation refinement documented below (bound the flight await for joiner AND creator).

## Step 0
| Probe | Result |
|---|---|
| baseline | worktree off origin/main `80eafa4` (parallel session on OPS-X402-MCP-PRICE-BINDING-W1, disjoint x402-MCP files). node_modules symlinked. |
| target files active-session? | `coalesced-cache.ts`/`asset-tiers.ts` last touched by OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 (`37626d0`/`c840be7`) — NOT under an active session. `monitor.ts` last by OPS-SEED-FRESHNESS-W1 (mine, `7e58289`, merged). |
| `loadTimeoutMs` | ABSENT in src (new identifier ✓). |

## Probe 2 — the defect + insertion point (CONFIRMED)
`coalesced-cache.ts get()`: (1) fresh hit; (2) processGate→serve; (3) negative-memo→serve; (4) JOIN `inflight.get(key)` → `return existing`; (5) cold → start ONE flight `p`, `inflight.set`, `return p`. **The flight's `await load(key)` (step 5 IIFE) is unbounded; `fallback` fires only in the `catch` (throw-only). A non-throwing WAIT (HL `batch_wait` ~58s) blocks the caller for the full load.** Both the **creator** (step 5 `return p`) and any **joiner** (step 4 `return existing`) await `p` unbounded.

**R1 insertion (refinement of the prompt's "step (4)"):** restructure (4)+(5) to get-or-create `p`, THEN — gated on `loadTimeoutMs>0` AND (stale-present OR `fallback` configured) — `Promise.race([p, timeout(loadTimeoutMs)])`. On `p` first → return its value (real or its own catch-fallback). On timeout → return stale-or-`fallback()` NOW; **leave `p` running** (single-flight; its success branch already does `store.set` + `finally inflight.delete` → self-warms next caller). Timeout sets **NO** negative memo (load didn't fail) and does **NOT** abort `p`. No `fallback`/stale → fall through to `return p` (can't serve nothing — today's behavior). This bounds BOTH joiner+creator (a joiner blocking 84s would defeat the fix — the monitor can be either). Default `loadTimeoutMs===undefined` → byte-identical to today for the 3 other consumers.

## Probe 3 — all `coalescedCache` consumers (future-cases-inherit map)
| Consumer | File | This wave |
|---|---|---|
| `top20Cache` (`getTop20ByOI`) | `asset-tiers.ts:155` | **R2: `loadTimeoutMs: 2500`** |
| `stdRankingCache` (`getTopAssetsByOI`) | `oi-ranking.ts:28` | inherits the OPTION (opt-in later if it ever blocks a hot read; note: top20Cache.load CHAINS through this, so bounding top20Cache bounds the chain) |
| `xyzRankingCache` | `oi-ranking.ts:71` | inherits option (later) |
| `metaCacheImpl` (`getMetaAndAssetCtxsCoalesced`) | `adapters/hyperliquid.ts:143` | inherits option (later) |

Only `top20Cache` is set this wave (the perf-public path). `getTop20ByOI().load = getTopAssetsByOI(20)` → routes through `stdRankingCache` → HL OI fetch; the 2.5s race on `top20Cache` bounds the whole chained load (≥2.5s → `FALLBACK_TOP20` + bg-warm).

## Probe 4 — Data Integrity (CONFIRMED)
`top20Cache.fallback = () => FALLBACK_TOP20` (static ~28-coin Set), `staleOk:true`. The TIMEOUT degradation serves the SAME `FALLBACK_TOP20` (or stale) as the existing THROW degradation → **identical** to OPS-HL-CACHE-STAMPEDE "fallback values byte-identical." `classifyAsset(coin, FALLBACK_TOP20|stale)` only changes Tier-2 membership (Tier-1/TradFi/meme decided first). `/api/performance-public` counts / `overall.pfeWinRate` / `totalCalls` UNCHANGED; only `byAsset.*.tier` / `byTier.*` may briefly reflect fallback during the cold window — pre-existing throw-fallback behavior, self-heals when the bg load lands. **No new public-data behavior.**

## Probe 5 — R4 (CONFIRMED)
`checkPfeWinRate` (monitor.ts:372): single `fetchJson(internalPerfPublicUrl(), {}, 15_000)`, NO retry. `checkServerHealth`/`checkFacilitator`: `MAX_ATTEMPTS=3`, `RETRY_DELAY_MS=5_000`. **R4:** wrap the FETCH in the same 3× retry; retry ONLY the HTTP-error path (`!ok`); once `ok`, return `evaluatePfeWinRate(data)` as-is (a real WR-value breach still pages FIRST-cycle — not masked). Keep the 15s per-fetch timeout; keep `FAIL_THRESHOLDS.pfe_winrate=1` (a 3-attempt sustained failure still pages first-cycle). Message becomes `… HTTP <s> after 3 attempts` (checkServerHealth style). Closes the consecutive=1 gap the loopback hotfix flagged, WITHOUT masking.

## Probe 6 — identifier diff (consistent)
| Identifier | Value |
|---|---|
| option | `loadTimeoutMs?: number` (CoalescedCacheOptions, default undefined) |
| applied | `top20Cache.loadTimeoutMs = 2500` (asset-tiers.ts) |
| value justification | healthy cold fill <2.5s → real top20; saturated ≥2.5s → FALLBACK_TOP20 + bg-warm |
| R4 | `checkPfeWinRate` MAX_ATTEMPTS=3 / RETRY_DELAY_MS=5_000 (mirror checkServerHealth) |

## Map / per-R
`system-map.md updated: n-a` (internal helper change; no edge/column/tool/route; public values byte-equivalent). R5 tests first (helper default-off byte-identical; timeout+slow-non-throwing-load→fallback-fast + store self-populates [fake timers]; stale-on-timeout; throw path unchanged; no-negative-memo-on-timeout; top20Cache integration slow-load→FALLBACK_TOP20 fast) → R1 helper → R2 top20Cache → R3 self-warm verify (grid warmer `refreshGridIfStale`→getTradeSignal→getTop20ByOI triggers bg-populate; add a dedicated warmer ONLY if Step-0 shows the grid warmer gated off) → R4 monitor retry → deploy (deploy-direct, GHA down) → AC live (forced cold-cache: /api/performance-public <~3s even under batch_wait) → status.md + WIS.
