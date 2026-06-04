# SCAN-TRADE-CALLS-W1 — Plan-Mode endpoint-truth (Step 0)

**Probed:** 2026-06-04 · **Repo:** `/Users/tank/code/crypto-quant-signal-mcp` ·
**HEAD == origin/main:** `524ace72` ✅ (fetched + compared) · **Branch:** `main`
**Verdict:** ✅ **0 fictional primitives** · 7 minor drifts (all fixable inline) ·
**NOT HALT-class** (CLAUDE.md: ≥3 fictional → HALT; 1–2 → fix inline + flag; 0 here).
**Awaiting architect ratification of the corrections + 1 design decision before C1.**

---

## Table 1 — Spec primitive `claim | reality | resolution`

| # | Claim (spec) | Reality (live grep) | Resolution |
|---|---|---|---|
| 1 | `getExchangeTopAssetsWithVolume(exchange, limit)` @ `exchange-universe.ts:208`, throws on shadow | `:208` exact; throws `unsupported exchange` @ :215; "Only supports the 5 PROMOTED venues" @ :200 | ✅ EXACT |
| 2 | `trackCall(license)` @ `license.ts:375` | `export function trackCall(license: LicenseInfo): TrackCallResult` @ **375** | ✅ EXACT — add `units=1` |
| 3 | `trackCallByKey(trackerKey, tier)` @ `license.ts:424` | `(trackerKey: string, tier: LicenseTier): TrackCallResult` @ **424** | ✅ EXACT — add `units=1` |
| 4 | `checkQuota:340` / `checkQuotaByKey:409` | `checkQuota` @ **340**, `checkQuotaByKey` @ **409** | ✅ EXACT (stay unit-agnostic) |
| 5 | `getFundingArbLimit` @ `license.ts:231` (free clamp) | `@231`; `Math.min(req, FREE_FUNDING_LIMIT)`; `FREE_FUNDING_LIMIT = 5` @ :26 | ✅ EXACT — precedent available if a free scan-`limit` clamp is wanted (NOT in spec) |
| 6 | x402/internal short-circuit `Infinity` | `case 'x402': return Infinity` :319, `'internal'` :322, checkQuota early-return :342 | ✅ EXACT |
| 7 | free key = `free:${ipHash}` | actual: `free:${getRequestIpHash() || 'anon'}` (:345/380/482) | ✅ functionally same (spec illustrative) |
| 8 | `getTradeSignal(input)` @ `get-trade-call.ts:79`, `input.internal` skips quota+recording | `@79`; `internal?` @ :37; gated `if (!input.internal)` :87 / `input.internal ? …` :98 | ✅ EXACT |
| 9 | "HOLDs are free" @ `get-trade-call.ts:403` | comment @ ~403; `if (!input.internal && signal !== 'HOLD') trackCall(license)` @ ~405 — **single-arg call site** | ✅ REAL — this is the call site C1's grep-gate protects (`! grep "trackCall(license, "`) |
| 10 | `cross-asset-grid.ts` `pLimit(GRID_CONCURRENCY /* =6, line 71 */)` + scorer seam | `GRID_CONCURRENCY = 6` @ **71**; `pLimit(GRID_CONCURRENCY)` @ 186; `_setScorerOverride` @ 394 | ✅ EXACT — mirror `_setScorerOverride` → `_setScanScorerForTest` |
| 11 | `ResultCache<T>` @ `result-cache.ts:19` | `export class ResultCache<T extends NonNullable<unknown>>` @ **19** | ✅ EXACT |
| 12 | `TradeCallResult` @ `types.ts:241` w/ `call/confidence/regime/coin/timeframe` | `export interface TradeCallResult` @ **241** | ✅ EXACT |
| 13 | tool registration `index.ts:319-462`, 6 tools, `server.tool(name, DESC, SCHEMA, {title, …ANNOT}, handler)` | 6 `server.tool(` @ 319/326/335/378/425/462; pattern exact; names: `get_trade_call, get_trade_signal, scan_funding_arb, get_market_regime, search_knowledge, chat_knowledge` | ✅ EXACT — count **6** |
| 14 | `tool-descriptions.ts` `*_DESCRIPTION` + `PARAM_DESC_*` | `TRADE_CALL_DESCRIPTION` :22 … + `PARAM_DESC_TRADE_CALL_*` :57-65 | ✅ EXACT — add `SCAN_TRADE_CALLS_DESCRIPTION` + `PARAM_DESC_SCAN_*` |
| 15 | `PUBLIC_READONLY_TOOL_ANNOTATIONS` @ `tool-annotations.ts` | `export const … ANNOTATIONS: ToolAnnotations` @ :26 | ✅ EXACT |
| 16 | side-cars `logRequest`+`upsertAgentSession`+`toolErrorContent` (`index.ts:283-330` pattern) | `logRequest(` :292/353/393/441/522; `upsertAgentSession` :306/363; `toolErrorContent` def :119 used :315/372/414/451 | ✅ EXACT |
| 17 | `subscriptionMatches(sub, ev)` @ `webhook-events.ts:158`, string-matches `sub.assets` vs `ev.data.coin` | `export function subscriptionMatches(sub, ev): boolean` @ **158**; `sub.assets.includes(ev.data.coin)` @ :161; loop call @ :186 | ✅ EXACT — **currently SYNC** (see Design Decision D1) |
| 18 | `WebhookEventData.exchange` @ `webhooks-store.ts:36-50`; populated both event types | `exchange: string` @ :40; `DetectedEvent.data.exchange` @ events:34; `detectEvents` sets `exchange: p.exchange` @ :112 | ✅ EXACT — `ev.data.exchange` resolvable for `top:N` |
| 19 | `FundingArbResult['_algovault']` field set @ `scan-funding-arb.ts:336` | `let meta: FundingArbResult['_algovault'] = {` @ **336** | ✅ EXACT — copy this `_algovault` field set |
| 20 | `npm test` = `vitest run`; flat `tests/scan-funding-arb.test.ts`; `tests/unit/*` | `"test": "vitest run"`; flat + unit dirs present | ✅ EXACT |
| 21 | `p-limit` + `zod` in deps (no new npm deps) | **p-limit@3.1.0 direct** ✅; **zod ABSENT from package.json** ⚠️ but `zod@3.25.76` present transitively (via `@anthropic-ai/sdk`) and **already imported** @ `index.ts:15` | ⚠️ DRIFT-1 — no dep add needed; wording imprecise (see Corrections) |
| 22 | Dockerfile Stage-2 copies `dist/` only | `COPY --from=builder /app/dist/ ./dist/` @ Dockerfile:23 | ✅ EXACT — all new files under `src/`, no COPY needed |
| 23 | timeframe = same 11-value enum; TRADE_CALL exchange = 17-value | timeframe `['1m'…'1d']` = **11** ✅; TRADE_CALL exchange enum = **17** ✅ | ✅ EXACT — scan uses promoted-5 subset |
| 24 | `oi-ranking.ts` exists (do NOT use) | present (3981 B) | ✅ correctly excluded |
| 25 | §2 ASCII line `↓ 3 MCP tools (get_trade_call / scan_funding_arb / get_market_regime)` | verbatim @ `system-map.md:202` | ✅ EXACT — update `3→4` + append `scan_trade_calls` (see DRIFT-7) |
| 26 | webhook-api 4xx error contract + `suggested_*` | `res.status(400).json({ok:false, code, error, suggested_action})` pattern throughout; `parseStrArray` @ :80, `assets` parsed @ :135 | ✅ EXACT — field is `suggested_action` |
| 27 | CPU baseline mcp-server ~22% mean, <60% normalized | live: 2 vCPU; load 0.32/0.73/0.89 (15-min ≈44% norm); mcp-server one-shot 54.9% (seed-cron instant); pg 11% | ✅ <60% norm → **no mandatory investigation chapter** |
| 28 | known baseline = 16 pre-existing full-suite failures | status.md 2026-06-03: "16 pre-existing … unchanged; +8 passing 1460→1468" | ✅ documented (full suite NOT re-run in Plan-Mode — defer to gate stash-bisect; flag only on NEW red) |

