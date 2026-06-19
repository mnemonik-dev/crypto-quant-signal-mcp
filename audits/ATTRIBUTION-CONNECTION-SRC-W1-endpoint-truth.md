# ATTRIBUTION-CONNECTION-SRC-W1 — Step-0 endpoint-truth

**Wave:** ATTRIBUTION-CONNECTION-SRC-W1 (META ICP — cache-safe per-channel source attribution at the MCP connection layer)
**Mode:** Plan Mode Step-0 (REQUIRED). Produced BEFORE any edit. **Disposition: HALT'd on a false spec premise + structural-coverage limit + release-staging → RATIFIED by Cowork (A1–A4 below); proceeding.**
**Date:** 2026-06-19
**Code base:** isolated worktree `~/code/cqsm-wt-attribution-src` on branch `ops/attribution-connection-src-w1`, off **origin/main `11ad085`** (the deployed canonical — local `main` was 9 commits behind, and those 9 [LANDING-CONVERSION-TRUST-W1 / OPS-VITEST-SUITE-REPAIR-W1 / OPS-CADDY-ROUTE-PARITY-W1] touched my exact targets `src/index.ts` +84/-31 and `src/lib/funnel-snapshot.ts` +14, so building on local main would have been stale).
**Probe method:** live grep of committed source (NOT the vault mirror) + git pickaxe/log + read of the prior wave's own endpoint-truth + funnel/migration schema reads + a live prod `tools/list` handshake.

---

## Step 0 — system-map edge-touch enumeration

**One NEW producer→consumer edge:** `/mcp connect → funnel_events('mcp_connect', meta.source/source_confidence) → /api/admin/funnel-snapshot.by_source`. No new MCP tool, no tools-list change, no new public endpoint, no cron, no migration (`funnel_events` already exists; `meta_json` TEXT). `system-map.md updated: Y`.

---

## R5(a) — `/mcp` connect handler + shared session resolver (claim | reality)

| Claim | Reality (evidence) | Resolution |
|---|---|---|
| middleware on `/mcp` can read `?src=` | `app.all('/mcp', express.json(), …)` @ `src/index.ts:2320`. Express auto-parses → `req.query.src` (no new middleware). | Read `req.query.src` (+ UA/Origin/Referer) at the top of the handler, beside the existing skill-slug + track-token captures. |
| a shared session_id resolver exists | `resolveSessionCorrelationId(headers, ipHash)` @ `src/index.ts:303` → `trackToken ?? ipHash ?? randomUUID()`; already computed as `sessionId` @ `src/index.ts:2360`. | REUSE verbatim. The connect emit reads the SAME `sessionId` local (single-derivation). |
| log ONE deduped `mcp_connect` per session | `recordFunnelEvent({eventType,sessionId,licenseTier,meta})` @ `src/lib/performance-db.ts:1007`; dedup primitive `shouldEmitForRequest` LRU @ `src/lib/track-token.ts:129`. | Mirror the LRU (`shouldEmitConnect`, key=sessionId) in the new SoT; emit on first POST/session, `tier!=='internal'` excluded (mirrors the 2 existing emits). |
| response + tools/list byte-unchanged | emit is fire-and-forget BEFORE `requestContext.run`; never touches transport / envelope / tool registration. | Observational only. Live prod `tools/list` baseline = **9 tools, ZERO attribution tokens**; registration is static (`DESCRIPTIONS[f.descriptionRef]`, no interpolation) → post-change tools/list is byte-identical by construction. |

---

## R5(b) — stateless-safety of per-request `?src=` dedupe

STATELESS confirmed (`MCP_STATELESS` default true → `handleMcpStateless`, fresh server+transport/POST). `?src=` rides every POST → the shared `sessionId` (stable per client) + the in-memory LRU dedup to ONE `mcp_connect`. ipHash is effectively always present behind Caddy, so the `randomUUID()` no-dedup path is the documented rare case (identical to the existing track-token/skill emits). Cross-process dupes collapse under the snapshot's `COUNT(DISTINCT session_id)`.

---

## R5(c) — OPS-TRACK-TOKEN remnants + the ACTUAL removal reason  ·  ⚠️ FACTUAL CORRECTION (A1-ratified)

The Objective's "removed because it lived in the MCP **tools-list**, forcing per-version refresh" is **FALSE**. Git + the project's own system-map prove:
- `43f1bde` — server-side `X-AlgoVault-Track-Token` **header** (+ argv) capture (TG-BROADCAST CH6). **STILL LIVE.** Never in the tools-list.
- `e1de368` (OPS-TRACK-TOKEN-STDIO-CLIENT-WRAPPER-W1) — embedded that **header** in install snippets. system-map line 113: *"Dropped the `landing` slug (hero shows local stdio = zero outbound, unattributable)."*
- `a932333` — stripped the header **from the README only**; it still rides `mcp-clients.ts`, `email.ts`, `welcome-page.ts`, the 4 integration `.md`, `landing/docs.html`.

