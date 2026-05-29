# OPS-TRACK-TOKEN-STDIO-CLIENT-WRAPPER-W1 — R0 endpoint-truth

**Wave:** OPS-TRACK-TOKEN-STDIO-CLIENT-WRAPPER-W1 (META ICP — channel-attribution via `X-AlgoVault-Track-Token`)
**Mode:** Plan Mode R0 (REQUIRED). Produced BEFORE any edit. **Disposition: HALT — architect ratification required (≥3 broken/fictional spec primitives).**
**Date:** 2026-05-29
**Code checkout:** `/Users/tank/crypto-quant-signal-mcp/` @ `c273550` (main, clean baseline; C6 = `43f1bde`)
**Probe method:** live grep of committed source (NOT vault mirror) + live curl + live `mcp-remote` bridge + live Path-α Postgres reads.

---

## Step 0 — system-map edge-touch enumeration

**NONE — internal-only.** The client→`X-AlgoVault-Track-Token`→`funnel_events` edge already exists from C6 (`43f1bde`). No new producer/consumer edge, MCP tool, postgres table/column, cron, or publish target. `system-map.md updated: n-a` + Last-touched row.

---

## R0(a) — LIVE install-snippet surface enumeration (claim | reality | resolution)

The spec's surface map is the **pre-refactor** model. DOCS-INTEGRATION-H2-W1 (2026-05-18) + INTEGRATIONS-FULL-STACK-W1 (2026-05-19) moved snippets into a **generator**. Live reality:

| # | Spec claim | Live reality (grep evidence) | Header-attachable? | Resolution |
|---|---|---|---|---|
| 1 | `src/lib/mcp-usage-docs.ts` holds the mcp-remote + headers-object blocks (served /docs page) | **FICTIONAL.** `mcp-usage-docs.ts` is now a 30-line renderer (`grep mcp-remote\|Authorization` → 0 hits). Snippets live in `src/lib/integrations-data/mcp-clients.ts` → `renderIntegrationH2` → `MCP_USAGE_HTML` → built into `landing/docs.html` by `scripts/build_landing.mjs` (BUILD:mcp-usage markers). | yes (4 of 6 entries) | Edit `integrations-data/mcp-clients.ts`; regenerate `landing/docs.html` via `npm run build:landing` (deploy.yml line 46 `build_landing.mjs --check` guard FAILS the deploy otherwise). |
| 2 | `landing/docs.html` is a distinct editable surface | **BUILD ARTIFACT** of #1. Hand-editing would be reverted by the next build + flagged by `--check`. | — | Do NOT hand-edit; flows from #1. Same logical channel as docs. |
| 3 | `landing/index.html` (hero/quickstart) carries an install snippet | **PRESENT but STDIO.** Block = `{"mcpServers":{"algovault":{"command":"npx","args":["-y","crypto-quant-signal-mcp"]}}}` — the LOCAL stdio install. Per the spec's own Shape Note, stdio makes **zero outbound call** to `api.algovault.com` → **no HTTP request to attach a header to.** React-rendered HTML (`tk-*` syntax spans + `<!-- -->` token separators); no JSX source / BUILD markers found → hand-maintained, fragile to edit. | **NO** | **BLOCKER — see Q2.** Cannot attribute a stdio block. Needs architect decision (drop `landing`, OR convert hero to the mcp-remote remote form, OR add a 2nd remote snippet). |
| 4 | `src/lib/email.ts` onboarding email install snippet | **PRESENT.** 2 headers-object blocks: `renderEmailHtml` line 240 + `renderEmailText` line 276 (`"headers":{"Authorization":"Bearer ${apiKey}"}`). PAID welcome email only (`sendWelcomeEmail`); the free-tier `sendOptinConfirmationEmail` has prose, no config block. | yes | Add `"X-AlgoVault-Track-Token":"<slug>"` to both headers objects. |
| 5 | `README.md` (npm + GitHub) install snippet | **PARTIAL.** The only JSON config block (line 434) is the **stdio** form (`TRANSPORT:stdio`, not attachable). The remote attach point is the `claude mcp add … https://api.algovault.com/mcp` one-liners (lines 71, 449). | one-liner only | Embed `--header "X-AlgoVault-Track-Token:<slug>"` on the `claude mcp add` one-liner(s). Confirm acceptable (Q6). README rides next daily RELEASE wave (npm), not this code wave's deploy concern. |
| 6 | `/integrations/<platform>` tutorials (generator-driven) | **SPLIT SOURCE.** Per-platform pages `landing/integrations/<slug>.html` render from **markdown** via `scripts/render-integrations.mjs` (NOT from `mcp-clients.ts`): **5 MCP-client pages** from in-repo `docs/integrations/mcp-clients/<slug>.md`; **8 exchange/framework pages** (binance/okx/bybit/bitget/langchain/llamaindex/maf/crewai) from the **EXTERNAL `~/git/algovault-skills` repo**. `mcp-clients.ts` feeds only `landing/docs.html` + the `/integrations` INDEX cards. | client pages: yes; exchange/fw: cross-repo | **Q3 scope decision.** In-repo MCP-client pages editable now; exchange/framework pages = cross-repo edit to `algovault-skills` + re-render. `smithery.md` = `@smithery/cli`, no attach point. |
| 7 | (not in spec) `src/lib/welcome-page.ts` `/welcome` page | **NEW SURFACE.** headers-object block line 151 (`"headers":{"Authorization":"Bearer ${apiKey||'YOUR_API_KEY'}"}`). Real free-tier landing (paywall CTA). | yes | **Q4** — recommend include. |