## Table 2 — Cited line-number deltas

| Anchor | Spec line | Actual | Δ |
|---|---|---|---|
| exchange-universe getExchangeTopAssetsWithVolume | 208 | 208 | 0 |
| license trackCall / trackCallByKey | 375 / 424 | 375 / 424 | 0 / 0 |
| license checkQuota / checkQuotaByKey | 340 / 409 | 340 / 409 | 0 / 0 |
| license getFundingArbLimit | 231 | 231 | 0 |
| get-trade-call getTradeSignal | 79 | 79 | 0 |
| get-trade-call HOLDs-free | 403 | ~403 (comment) / ~405 (call) | 0 |
| cross-asset-grid GRID_CONCURRENCY | 71 | 71 | 0 |
| webhook-events subscriptionMatches | 158 | 158 | 0 |
| webhooks-store WebhookEventData.exchange | 36-50 | 40 | in-range |
| result-cache ResultCache | 19 | 19 | 0 |
| types TradeCallResult | 241 | 241 | 0 |
| scan-funding-arb _algovault | 336 | 336 | 0 |

**Zero mismatches ≥10 lines. (CLAUDE.md HALT threshold = ≥3 mismatches; we have 0.)** Spec line numbers are byte-current against `524ace72` — this prompt was authored against live `origin/main`.

