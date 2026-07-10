# FUNNEL-FIX-ATTRIBUTION-W1 — endpoint-truth (Plan-Mode Step 0, read-only)

**Probed:** 2026-07-10 UTC · **Repo:** worktree `funnel-fix-attribution` @ `origin/main` `5c229b7`. **Mode:** AUDIT-FIRST · read-only. **Touches the shared request path + session resolver (stateless landmine) — nothing changes until Mr.1 ratifies. HALT after this.**

Format: `claim | reality (live/code) | resolution`.

## A. The STATELESS session resolver (the landmine — AC4)

| # | claim | reality | resolution |
|---|-------|---------|------------|
| A1 | shared resolver `X-AlgoVault-Track-Token ?? ipHash ?? randomUUID()` | `track-token.ts:148` `resolveSessionIdentity(headers, ipHash, makeUuid=randomUUID)` → `token→{id,tier:'token'}` · `ipHash→{id,tier:'fallback'}` · else `{id:uuid,tier:'anon'}`. **PURE — no session store, no affinity, no sticky state.** `makeUuid` injectable (test seam). | **DO NOT touch it.** The classifier reads the SAME headers additively + stamps a source; it NEVER modifies the resolver. AC4 = `resolveSessionIdentity` byte-unchanged + grep proves no new session state; quota stays `free:${ipHash}`-keyed. |

## B. The classifier — EXTEND, not rebuild (R2/R3)

| # | primitive | reality (`src/lib/attribution-sources.ts`) | resolution |
|---|-----------|--------------------------------------------|------------|
| B1 | source classifier | `resolveSource({src, ua, origin, referer})` — precedence: `?src=`(enum)→`deterministic` · UA heuristic→`heuristic` · else `unknown` (default-deny, NOT "direct"). Returns `{source, source_confidence}`. | **Extend** → `classifySource()` adds a **Referer domain parse** (step 2) + returns `{source, medium, confidence}`. |
| B2 | `referer` today | **accepted but UNUSED** — "reserved for future heuristics; no current rule consumes them" (line 106-107). | The Referer parse is the reserved slot — wire it in (Q3). |
| B3 | UA heuristics | `UA_HEURISTICS` = **only** `chatgpt`, `claude` (2 rows). Comment: "most MCP clients (Cursor, Cline, Windsurf) … resolve to `unknown` DELIBERATELY". | **Policy change (Q2):** the spec's "LLM-client classification is the big unlock" → ADD cursor/windsurf/cline/… to `ATTRIBUTION_SOURCES` + `UA_HEURISTICS`. `src/attribution/llm-clients.ts` = the extensible map. |
| B4 | enum SoT | `ATTRIBUTION_SOURCES` = 15 slugs (chatgpt, claude, smithery, glama, pulsemcp, mcp_so, bazaar, agentkit, elizaos, llamahub, npm, github, docs, x, unknown). `unknown` = default-deny terminal. | New sources = enum rows (Q2/Q3). Keep default-deny to `unknown` (never fabricate). |
| B5 | capture hook | `src/index.ts:3107` `resolveSource({...})` inside the **mcp_connect emit** (`shouldEmitConnect` → one connect per session). | The MCP capture EXISTS (first connect = first-touch src in `funnel_events.meta_json`); it's just WEAK (mostly `unknown`). Extend here + stamp durably (Q1). |

## C. Per-surface classifiability (what's available to classify on)

| surface | signals available | captured today? |
|---|---|---|
| **MCP** (`/mcp`) | `X-AlgoVault-Track-Token`, `?src=` on the connect URL, `User-Agent`, `Origin`/`Referer` headers | ✅ `?src=`+UA via mcp_connect (weak). Referer available, unused. |
| **TG bot** | internal-bypass (one `internal` identity); channel via the bot's own attribution | limited (bot is a single identity) |
| **raw API / HTTP** | `Referer`, `User-Agent`, `?src=` | ❌ not captured (no mcp_connect on the HTTP path) — a gap the classifier can close |
| **webhooks** | owner API key | N/A (not an acquisition surface) |
| **web** (`/signup`,`/welcome`,`/api/signup-email`,`/api/start-free`) | `?src/utm/ref` query, `Referer`, `User-Agent` | `?src/utm` captured at `/signup` + now `start-free`; **`Referer` NOT parsed** anywhere |

## D. First-touch stamp target (R4) + consumers

| # | primitive | reality | resolution |
|---|-----------|---------|------------|
| D1 | stamp target | `agent_sessions` (keyed by the resolver `session_id`) has `first_seen/last_seen/call_count/tools_used/tiers_seen/first_tool/first_tier/ip_hash_first` — **NO source column**. | **Q1:** (a) [rec] ADD `first_touch_source` + `last_touch_source` columns on `agent_sessions` (write-once first; `information_schema`/PRAGMA pre-check per CLAUDE.md — SQLite has no `ADD COLUMN IF NOT EXISTS`), OR (b) a new `source_attribution` table keyed by session_id, OR (c) reuse the first `mcp_connect` src only. |
| D2 | consumers (already live) | `/dashboard/funnel`: `retention.by_channel` (mcp_connect `?src=`), `human_funnel.by_channel` (`signup_attribution.channel`), agent channel. | R6 feeds `classifySource()` into these + adds a **dedicated source-classified panel** (per `Attribution-Fix-explainer.html` "After" view) with coverage % + n<30 flags. |
| D3 | design SoT | `Attribution-Fix-explainer.html` (vault root, 11KB) present. | R6 build reference. |

## E. EMIT side (R5) — owned-link inventory + guard

| # | primitive | reality | resolution |
|---|-----------|---------|------------|
| E1 | owned links | `README.md` (39 `algovault.com` refs), `landing/index.html` (31). X bio / dev.to / Discussions / registry listings external. | UTM-tag OWNED OUTBOUND only (canonical lowercase taxonomy, Q4) + a `taggedLink(url, channel)` helper wired into the editorial pipeline. **NEVER tag internal links** (canary/grep guard — internal link tagging overwrites first-touch). |

## F. Firewall / system-map
`tools/list` = 9 (attribution is request-path + HTTP/DB — no tool surface). AC5 asserts byte-identical. **system-map:** likely `+ first_touch_source/last_touch_source` on `agent_sessions` + the classifier extension (internal edges) → edit the component-card row + overwrite `Last touched:` same commit; the `/dashboard/funnel` consumer already exists. Determined from the ratified Q1 design.