### Per-snippet anchors (header-attachable, in-repo)

| Surface | File | Anchor (unique substring) | Form |
|---|---|---|---|
| docs / Claude Desktop | `src/lib/integrations-data/mcp-clients.ts:52-53` | `"--header", "Authorization: Bearer \${AV_API_KEY}"` | mcp-remote args |
| docs / Cursor | `mcp-clients.ts:77-79` | `"Authorization": "Bearer \${env:AV_API_KEY}"` (cursor entry) | headers-object |
| docs / Cline | `mcp-clients.ts:102-104` | `"type": "streamableHttp"` block | headers-object |
| docs / Claude Code | `mcp-clients.ts:125-126` + `135-137` | `claude mcp add --transport http --scope project` + `"type": "http"` | one-liner + headers-object |
| docs / Claude Desktop free-tier prose | `mcp-clients.ts:58` | `Free tier: drop the <code class="text-xs">--header</code> args entirely.` | prose (update per AC3) |
| email html | `src/lib/email.ts:240` | `"headers": { "Authorization": "Bearer ${apiKey}" }` | headers-object |
| email text | `src/lib/email.ts:276` | `"headers": { "Authorization": "Bearer ${apiKey}" }` | headers-object |
| welcome page | `src/lib/welcome-page.ts:151-152` | `"headers": { "Authorization": "Bearer ${apiKey || 'YOUR_API_KEY'}" }` | headers-object |
| int-claude-desktop | `docs/integrations/mcp-clients/claude-desktop.md:20-21` | `"--header", "Authorization: Bearer ${AV_API_KEY}"` + `Free tier: drop the` (line 27) | mcp-remote args |
| int-cursor | `docs/integrations/mcp-clients/cursor.md:15-17` | `"Authorization": "Bearer ${env:AV_API_KEY}"` | headers-object |
| int-cline | `docs/integrations/mcp-clients/cline.md:16-18` | `"Authorization": "Bearer ${env:AV_API_KEY}"` | headers-object |
| int-claude-code | `docs/integrations/mcp-clients/claude-code.md:12-14` + `26-28` | `claude mcp add --transport http` + `"Authorization": "Bearer ${AV_API_KEY}"` | one-liner + headers-object |
| README remote | `README.md:71, 449` | `claude mcp add crypto-quant-signal https://api.algovault.com/mcp` | one-liner |

**Build/deploy wiring:** `npm run build:landing` (= `tsc && node scripts/build_landing.mjs`) regenerates `landing/docs.html`; deploy.yml line 46 runs `build_landing.mjs --check` (stale HTML = FAILED deploy). `node scripts/render-integrations.mjs` (manual; `--source ~/git/algovault-skills` default) regenerates ALL 17 `landing/integrations/*.html` (no `--check` guard). deploy.yml `paths-ignore` = only `activation-funnel/**` + `ops/systemd/**` → `src/**`, `docs/**`, `landing/**`, `*.md` all deploy-trigger.

---

## R0(b) — C6 middleware verification + live end-to-end test

**Read-path (grep `src/index.ts` + `src/lib/track-token.ts`):** CONFIRMED.
- `src/index.ts:1927-1946` — on `req.method==='POST'` + `body.method==='tools/call'` + `license.tier!=='internal'`, calls `resolveTrackTokenForRequest(req.headers)` → `extractHeaderTrackToken` reads `headers['x-algovault-track-token']` (Express lowercases). `shouldEmitForRequest` idempotent per `(session_id, token)`; first hit → `recordFunnelEvent({eventType:'first_tool_call_with_track_token', meta:{track_token, tool_name, source}})`. CORS allows `x-algovault-track-token` (`index.ts:800`).
- `src/lib/track-token.ts:102-108` — **`extractHeaderTrackToken` enforces `TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/`. Tokens < 8 chars return `null` → NO funnel row. SILENT.** ← root of Q1.

**Live end-to-end test (2026-05-29 ~10:59 UTC, prod `api.algovault.com/mcp`):**

| Test | Token (≥8) | Result | funnel_events row |
|---|---|---|---|
| Direct curl 3-step handshake (initialize→initialized→tools/call), header `X-AlgoVault-Track-Token: r0curltest01` | `r0curltest01` | tools/call HTTP 200 | id=1 `event_type=first_tool_call_with_track_token`, `license_tier=free`, `meta_json={"track_token":"r0curltest01","tool_name":"get_market_regime","source":"header"}` ✅ |
| **Real `mcp-remote` bridge** (`npx -y mcp-remote https://api.algovault.com/mcp --header "X-AlgoVault-Track-Token:r0bridgetest"`, stdio-driven initialize→initialized→tools/call) | `r0bridgetest` | mcp-remote logged `Using custom headers: {"X-AlgoVault-Track-Token":"r0bridgetest"}`; StreamableHTTP connect; tools/call returned real `get_market_regime` JSON | id=2 same shape, `source:"header"` ✅ |