**Real wall (carries to `?src=`):** `?src=` lives in the connection URL → captured ONLY for **remote-HTTP** clients. **local-stdio (`npx`) makes no call to api.algovault.com → the `npm` channel is connect-uncapturable** (same wall as the header). **REUSE:** the resolver, the LRU dedup pattern, `recordFunnelEvent`, the `funnel-by-channel.mjs` `::jsonb`-cast lesson. **RETIRE:** nothing — there was nothing in the tools-list. HARD constraint satisfied by construction.

**A1 (Cowork):** RATIFIED — proceed with `?src=` as designed; record the corrected rationale in status.md/WIS; drop the tools-list framing (an unverified recollection).

---

## R5(d) — `?src=` / `?ref=` / track-token coexistence (A4)

- `?ref=` (REFERRAL-LIGHT) — NOT shipped (zero `referral`/`req.query.ref` in `src/`). Independent query key when it lands → no collision.
- track-token — `X-AlgoVault-Track-Token` header/argv; the resolver consumes it for the *session id*, `?src=` is the *source*. Orthogonal.
- `utm_source` — web `signup_attribution` (migration 011), a different surface. No collision.
- Parse independently, default-deny `?src` against the SoT enum.

---

## R5(e) — funnel + `by_source` feasibility

`funnel_events.meta_json` is **TEXT** → JS-side parse (portable; no backend-specific JSON SQL; tests run SQLite). Conversion keys on session_id: `paid_upgrade` = agent_sessions `tiers_seen LIKE` paid; `first_call` = agent_sessions presence. `by_source` groups `mcp_connect` by `meta.source`, deduped by session_id, intersecting the agent_sessions first-call/paid sets (single-derivation; same definitions). Additive top-level field; `mcp_connect` NOT added to the frozen `CANONICAL_STAGE_ORDER` → 14-stage funnel + 13 `stage_retentions` byte-stable.

---

## R5(f) — tools/list byte-cleanliness (the cache-safe guarantee)

Live prod handshake (2026-06-19): `tools/list` = **9 tools** (`get_trade_call, get_trade_signal, get_market_regime, scan_funding_arb, scan_trade_calls, get_equity_call, get_equity_regime, chat_knowledge, search_knowledge`), attribution-token scan (`?src=|track|attribution|utm`) = **false**. Registration is static (`feature-registry.ts:212`, no interpolation). The change adds NOTHING to registration → **byte-identical by construction**. Post-deploy gate: re-handshake + assert byte-identical + zero attribution tokens.

---

## Identifier diff (slugs · param · event_type · snapshot field)

| Identifier | Spec | Decision (A-ratified) |
|---|---|---|
| Query param | `?src=` | `req.query.src` (Express auto-parse) |
| Slug enum | 16 incl. `direct` | **15** — `direct` **DROPPED** (A4: untagged → `unknown`); `npm` kept as connect-uncapturable placeholder. NO 8-char floor (validated against the closed enum, not the token regex). SoT `src/lib/attribution-sources.ts`. |
| Confidence | deterministic/heuristic/unknown | `source_confidence` in meta_json |
| Funnel event_type | `mcp_connect` | NEW; no collision; non-stage |
| Snapshot field | `by_source` | NEW additive TOP-LEVEL array (connects/deterministic/first_call/conversion); funnel=19 + retentions=13 byte-stable |

---

## Coverage (A2) — `?src=` deterministic vs uncapturable

Remote-HTTP (default transport) = fully `?src=`-capturable (ChatGPT/Claude connectors, registries pointing at the remote URL, docs/README one-liners, framework packages). **`npm`/stdio = uncapturable at connect** (no api.algovault.com call; no UA heuristic). **A2 (Cowork):** keep `npm` in the enum, documented; do NOT claim per-session npm coverage in R4; npm channel VOLUME via npm registry download stats (aggregate). Only local-stdio is blind.

---

## Cowork ratification (A1–A4, 2026-06-19)

- **A1** premise correction RATIFIED — proceed; corrected rationale → status.md/WIS; drop tools-list framing.
- **A2** `npm` = connect-uncapturable placeholder; npm-stats for volume; remote-HTTP fully captured.
- **A3** R4 split APPROVED (NOW=in-repo non-versioned · STAGE=versioned README/server.json/manifests/registry-descriptions · MANUAL=external dashboards). Landing touches: Design.md + live-committed-source verify + dual-render; `?src=` is a functional URL param (no heavy copy pre-flag).
- **A4** slug map APPROVED with tweaks: README→`github`; untagged→`unknown` (drop `direct`); X/social→`x`; ADD framework packages agentkit/elizaos/llamahub (wire `?src=` into each package's remote URL — cross-repo); rest per list.

Wiring map: `audits/ATTRIBUTION-CONNECTION-SRC-W1-listing-wiring.md`.
