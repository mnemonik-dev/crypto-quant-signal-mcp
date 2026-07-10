# FUNNEL-FIX-ATTRIBUTION-W1 — audit (R1) + classifier design + stateless proof + HALT

**Probed:** 2026-07-10 UTC · **Mode:** AUDIT-FIRST · ADDITIVE (no paid-path mutation) · MCP tools/list FROZEN · stateless-resolver-safe.
**Design SoT:** `Attribution-Fix-explainer.html` (vault root). **Companion:** [`FUNNEL-FIX-ATTRIBUTION-W1-endpoint-truth.md`](FUNNEL-FIX-ATTRIBUTION-W1-endpoint-truth.md).

**Bottom line:** This is a genuine **generator fix that EXTENDS existing infra**, not a rebuild. The classifier (`resolveSource`), the enum SoT (`ATTRIBUTION_SOURCES`), the per-session capture (`mcp_connect` + `shouldEmitConnect`), and the `/dashboard/funnel` channel consumers ALL already exist. Three real gaps produce the 96%-"direct": (1) the UA map has only 2 rows (chatgpt/claude) — **most LLM clients deliberately resolve to `unknown`**; (2) the `Referer` slot is accepted but **unused**; (3) there's **no durable first-touch stamp** on the identity, so classification doesn't survive to conversion, and the web/HTTP surfaces don't capture at all. The stateless resolver is pure and stays byte-unchanged. **6 architect decisions in the fenced block.**

## Stateless-safety proof (AC4 — the headline guardrail)
`resolveSessionIdentity(headers, ipHash, makeUuid)` (`track-token.ts:148`) is a **pure function**: `id = token ?? ipHash ?? uuid`; `tier = token|fallback|anon`. No session store, no map, no affinity, no sticky routing. **This wave adds a classifier that reads the same request headers and writes a write-once source stamp keyed by `session_identity.id` — it never calls into, wraps, or mutates `resolveSessionIdentity`, and adds no in-memory session state.** AC4 proof plan: (a) `resolveSessionIdentity` byte-identical `git diff`; (b) a grep-canary asserting no new `Map<sessionId,...>`/sticky state on the request path; (c) quota still `free:${ipHash}`-keyed.

## Data map (extend-not-rebuild)
- **Classifier** (`resolveSource` → `classifySource`): precedence **(1) `?src=`/utm/ref (enum, deterministic) → (2) Referer domain parse [NEW — the reserved slot] → (3) LLM-client UA map [EXTENDED] → (4) `direct`/`unknown` default-deny**. Returns `{source, medium, confidence}`. Never fabricates.
- **LLM-client map** (`src/attribution/llm-clients.ts`, NEW): UA/host → client, seeded (claude, cursor, windsurf, cline, …); add-a-row extensible; unit-tested vs real sample UAs.
- **First-touch stamp** (R4): write-once `first_touch_source` (+ `last_touch_source`) on the identity (Q1) via the shared resolver id; idempotent; survives the stateless path + the OAuth-redirect/key-merge that `FUNNEL-FIX-HUMAN-SIGNUP-W1` already preserves `?src` through.
- **Consumers**: `/dashboard/funnel` `retention.by_channel` + `human/agent by_channel` (live) + a NEW dedicated source-classified panel (R6, per the explainer "After" view) with coverage % + n<30 flags, per-window.
- **EMIT** (R5): UTM-tag owned outbound (README/landing/X/registry) via `taggedLink()` + the editorial pipeline; a canary proves NO internal link is tagged.

## Coverage reality (record, don't promise)
First-touch is **new-traffic-forward, not retroactive** — the existing ~96%-direct history is frozen; only post-deploy hits get classified. Research projection: ~96% direct → **~50–70% recoverable**, with **~10–20% genuine direct-residual** (typed URLs / stripped referrers). The panel shows a live **coverage %** (classified vs direct/unknown residual); the projection is a measurement, not a guarantee.

## Firewall / scope
Request-path classifier + additive columns + `/dashboard/funnel` render + owned-link tags + tests. **No** `server.tool`/registry/envelope/version change → `tools/list` stays 9. No public track-record copy. system-map: additive columns + classifier edge → component-card row + `Last touched:` (Y) at build time.

---

## HALT — architect (Mr.1) ratification required before any build

```
FUNNEL-FIX-ATTRIBUTION-W1 — Plan-Mode HALT (6 decisions). Probed live 2026-07-10.
Audit: audits/FUNNEL-FIX-ATTRIBUTION-W1-audit.md (+ endpoint-truth.md). Classifier EXTENDS the
existing attribution-sources.ts; stateless resolveSessionIdentity stays byte-unchanged.

Q1 [first-touch stamp target]. agent_sessions (keyed by the resolver id) has no source column.
     (a) [rec] ADD first_touch_source + last_touch_source columns on agent_sessions (write-once
         first; info_schema/PRAGMA pre-check — no ADD COLUMN IF NOT EXISTS on SQLite);
     (b) a new source_attribution table keyed by session_id/track-token;
     (c) reuse the first mcp_connect src only (no durable last-touch, no cross-surface).
   Which? (rec a — reuses the identity, idempotent, no new table.)

Q2 [LLM-client classification = POLICY CHANGE]. Today most MCP clients resolve to 'unknown' BY
     DESIGN. The spec wants them classified (the "big unlock"). Confirm ADDING these to
     ATTRIBUTION_SOURCES + the UA map (seed): cursor · windsurf · cline · continue · zed ·
     vscode/copilot · (keep chatgpt/claude). Any to drop/add? (These become channels, not just
     clients.)

Q3 [Referer domain → source map]. Wire the reserved referer slot. Proposed:
     x.com/twitter.com→x · github.com→github · npmjs.com→npm · dev.to→devto(NEW) ·
     smithery/glama/pulsemcp/mcp.so→their slugs · google/bing→organic(NEW) · reddit.com→reddit(NEW).
     Confirm the map + which NEW enum slugs to add (devto/organic/reddit?).

Q4 [UTM taxonomy + which owned surfaces first]. Canonical lowercase scheme, e.g.
     utm_source=<channel> · utm_medium=<listing|launch|post|bio> · optional utm_campaign.
     Confirm the taxonomy + the first owned surfaces to tag (README, landing footer, X bio,
     registry listing URLs). NEVER tag internal links.

Q5 ['direct' vs 'unknown' terminal]. The enum uses 'unknown' as the default-deny terminal (NOT
     'direct'). The explainer panel says "genuine direct-residual". Reconcile:
     (a) [rec] keep 'unknown' as the honest terminal; the panel labels the residual
         "direct/unknown (unclassified)"; do NOT invent a 'direct' that implies typed-URL when
         it's really stripped-referrer.
     (b) split into 'direct' (no referrer, genuine) vs 'unknown'. Which?

Q6 [scope confirm]. Retroactive backfill = NO (new-traffic-forward; history frozen). Panel shows
     coverage % + the ~50–70%-recoverable projection as a MEASUREMENT. Web-analytics (Plausible)
     stays deferred (1K-visitors/mo trigger). Confirm.
```

**Until Mr.1 answers: NO code, NO commit, NO deploy.** Only these 2 audit artifacts exist (uncommitted, in the `funnel-fix-attribution` worktree). On ratification: R2 (classifySource) → R3 (llm-clients map) → R4 (first-touch stamp) → R5 (owned-link tags) → R6 (dedicated panel + close-out), with the stateless-safety proof as the gating AC.
