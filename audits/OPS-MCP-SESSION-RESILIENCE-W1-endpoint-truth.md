# OPS-MCP-SESSION-RESILIENCE-W1 — Plan-Mode endpoint-truth

**Date:** 2026-06-09 · **Repo:** `crypto-quant-signal-mcp` @ origin/main `bce4c05` (**v1.20.1**) · **SDK:** validated on **lockfile-pinned 1.29.0 (range `^1.12.1`)** — `npm ci` ships 1.29.0 · **Probed:** read-only (curl live + local SDK spike + grep).

**VERDICT: PROCEED (architect-approved 2026-06-09).** Load-bearing premise CONFIRMED on the shipping SDK. **0 fictional primitives.** 3 anchor drifts corrected inline. 1 architect-confirm resolved → **A1 = Option B**.

---

## A. Primitive probes — `claim | reality | resolution`

| # | Claim | Reality (probed) | Resolution |
|---|---|---|---|
| 1 **[LOAD-BEARING]** | stateless `tools/call` with no `initialize` returns a result, not `-32000` | SDK-1.29.0 spike: bare `tools/call` → **200 + result**; stale id → **200** (ignored); GET → **405**; no `mcp-session-id` | **CONFIRMED ✅** |
| 2 | SDK `1.12.1` | declared `^1.12.1`; **installed + lockfile + npm-latest = 1.29.0**; `npm ci` ships it | **A2 (architect): proceed on 1.29.0, NO dep/pin/range change.** `^1.12.1` already admits 1.29.0; premise validated on the shipping version. Doc-only note. |
| 3 | server `1.20.0` | local + origin/main + live = **1.20.1** | drift; no version anchor in fix. |
| 4 | unknown-session error code | live `tools/call` + random id → **HTTP 400 / `-32000 "Bad Request: Server not initialized"`** | AC1 "before" baseline. |
| 5 | anchors ~965/966/967/282/954 | `transports` **L961**, `sessionLastActivity` **L962**, `SESSION_TTL_MS=30*60*1000` **L963**, reaper **L966**, `createServer` **L278**, CORS **L950** | confirmed (<3 mismatch). |
| 6 | handler "below L1911" | `app.all('/mcp', express.json(), …)` **L2175**; ALS `requestContext.run({license,sessionId,ipHash})` **L2266**; GET **L2298** / DELETE **L2309** / POST **L2322**; shutdown `clearInterval` **L2424** | located. |
| 7 | `createServer()` closures only | L278 `new McpServer` + registry loop; `initAnalytics`/`initQuotaDb` at **L933-934 startHttp** (not in createServer) | per-request createServer = µs. **AC5 holds.** |
| 8 | `MCP_STATELESS` flag | absent (new) | added; default-on stateless, `=0` → stateful else-branch. |
| 9 | `tools/list`=9 | live = **9** | AC4 baseline locked. |
| 10 | `redis` unused | declared, **not imported in index.ts** | no store added. |
| 11 | initialize issues session id (stateful) | live → `mcp-session-id` present | AC2 = post-change none. |
| 12 | quota `ipHash`-keyed, session-independent | `ipHash=hashIp(...)` L2210 → ALS L2266 | AC9 holds (R1 keeps ipHash in ALS). |

## B. Mutated edge (system-map)
`/mcp` Streamable-HTTP (producer) → external MCP clients (consumers). Session-management flips **stateful → stateless**. `tools/list`=9 + all response shapes UNCHANGED. All consumers **loose** on session-id (any/no id → call succeeds = the fix); tight on tools/list+shapes (unchanged). No consumer breaks.

## C. Architect-confirm — RESOLVED (A1 = Option B)
Single shared resolver (single-derivation), used by `recordFunnelEvent` (L2247) AND the per-tool cohort sites via the ALS:
`sessionId = X-AlgoVault-Track-Token ?? ipHash ?? randomUUID()` (hardened never-null/empty).
- track-token → preserves per-(session,track_token) funnel dedup for tagged callers
- ipHash → stable per-client, = the `free:${ipHash}` quota id (one identity across quota + funnel); no DISTINCT-session collapse, no UUID inflation
- uuid → only if both absent (rare behind Caddy)
**Analytics-continuity (not a blocker):** `COUNT(DISTINCT session_id)` shifts per-connection → per-client/IP at cutover (more stable than the old model, which counted every reconnect — incl. this bug — as a new session). Flag the cutover date as a boundary for ACTIVATION-FUNNEL-AUDIT / SUBSCRIBER-ATTRIBUTION dashboards; **do NOT backfill historical rows.**

## D. Scope firewall (confirmed)
`src/index.ts` + 1 new `tests/ops-mcp-session-resilience-w1.test.ts` + 1 `scripts/check-mcp-stateless.mjs` canary + (vault) CLAUDE.md Build-rule + status.md/system-map. `src/`-only → no Dockerfile/`deploy.yml` change. **No version bump.** Tool handlers / shapes / `resolveLicense`+x402 / CORS / header interceptors untouched.

**A3 (architect):** GET/DELETE → `405 -32000 "Method not allowed."` (matches official SDK stateless example; no AlgoVault consumer uses MCP server→client push — webhook + Telegram own it).