## Table 3 — Identifier diff (R-section ↔ AC-section)

| Identifier | R-section | AC-section | Consistent? |
|---|---|---|---|
| exchange enum | promoted-5 `['BINANCE','HL','BYBIT','OKX','BITGET']` (C3 R2) | "enum 5 venues" (AC1) | ✅ |
| topN range | int 1-100 default 20 (C3 R2) | topN 1-100 (AC1); smoke topN:10 (AC2) | ✅ (topN=universe size ≠ `limit`=output cap, default 10) |
| snapshot TTL | `SCAN_SNAPSHOT_TTL_SEC` default 60 (C2/C3) | "warm <2s within 60s" (AC2) | ✅ |
| concurrency | `SCAN_CONCURRENCY` default 6 = GRID_CONCURRENCY (C2) | — | ✅ (GRID_CONCURRENCY live =6) |
| units charged | `max(1, eligible_non_hold_returned)` (C3 R3); fixture 3BUY+2SELL+95HOLD limit10 → 5 (C3 R5) | drawdown == `max(1, non-HOLD returned)` (AC2) | ✅ |
| webhook token | `/^top:([1-9][0-9]?|100)$/` (C4 R1) | `top:25`→201, `top:101`→4xx (AC4) | ✅ (regex bounds 1-100) |
| tools/list | 6→7 (C3, §1) | 7 tools (AC1/AC5) | ✅ (live count 6 confirmed) |
| forbidden keys | C2 R3 `{outcome_return_pct, outcome_price, price_at_signal, reasoning}`; C3 R4 adds `indicators`; AC3 regex `(outcome_return_pct|outcome_price|price_at_signal)` | — | ⚠️ set differs by section → **resolve to UNION** `{outcome_return_pct, outcome_price, price_at_signal, reasoning, indicators}` for snapshot `forbidden_keys`; AC3 regex is the live-gate subset |

---

## Corrections to carry into C1–C4 (fact-honest; flag in status.md)

