# OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 — Plan-Mode endpoint-truth

**Date:** 2026-06-06 · **Tier-2 Bulk-Spec, 4 chapters (C1→C4)** · **Tier:** META · baseline SHA `f6c6b08` (clean, 0 behind origin).

- **Verdict:** **NOT a fiction-HALT — 0 fictional primitives** (every cited file/function/const live-verified against HEAD). **1 minor identifier drift** (`getTopAssetsByOIxyz` → actual `getXyzAssetsByOI`) → fix inline + flag (1 < 3 HALT threshold). The root-cause + the proven-template + the byte-equivalence design are all confirmed in source. Spec is execution-ready on architect ratification. **Wait for architect approval before C1** (no V2-RESUME clause; ≥4 chapters + NEW shared module first-use + concurrent-session firewall).

---

## §1 — Primitive probe (claim | reality | resolution)

| Spec primitive | Probe | Reality | Resolution |
|---|---|---|---|
| `getMetaAndAssetCtxsCoalesced` (the proven template) | `grep -n …hyperliquid.ts` | ✅ L139; pairs `metaCache`(L132,`META_TTL_MS`=60s) + `metaInflight`(L133) single-flight, dex-keyed (`metaCacheKey` L135); **on error: delete inflight + THROW (no stale, no negative-cache)** | C2 R1 refactors ONTO the primitive with `staleOk=false`, `negativeTtlMs=0` → byte-identical (single-flight only) |
| `getTopAssetsByOI(limit)` (the storm source) | `oi-ranking.ts:19` | ✅ cache `{assets,ts}`(L17, TTL 1h L8); **cache-on-success-only (L41); stale-fallback-or-throw on error (L43-47); NO single-flight, NO negative-cache**; calls `hlInfoPost({type:'metaAndAssetCtxs'})` **DIRECTLY (L28) — bypasses the coalescing** | C2 R2 wrap; `staleOk=true`, `negativeTtlMs`≈30-60s jittered |
| `getTopAssetsByOIxyz` | `grep oi-ranking.ts` | ❌ **does NOT exist** — actual export is **`getXyzAssetsByOI`** (L63), same stampede shape (`xyzCache` L56, success-only L87, direct `hlInfoPost(dex:'xyz')` L70) | **DRIFT-1** → C2 R2 wraps `getXyzAssetsByOI` (the real name) |
| `getTop20ByOI` (every getTradeSignal hits it) | `asset-tiers.ts:144` | ✅ `cachedTop20`(TTL `CACHE_TTL_MS`=1h L113); **cache-on-success-only (L156); on error returns stale or `FALLBACK_TOP20`(L138/165) but DOES NOT set cache → next call re-attempts** = the stampede; delegates to `getTopAssetsByOI(20)` (L150) | C3 wrap; `fallback=FALLBACK_TOP20`, `staleOk=true`, processGate on; `_clearTop20Cache`(L173) preserved |
| `isShortLivedScript(scriptPath)` | `performance-db.ts:63` | ✅ exported; the OPS-GRID-PROCESS-BOUNDARY-W1 predicate (`92d1231`) | primitive's default `processGate` derives from it |
| `FALLBACK_TOP20` / `CACHE_TTL_MS` 1h | `asset-tiers.ts` | ✅ L138 / L113 (3_600_000) | preserved (System-Taxonomy "May NOT change values/TTLs") |
| `getRestrictedUniverse` (firewalled) | `seed-signals.ts` | ✅ 4 occurrences (FIREWALL — active seed sessions own the file) | deferred → `OPS-HL-CACHE-PROCESS-BOUNDARY-FOLLOWUP` (C4 WIS) |
| OPS-HL-TOP20-NEGATIVE-CACHE-W1 chip landed? | `git log` + `grep negative asset-tiers.ts` | ✅ **NOT landed** (recent commits = release/seed/telemetry; 0 `negative` in asset-tiers) | no collision now; **C3 re-probes live** — if landed by C3, REPLACE with the primitive; else flag chip obsolete |

## §2 — DRIFT (1, fix-inline)

- **DRIFT-1 — `getTopAssetsByOIxyz` is fictional.** The spec (C2 R2 + Map Anchor row) cites `getTopAssetsByOIxyz`; the actual export is **`getXyzAssetsByOI`** (oi-ranking.ts:63). Verified by `grep -nE '^export …' oi-ranking.ts` (exports: `getTopAssetsByOI`, `getTopAssetNames`, `getXyzAssetsByOI`, `getXyzSymbolSet`). **Resolution:** C2 R2 wraps `getXyzAssetsByOI` (same TradFi/xyz stampede shape — `xyzCache`, success-only, direct `hlInfoPost(dex:'xyz')`). No other drift; the root-cause class-A/B claims, the `metaInflight` template, and `isShortLivedScript` grep=0 all hold.

## §3 — Why oi-ranking stampedes but meta doesn't (architecture confirmed)