**Verdict: the bridge path RECORDS. No R2 middleware patch needed.** Free-tier (unauthenticated) requests record (license_tier=free). Both synthetic probe rows DELETED post-test → `funnel_events` restored to 0 rows (clean baseline; my probe side-effect reverted).

## R0(c) — `mcp-remote` no-space form forwarding

CONFIRMED. `mcp-remote` parsed `--header "X-AlgoVault-Track-Token:r0bridgetest"` (no space after colon) into `{"X-AlgoVault-Track-Token":"r0bridgetest"}` and forwarded it on the upstream POST (server recorded `source:"header"`). No-space form is correct + Windows-safe.

## R0(d) — `funnel_events` shape + report-query correctness

Live `\d funnel_events`: `id serial PK, event_type text NOT NULL, ts timestamptz default now(), session_id text, chat_id bigint, license_tier text, meta_json text`. **`meta_json` is `text`, NOT `jsonb`** (`information_schema` data_type = `text`; `performance-db.ts:438` comment "meta_json is TEXT (portable across PG and SQLite)").

→ **The spec's R2 query is BROKEN as written.** Postgres `->>` / `?` operators require json/jsonb; on a `text` column they error. **Corrected query (verified live):**
```sql
SELECT meta_json::jsonb->>'track_token' AS channel,
       COUNT(DISTINCT session_id) AS installs
FROM funnel_events
WHERE meta_json::jsonb ? 'track_token'
GROUP BY 1 ORDER BY 2 DESC;
```
Ran live during the probe → returned `r0bridgetest:1`, `r0curltest01:1`. The `::jsonb` cast is mandatory. (`funnel-by-channel.mjs` will use the corrected form; fix-inline, not a blocker.)

## R0(e) — snapshot-landing-manifest collision

NO COLLISION. `scripts/snapshot-landing-manifest.json` rows (`dtrf-*`) target track-record NUMBER claims in `landing/index.html`, `how-it-works.html`, `skills.html`, `verify.html` — never `landing/docs.html` or `landing/integrations/*.html`, and match no `Track-Token`/`mcp-remote`/`mcpServers` literals. Our config-block edits are orthogonal. (Note: if Q2 resolves to editing `landing/index.html`, re-verify the `data-tr-field` number spans stay byte-stable.)

---

## R0(f) — Architect approval gate

**HALT.** ≥3 broken/fictional spec primitives (slug-length floor #Q1, landing stdio non-attachable #Q2, integrations split-source #Q3) + 1 broken report query (R0(d), fix-inline) + 1 new surface (#Q4). The 2026-05-29 public-copy pre-approval did not account for the 8-char `TOKEN_RE` floor or the external-repo integration pages. Per CLAUDE.md (`≥3 fictional primitives → HALT`) + Precedence rule 1 (Factuality) + rule 3 (Plan-Mode probes), **wait for architect ratification of the revised slug map + surface scope before R1.** Copy-paste Q-block for Cowork below.

### Proposed revised slug map (satisfies `/^[A-Za-z0-9_-]{8,64}$/`)

Recommended uniform `chan-<surface>` prefix (5-char prefix guarantees the 8-char floor for any ≥3-char suffix; greppable; no wave IDs; lowercase; hyphen-safe):

| Surface | Spec slug (chars) | Valid? | Proposed slug (chars) |
|---|---|---|---|
| docs page (`mcp-clients.ts`→`docs.html`) | `docs` (4) | ✗ | `chan-docs` (9) |
| email (`email.ts`) | `email` (5) | ✗ | `chan-email` (10) |
| welcome page (`welcome-page.ts`) | — (new) | — | `chan-welcome` (12) |
| README remote one-liner | `readme` (6) | ✗ | `chan-readme` (11) |
| landing hero | `landing` (7) | ✗ | `chan-landing` (12) — **only if Q2 makes it attachable** |
| int claude-desktop | `int-claude-desktop` (18) | ✓ | `int-claude-desktop` (keep) |
| int claude-code | `int-claude-code` (15) | ✓ | `int-claude-code` (keep) |
| int cursor | `int-cursor` (10) | ✓ | `int-cursor` (keep) |
| int cline | `int-cline` (9) | ✓ | `int-cline` (keep) |
| int okx (if in scope) | `int-okx` (7) | ✗ | `int-okx-page` (12) or `chan-int-okx` |
| int maf (if in scope) | `int-maf` (7) | ✗ | `int-maf-page` (12) or `chan-int-maf` |

(`int-binance/bybit/bitget/crewai/langchain/llamaindex` are already ≥8 ✓.)