- **DRIFT-1 — `zod` not a direct dep.** It resolves transitively (`@anthropic-ai/sdk → zod@3.25.76`) and is already imported at `index.ts:15`. **No dep add needed; "no new npm deps" intent holds.** Latent fragility (a future SDK bump could drop transitive zod) → WIS follow-up candidate "promote zod to a direct dependency" — out of this wave's scope (and `package.json` deps edit is outside C1–C4 MAY-write sets).
- **DRIFT-2 — `deploy.yml` `paths-ignore` does NOT include `audits/**`/`docs/**`/`*.md`.** Live list = `activation-funnel/snapshots/**`, `activation-funnel/README.md`, `ops/systemd/**`, `ops/monitoring/**` only. ⇒ The C3/C4 `audits/*.json` shape snapshots **ride the code commit and trigger a Hetzner deploy** (acceptable — those chapters ship code anyway). This `endpoint-truth.md` is written **untracked** (no deploy until pushed). The generic CLAUDE.md `paths-ignore` line is wrong for this repo.
- **DRIFT-3 — `core.hooksPath` is unset in this clone.** AOE pre-push protection inactive. **Resolution:** run `git config --local core.hooksPath hooks` before the first push (CLAUDE.md AOE rule). Will do at C1 R-step.
- **DRIFT-4 — "after Tool 3 block" placement.** By registration order Tool 3 = `scan_funding_arb` (L335-377). The §2 ASCII "3 MCP tools" is a curated signal-tool subset, ≠ tools/list total (6). New `server.tool('scan_trade_calls', …)` placed adjacent to `scan_funding_arb`; live count 6→7. Anchor the C3 grep-gate on the NAME `scan_trade_calls`, not the literal `^7$` (spec already allows this).
- **DRIFT-5 — free-key literal** `free:${getRequestIpHash() || 'anon'}` (spec wrote `free:${ipHash}`). Cosmetic.
- **DRIFT-6 — 4 untracked leftover artifacts** in the working tree (`.x402-mainnet-bootstrap.cjs`, `audits/NPM-PUBLISH-v1.19.0-W1-endpoint-truth.md`, `audits/NPM-PUBLISH-v1.19.1-W1-endpoint-truth.md`, `audits/chatgpt-app-directory-submission-package.md`). **None overlap C1–C4 scope** (license/scanner/index/tool-descriptions/webhook files) → NOT a clean-baseline HALT. Leave them in place (prior-wave residue); per-file `git add` keeps them out of every commit.
- **DRIFT-7 — §2 ASCII line says "3 MCP tools"** (subset). Update additively `3 → 4` + append ` / scan_trade_calls` at `system-map.md:202` in C3's commit. Do NOT touch the tools/list total semantics.

## Design decision for architect (D1)

- **D1 — `subscriptionMatches` is synchronous; `top:N` resolution needs `getTopCoinSet` (async).** Spec offers: (a) make `subscriptionMatches` async, or (b) pre-resolve the top-set in `onSignalRecorded` before the match loop. **Recommendation: (b) pre-resolve.** `subscriptionMatches` is a hot per-subscription predicate called in a loop (`webhook-events.ts:186`); making it async forces an `await` per subscription per event. Instead, in `onSignalRecorded` (already async), collect the distinct `N`s referenced by any active sub for `ev.data.exchange`, resolve each once via `getTopCoinSet(ev.data.exchange, N)` into a `Map<number, Set<string>>` (fail-quiet on error → empty set → token non-matching, NO delivery storm, NO alert), and pass that map into the now-still-sync matcher. One resolve per (exchange, N) per event vs N awaits. Plain-coin matching stays byte-identical. **Architect: confirm (b), or override to (a).**

## Scope / edge / CPU recap

- **Edges (per §"Map Anchor"):** (1) NEW MCP tool row `scan_trade_calls` + §2 ASCII 3→4 (C3); (2) MUTATED additive `POST /api/webhooks` `assets[]` `top:N` token (C4); (3) NEW internal consume edge `trade-call-scanner → exchange-universe` (annotate in C3 commit); (4) quota `units` = internal, no edge. C1/C2 internal-only.
- **CPU headroom:** seed crons fan out top-50 (5m ×5 venues /5min) + top-100 (15m ×5 venues /15min). Scanner fan-out (topN≤100, `pLimit(6)`, `internal:true`, 60s snapshot cache + coalescing + 30s deadline) is comparable-and-bounded; cold topN=100 scan is the worst case. Baseline <60% norm → ship; verify via post-deploy CPU gate (AC, no new alert).
- **Release coupling:** NONE (code wave). No version bump / CHANGELOG heading / `mcp-publisher publish` / Discussion / X. `status.md` (vault root) + `system-map.md` (vault root) updates do NOT deploy.

## Probe commands (reproducible)

`git -C $REPO fetch origin main && [ HEAD == origin/main ]` ✅ · `grep -nE` on every anchor above ·
`npm ls zod` (transitive) · `node -e package.json` (p-limit/zod/test) · `Dockerfile:23` ·
`ssh root@204.168.185.24 'cat /proc/loadavg; docker stats --no-stream; crontab -l | grep seed'` ·
`grep -n` §2 ASCII `system-map.md:202`. Full-suite NOT re-run (deferred to gate per spec).