`getMetaAndAssetCtxsCoalesced` has **single-flight** (`metaInflight`) → 42 concurrent adapter callers collapse to 1 fetch → 1 budget acquire → at most 1 throw. But `getTopAssetsByOI`/`getXyzAssetsByOI` call `hlInfoPost(metaAndAssetCtxs)` **directly, bypassing that coalescing** → 42 concurrent grid scorers → 42 getTop20ByOI → 42 getTopAssetsByOI → 42 direct uncoalesced fetches → 42 budget acquires → 42 throws (and `getTop20ByOI`'s success-only cache never fills under throttle → re-storm next tick). The primitive gives oi-ranking the single-flight it lacks + negative-caches the throttle outcome. ✅ matches the live ledger (126 throws/min, ~1 tool-call/min).

## §4 — Byte-equivalence design (C2 R1, the spine)

The primitive must let the meta refactor stay **provably identical** while oi-ranking gains stale+negative — i.e. negative/stale are OPTIONS:
- **meta** (C2 R1): `coalescedCache({ load: hlInfoPost(body), ttlMs: 60_000, staleOk: false, negativeTtlMs: 0, processGate: off })` → single-flight + 60s TTL + throw-on-error, dex-keyed, budget `acquire` called once per real fetch. Fixture: same request body, same parsed output, single-fetch-under-42-concurrency, `acquire` once. (meta is consumer #1 — already non-stampeding via single-flight; this validates the primitive against the working cache before touching the storm.)
- **oi-ranking / asset-tiers**: `staleOk: true`, `negativeTtlMs`≈30-60s (jittered ±20%, full-jitter per Brooker), `fallback`=stale/FALLBACK_TOP20, processGate on (C3). Fail-open: a loader/cache defect is never worse than today's "throw → fallback".

## §5 — system-map edge-touch (Step 0)

- **NEW component** `src/lib/coalesced-cache.ts` (venue-agnostic primitive). **Internal-refactor annotations** on 3 existing HL-cache producer-internals: `hyperliquid.ts` meta-coalesce (consumer #1, byte-identical), `oi-ranking.ts` `getTopAssetsByOI`+`getXyzAssetsByOI` (#2), `asset-tiers.ts` `getTop20ByOI` + process-boundary gate (#3, the 3rd-consumer extraction threshold). **NONE** external: `tools/list`=9, all public response shapes, postgres, cron, manifests untouched. **system-map.md updated: Y** (new component + 3 internal HL-cache annotations + process-boundary gate).

## §6 — Plan (C1→C4) + coordination

- **C1** — `coalesced-cache.ts`: `coalescedCache<K,V>({load, ttlMs, negativeTtlMs, staleOk, processGate, fallback?})` → `{get(key), _clear, _getState}`. Single-flight (join inflight) + fresh-hit + on-throw: stale→negative-memo(jittered) | fallback→negative-memo | rethrow (fail-open); processGate short-lived → serve cache/fallback, skip loader. **Regression test (the AC1 spine):** cold + loader throws `UpstreamRateLimitError` + 42 concurrent `get()` → loader invoked **exactly 1×**; negative memo suppresses next-call reload; `processGate=short-lived` → loader **0×**. Gate: `rm -rf dist && npm run build && vitest coalesced-cache.test.ts && echo CH1_GREEN`.
- **C2** — R1 refactor `getMetaAndAssetCtxsCoalesced` onto it (byte-equiv fixture, §4); R2 wrap `getTopAssetsByOI` + **`getXyzAssetsByOI`** (drift-fixed) — `staleOk=true`, short negative-TTL, stale-fallback VALUES unchanged. Gate: full `vitest tests/unit/` + `grep -c coalescedCache hyperliquid.ts oi-ranking.ts` ≠0 → CH2_GREEN.
- **C3** — wrap `getTop20ByOI` (fallback=FALLBACK_TOP20, staleOk, processGate); **re-probe the chip live at chapter start** (replace-or-supersede per generator-fix LAW); `_clearTop20Cache` preserved; external behavior (returns `Set`) unchanged. Gate: vitest + `grep coalescedCache + isShortLivedScript asset-tiers.ts` → CH3_GREEN.
- **C4** — full `vitest` (zero new vs C1-start SHA), clean rebuild, push → GHA → `docker exec grep -c coalescedCache dist/lib/{coalesced-cache,oi-ranking,asset-tiers}.js + adapters/hyperliquid.js`. **Killer live gate (30-min):** HL ledger `used` median well under 1150 + interactive throws near-zero (vs 5,375/70min baseline; read `rate_limit_events`/ledger). Secondary: `get_trade_call BTC HL 15m` → HL-scored (provenance restored), `tools/list`=9, keys unchanged. status.md + `system-map.md updated: Y` + WIS + 3 sequenced follow-ups (getRestrictedUniverse / caller-attribution / websocket). → WAVE1_COMPLETE_GREEN.

**Firewall (every chapter):** `seed-signals.ts`, `tools/*`, `cross-asset-grid.ts`, `upstream-weight-budget.ts`/`venue-budget-registry.ts`, manifests/CHANGELOG/README. Per-file `git add`; `git status -s` clean-baseline each chapter start (concurrent seed + release sessions active).

**Acceptance:** AC1 stampede class structurally dead (single-flight + negative-cache, C1 regression + live ledger drop); AC2 process-boundary closed for getTop20ByOI/oi-ranking (getRestrictedUniverse documented follow-up); AC3 meta byte-identical + stale-fallback values unchanged + fail-open; AC4 public surface frozen (tools/list=9, keys, no version bump); AC5 live throw-rate collapse + HL-served-by-HL.
