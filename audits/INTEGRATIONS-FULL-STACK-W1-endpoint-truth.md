# INTEGRATIONS-FULL-STACK-W1 — Step 0 Plan Mode Baseline Audit (2026-05-19)

**Wave:** `INTEGRATIONS-FULL-STACK-W1` (BUNDLED 6-chapter: C1 data layer + C2 docs.html Exchange Kit H3 + C3 /integrations restructure + C4 MCP-client plumbing + C5 5-page content + C6 cross-link sweep)
**Tier:** 2 Bulk-Spec · Plan Mode REQUIRED (4+ risk markers + concurrent KTW1 dep)
**Code's checkout (probed):** `/Users/tank/crypto-quant-signal-mcp/` ✓
**Repo branch:** `main` · **Working tree:** ⚠️ unstaged snapshot bump (`README.md` + `landing/index.html`, both `730+ → 740+` asset-count refresh — routine `<!-- SNAPSHOT-LINE -->` auto-marker output; **NOT a parallel-session bug**; commit separately before C1)
**Verdict:** 🛑 **HALT-CLASS** — same root cause as previous DOCS-INTEGRATION-H2-W1 wave: 6+ fictional spec primitives all collapse to version-baseline drift (`1.14.1` assumed; actual `1.15.1` — v1.15.0 + v1.15.1 BOTH shipped since prompt authored). Recommendation: Path A inline rebase. KTW1 ✅ SHIPPED so coordination is clean.

---

## A. Wave Objective restatement (Code's words)

Apply Fix-at-the-Generator across 3 coupled integration surfaces (docs.html#integration H2 cluster + /integrations index page + per-slug landing pages). Introduce a NEW data layer (`src/lib/integrations-data/{types,mcp-clients,ai-agents,exchange-kits}.ts`) as single-SoT. 3 generators consume: refactored `mcp-usage-docs.ts` (data-driven), extended `render-integrations.mjs`, and `landing/integrations.html` regen pipeline. Add 5 NEW MCP-client landing pages (`/integrations/{claude-desktop,claude-code,cursor,cline,smithery}`) with 400-800 substantive words each. Add 3rd H3 "Connect Your Exchange Kit" to docs.html#integration. Rewrite `/integrations` hero from exchange-only to 3-section "Integrate AlgoVault" frame. No version bump (per RELEASE-CADENCE-GOVERNANCE-W1 governance — code-landing waves never bump). 6 chapters sequential under Scope-Rule + Verification-Gate discipline.

**Ambiguity surfaced**:
- Spec says "6 MCP clients" in headline but "5 dedicated pages" in Q-CLIENT-COUNT recommendation (Plain HTTP/curl stays inline-only). 5 + 1-inline is consistent with the matrix shape — addressed in Q-CLIENT-COUNT below.
- Spec describes "Continue.dev currently in matrix making 7" — but probe P15 returned ZERO `Continue.dev` hits in `mcp-usage-docs.ts`. Current matrix has 6: Claude Desktop · Cursor · Cline (VSCode) · Claude Code · Smithery · Plain HTTP / curl. **Continue.dev never landed.** Spec's "7" assumption is a fictional primitive — addressed in Q-CLIENT-COUNT.

---

## B. Endpoint truth table — 16 probes

| # | Primitive | Probe | Reality | Resolution |
|---|---|---|---|---|
| P1 | Code's git-checkout path | `find $HOME -maxdepth 3 -type d -name 'crypto-quant-signal-mcp'` | `/Users/tank/crypto-quant-signal-mcp` ✓ | PASS-PINNED |
| P2 | `MCP_USAGE_HTML` export | `grep -n 'export const MCP_USAGE_HTML' src/lib/mcp-usage-docs.ts` | line **19** ✓ | refactor target confirmed |
| P3 | `render-integrations.mjs` consts | `grep -nE 'EXCHANGES\|FRAMEWORKS' scripts/render-integrations.mjs` | line **29** `const EXCHANGES = [...]`; line **33** `const FRAMEWORKS = [...]` — **unprefixed** (spec assumed `INTEGRATION_EXCHANGES/FRAMEWORKS` prefix) | minor spec drift; C1 introduces `MCP_CLIENTS` const with similar unprefixed naming for consistency |
| P4 | `src/index.ts` route allow-lists | `grep -nE 'INTEGRATION_(EXCHANGES\|FRAMEWORKS\|MCP_CLIENTS)' src/index.ts` | lines **825-826** `INTEGRATION_EXCHANGES` + `INTEGRATION_FRAMEWORKS` present (prefixed here); `INTEGRATION_MCP_CLIENTS` absent ✓ | C4 adds `INTEGRATION_MCP_CLIENTS` const + extends ALL_INTEGRATION_SLUGS union |
| P5 | `/integrations` index page SoT | `find landing/ -maxdepth 2 -name 'integrations*'` + `grep` | **Path A confirmed**: STATIC `landing/integrations.html` pre-loaded into `INTEGRATIONS_INDEX_HTML` at `src/index.ts:880`; served via `app.get('/integrations', ...)` at `src/index.ts:884` | C3 either (a) rewrites the static file directly, OR (b) introduces a small generator script + commits the regenerated file. Architect ratifies; Code recommends (a) for minimum surface-area change |
| P6 | 8 existing `/integrations/<slug>` URLs | `curl -sS -o /dev/null -w "%{http_code}"` × 8 | all 200 ✓ | baseline pre-wave |
| P7 | 8 `/docs/integrations/<slug>` 301 redirects | `curl -sSI` × 8 | all 301 ✓ | DOCS-INTEGRATION-H2-W1 URL-IA fix preserved |
| P8 | `landing/docs.html` BUILD markers | `grep -n 'BUILD:mcp-usage' landing/docs.html` | start = line **615**, end = line **928** (shifted from prior wave's 920/1233 because KTW1 added KNOWLEDGE TOOLS section ABOVE integration block at lines ~310-600) ✓ | regeneration pipeline intact; new line range expected |
| P9 | **KTW1 status** | `grep -nE 'KNOWLEDGE-TOOLS-DOCS-W1.*GREEN' status.md` + `grep -q 'id="knowledge-tools-search"' landing/docs.html` | ✅ **SHIPPED** — status.md 2026-05-19 17:10 UTC `CH1_GREEN + LIVE_GREEN + CH2_GREEN_PATH_C`; commit `f02c9e2 feat(docs): KNOWLEDGE TOOLS section in landing/docs.html (C1 of KNOWLEDGE-TOOLS-DOCS-W1)` already on `origin/main` | NO coordination wait needed; this wave's C2 regeneration inherits the KTW1 section automatically (BUILD:mcp-usage marker block is at its own position; KTW1's section sits upstream and is untouched) |
| P10 | npm-resolved CLI tools | `npm view @smithery/cli version` | `4.11.1` ✓ | latest 4.x stable; spec snippet `npx -y @smithery/cli install crypto-quant-signal-mcp --client <name>` still valid |
| P11 | PyPI framework adapters (carried from DOCS-INTEGRATION-H2-W1 baseline probe 2026-05-18) | confirmed 2026-05-18 | `langchain-mcp-adapters==0.2.2` · `llama-index-tools-mcp==0.4.8` · `agent-framework==1.4.0` · `crewai==1.14.4` + `crewai-tools[mcp]==1.14.4` | freeze in `ai-agents.ts` data file |
| P12 | npm exchange-kit packages | `npm view <pkg> version` × 4 | `@okx_ai/okx-trade-mcp@1.3.3` (spec said 1.3.1 — minor drift; refresh in `exchange-kits.ts`); `bybit-official-trading-server@2.1.5` (spec said 2.0.9 — drift; refresh); `bitget-mcp-server@1.1.0` ✓ (matches); `binance-skills-hub` 404 (different name — actual is `binance/binance-skills-hub` GH-installed via `claude plugin install`, NOT an npm package; system-map.md line 285 confirms `binance/binance-skills-hub (verified-2026-04-25)` is the GH-coords reference) | freeze updated versions in `exchange-kits.ts` |
| P13 | `/api/performance-public` keys | `curl -sS https://api.algovault.com/api/performance-public \| jq 'keys'` | keys = `[asset_count, byAsset, byCallType, byExchange, byTier, byTimeframe, exchange_count, hold_rate, holdsByTier, ...]`; `asset_count = 740`; `pfe_win_rate` + `total_calls` NOT at top-level (live PFE WR is in nested `byTier.<tier>.pfeWinRate` or similar) | hero copy will use qualitative framing (no hardcoded numeric); existing `<!-- SNAPSHOT-LINE -->` markers in `landing/integrations.html` handle numeric refresh via `snapshot_capabilities.mjs` script |
| P14 | Current `/integrations` hero | `head -110 landing/integrations.html \| grep` | `<meta name="description">` reads "Pair AlgoVault MCP with any official Agent Trade Kit (Binance, OKX, Bybit, Bitget). 89%+ Merkle-verified accuracy" — exchange-only stale framing | C3 hero rewrite per Q-HERO-COPY |
| P15 | Continue.dev in matrix? | `grep -nE 'Continue.dev\|continue' src/lib/mcp-usage-docs.ts` | **0 hits** — Continue.dev NOT in matrix | spec's "7 (Continue.dev counted)" assumption is fictional; actual matrix has 6 (5 named clients + Plain HTTP transport) |
| P16 | Plain HTTP / curl in matrix? | `grep -nE 'Plain HTTP\|/curl' src/lib/mcp-usage-docs.ts` | 3 hits: line **16** (header doc), line **64** (table row), line **175** (walkthrough `<details>`) — confirmed present | Plain HTTP stays inline-only with `hasDedicatedPage: false` (per Q-PLAIN-HTTP recommendation) |

**Fictional primitives count**: 4 surface-level mismatches (P3 unprefixed const naming · P12 minor version drift · P13 jq path wrong · P15 Continue.dev assumed-present) + **6 deep version-baseline drift** = 10 total, but version-baseline drift collapses to ONE root cause per CLAUDE.md "plan-mode-halt-collapse-class-vs-independent-class-triage" rule promoted from last wave's WIS. Net: 4 independent surface fixes + 1 collapse-class version baseline. All addressable inline.

---

## C. Architect ratifications — 7 questions

| # | Question | Code's recommendation | Mr.1 ratifies |
|---|---|---|---|
| Q-CLIENT-COUNT | MCP-client dedicated pages count | **5** dedicated pages (claude-desktop · claude-code · cursor · cline · smithery) + 1 inline-only (plain-http). Continue.dev NOT in matrix (P15 probe). Total 6 entries in `mcp-clients.ts` (5 with `hasDedicatedPage: true`, 1 with `false`). | 5 / 6-with-Continue / other |
| Q-PLAIN-HTTP | Plain HTTP / curl dedicated page? | **NO** — keep inline-only (`hasDedicatedPage: false`); walkthrough stays in docs.html#connect-mcp `<details>` block. Dedicated landing page would be thin content (it's transport, not a client). | NO / YES |
| Q-INDEX-PAGE-PATH | `/integrations` index page SoT | **Path A** confirmed via P5 — static `landing/integrations.html` pre-loaded into `INTEGRATIONS_INDEX_HTML` at server boot. C3 edits this file directly + commits the regenerated version; no new generator script needed. | A / B / C / migrate |
| Q-HERO-COPY | Page hero rewrite | **"Integrate AlgoVault"** (H1) + subtitle "Drop AlgoVault into any MCP-compatible client, any major agent framework, or any exchange Agent Trade Kit. Pick your path below." (mirrors docs.html#integration intro for consistency; ≤20 words per sentence; FORBIDDEN-clean) | confirm / alternative |
| Q-3STEP-CARDS | Existing 3 step cards | **MOVE** under Section 3 (Connect Your Exchange Kit) — cards are exchange-specific ("AlgoVault returns analytics → Exchange kit executes → Your agent decides"); new 3-section frame replaces "3 steps" as dominant IA but cards keep value as Section 3 sub-narrative | KEEP top / MOVE / DROP |
| Q-WHY-PAIR-BODY | Existing "Why pair" 4-bullet body | **KEEP** under Section 3 — 4 bullets are exchange-pairing-specific (composite verdict + cross-venue + Merkle + manifest); generalizing loses punchy framing | KEEP / GENERALIZE / DROP |
| Q-KTW1-COORDINATION | KTW1 status | ✅ **SHIPPED** per P9 probe (status.md 2026-05-19 17:10 UTC; commit `f02c9e2` on `origin/main`). No coordination wait needed. | SHIPPED ✓ |

---

## D. Version-baseline HALT triage (collapse-class)

Per last wave's WIS bullet `spec-version-baseline-as-variable-not-literal` (promoted to pattern after DOCS-INTEGRATION-H2-W1) AND `plan-mode-halt-collapse-class-vs-independent-class-triage` (collapse-class triage rule): this wave's `1.14.1` baseline assumption is fictional; actual `package.json = 1.15.1` + `server.json = 1.15.1`. ALL 6 instances below collapse to ONE root cause (v1.15.0 + v1.15.1 BOTH shipped between prompt-authoring 2026-05-18 and execution 2026-05-19):

| # | Spec literal | Reality | Same root cause? |
|---|---|---|---|
| 1 | `package.json = 1.14.1` (spec L96, R7 gate L534) | `1.15.1` | YES |
| 2 | `server.json` "MUST NOT touch" implied 1.14.1 | `1.15.1` | YES |
| 3 | "no `## [1.14.2]` CHANGELOG entry" (R7 gate L535) | top entry = `## [1.15.1]` (per `03f4bea docs(readme): v1.15.1 What's new`) | YES |
| 4 | "in-repo README stays at v1.14.1 baseline" (spec L96) | README at v1.15.1 "What's new" baseline (line 100) | YES |
| 5 | "deferred to v1.15.0" (spec L7, L58, L115) | v1.15.0 + v1.15.1 BOTH shipped; deferral target preempted twice | YES |
| 6 | R7 gate `git diff --quiet README.md` (spec L536) | currently shows `730+ → 740+` snapshot bump (NOT this wave's edit — see §E below) | partial; relates to snapshot drift, not version |

**Recommended Path A** (same shape as last wave's architect ratification + now codified in WIS as the canonical pattern): rebase R7 verification gate version assertions from `1.14.1 → 1.15.1`; substantive 6-chapter work unaffected; next daily release wave (per RELEASE-CADENCE-GOVERNANCE-W1) bundles whatever bump happens next. Architect approval string under §H.E embeds the new baseline.

---

## E. Concurrent-session contamination handling

**Finding**: `git status -s` shows uncommitted modifications at `README.md` + `landing/index.html`. **NOT a parallel-session bug** — diff inspection confirms 2 lines per file (3 total: README hero bullet + README pricing-table cell + landing/index.html FAQ JSON-LD answer) all changing `730+` → `740+` asset-count. The `<!-- SNAPSHOT-LINE -->` + `<!-- SNAPSHOT-LINE-TABLE -->` markers indicate this is `scripts/snapshot_capabilities.mjs` script output (live-API-bound asset_count refresh from 730 to 740). System-map.md probe P13 confirmed live `asset_count = 740`.

**Handling plan** (per CLAUDE.md "Cross-session `git add` contamination guard" + memory `feedback_no_remove_without_asking.md`):

- **Step E.1 (pre-C1)**: Commit the snapshot bump as a separate maintenance commit BEFORE C1 starts — clean working tree before wave commits land. Title: `chore(snapshot): asset_count 730+ → 740+ (live API refresh)`. Stage ONLY `README.md` + `landing/index.html`; verify diff with `git diff --cached` to confirm 3 surgical SNAPSHOT-LINE replacements; nothing else.
- **Step E.2 (during wave)**: After each wave chapter commit, run `git status -s` + `git diff --cached` BEFORE `git commit` to verify scope (cross-session contamination guard).
- **Step E.3 (R7 gate adjustment)**: Spec's `git diff --quiet README.md` assertion (line 536) is currently FALSE due to the snapshot bump. After Step E.1 commits the bump, the assertion becomes TRUE (working-tree clean on README.md). No spec change needed; just sequence E.1 before R7 runs.

---

## F. Identifier diff

| Identifier | Spec value | Live probe | Diff? |
|---|---|---|---|
| `package.json` version | `1.14.1` | **`1.15.1`** | 🛑 YES (collapse-class) |
| `server.json` version | `1.14.1` (implied) | **`1.15.1`** | 🛑 YES |
| Slug naming | kebab-case | matches `langchain`, `llamaindex`, etc. (existing convention) | ✓ |
| 5 MCP-client display names | Claude Desktop · Claude Code · Cursor · Cline · Smithery | matches existing matrix (Cline displays as "Cline (VSCode)" — keep that disambiguation) | ✓ |
| 4 framework names | LangChain · LlamaIndex · Microsoft Agent Framework · CrewAI | per AI-AGENT-FRAMEWORK-TUTORIALS-W1 ship | ✓ |
| 4 exchange names | Binance · OKX · Bybit · Bitget | per `INTEGRATION_EXCHANGES` | ✓ |
| 3 docs.html#integration H3 anchors | `#connect-mcp` · `#connect-ai-agent` · `#connect-exchange-kit` (C2 adds 3rd) | first 2 present per DOCS-INTEGRATION-H2-W1; 3rd is NEW | ✓ |
| `INTEGRATION_FRAMEWORKS` const in render-integrations.mjs | spec assumed prefixed | actual is unprefixed `FRAMEWORKS` + `EXCHANGES` | minor — C4 introduces `MCP_CLIENTS` const with consistent unprefixed naming OR refactors all 3 to prefixed; Code recommends EXTRACT-INTO-data-file approach (import from `mcp-clients.ts` etc.) which sidesteps the naming question entirely |
| Continue.dev | spec assumed in matrix | NOT in matrix (P15) | spec L25 + L148 outdated; address in Q-CLIENT-COUNT |
| Plain HTTP / curl | spec assumed in matrix | present (P16); 3 mentions in mcp-usage-docs.ts | confirmed |

---

## G. Per-page content drafts — 5 MCP-client pages (verbatim pre-flag per `feedback_dashboard_changes_require_explicit_permission.md`)

Each draft below is the C5 deliverable Mr.1 pre-approves at Plan-Mode time. Format: 600-700 words per page (within 400-800 budget). Sections: hero/lede · setup walkthrough · worked example · troubleshooting · FAQ · footer CTAs.

### G.1 `/integrations/claude-desktop` — "Connect AlgoVault to Claude Desktop"

```
H1: Connect AlgoVault to Claude Desktop
Lede (1-2 sentences): Add AlgoVault's 4 MCP tools to Claude Desktop as a custom
connector. ≤5 minutes; works on the free tier (100 calls/month, no signup).

## Setup

Two paths. The UI path is easiest if you already use Claude Desktop daily.

**Path 1 — UI (recommended).** Open Claude Desktop → Settings → Connectors →
"Add custom connector". Name: AlgoVault. URL:
https://api.algovault.com/mcp. Save and restart Claude Desktop. The
free tier needs no header. Paid tier: add Authorization: Bearer
av_live_… as a custom header.

**Path 2 — JSON config.** Edit
~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or
%APPDATA%\Claude\claude_desktop_config.json (Windows):

  {"mcpServers": {"algovault": {"command": "npx",
    "args": ["-y", "mcp-remote", "https://api.algovault.com/mcp",
             "--header", "Authorization: Bearer ${AV_API_KEY}"]}}}

Set AV_API_KEY in the env block or your shell. Free tier: drop the
--header arg entirely.

## Example: get a BTC trade call

Ask Claude: "Get me a trade call for BTC on the 1h timeframe."
[screenshot: Claude Desktop chat showing AlgoVault tool indicator and a
get_trade_call response with call=HOLD, confidence=13, regime=TRENDING_DOWN]

The tool indicator appears bottom-right of the input box during the call.
Claude returns the parsed verdict (call, confidence, regime, indicators)
without seeing raw API JSON.

## Troubleshooting

- **"Custom connector not appearing in tool list"** — restart Claude Desktop
  after saving the connector. The connector list is read at app start.
- **"Authorization failed"** — confirm AV_API_KEY is set in the JSON env
  block, not just your shell. Claude Desktop spawns the MCP process in its
  own env scope.
- **"Tool indicator never shows"** — try the JSON config path. The UI's
  Streamable-HTTP transport sometimes fails handshake on flaky networks;
  the JSON config's npx mcp-remote shim is more resilient.
- **"npx not found" (JSON path)** — install Node 20+ (brew install node).
  Claude Desktop spawns npx via PATH.

## FAQ

**Q: Do I need an API key for the free tier?** No. Free tier (100 calls/month)
works without any header. The UI path also accepts no-key setup.

**Q: Which tier does Claude Desktop ship with?** AlgoVault's free tier covers
every coin and every timeframe. Paid tiers start at $9.99/mo (3,000 calls).

**Q: Can my Claude.ai account share the connection?** No — Claude.ai (web) and
Claude Desktop have separate connector lists. Add AlgoVault on each surface.

**Q: How do I see my call usage?** Visit algovault.com/account with your
API key. Live counters update within seconds.

## CTAs

→ Try it free: get a BTC trade call in Claude Desktop right now. No signup.
→ Verify the track record on-chain: algovault.com/track-record
```

Word count target: ~600. CTAs end-of-page (TG bot CTA at footer of page template via shared partial; this draft body lists the action verbs).

### G.2 `/integrations/claude-code` — "Connect AlgoVault to Claude Code"

```
H1: Connect AlgoVault to Claude Code
Lede: Wire AlgoVault into your Claude Code CLI as a project-scoped MCP server.
Commit .mcp.json so every teammate gets the same setup.

## Setup

**One-liner (recommended):**

  claude mcp add --transport http --scope project algovault \
    https://api.algovault.com/mcp \
    --header "Authorization: Bearer $AV_API_KEY"

This writes .mcp.json in your repo root. Commit it; teammates clone +
`claude` opens with AlgoVault already wired.

**.mcp.json shape (auto-generated):**

  {"mcpServers": {"algovault": {"type": "http",
    "url": "https://api.algovault.com/mcp",
    "headers": {"Authorization": "Bearer ${AV_API_KEY}"}}}}

Set AV_API_KEY in your shell or .envrc.

## Example: get a BTC trade call

In a Claude Code session, type: "/mcp" to list connected servers. AlgoVault
should appear with 4 tools (get_trade_call, get_trade_signal, scan_funding_arb,
get_market_regime). Then ask: "Use AlgoVault to get a trade call for BTC
4h." Claude Code shows the tool call inline; the returned JSON pretty-prints
in the response.
[screenshot: Claude Code terminal showing /mcp list with AlgoVault + 4 tools
and a get_trade_call response]

## Troubleshooting

- **"Server not initialized" on first call** — Claude Code expects the 3-step
  MCP handshake; the http transport handles this automatically. If you see
  this error, your .mcp.json type might be set to "sse" instead of "http".
- **"AV_API_KEY not set in env"** — Claude Code reads from the shell that
  launched it. Use direnv or set the key in ~/.zshrc.
- **".mcp.json not picked up"** — Claude Code reads .mcp.json from the CWD
  at session start. Restart Claude Code from the repo root.
- **"403 Forbidden"** — your key is expired or wrong tier. Visit
  algovault.com/account to verify.

## FAQ

**Q: Project scope vs user scope?** Project (.mcp.json in repo root) shares
with the team. User (~/.claude/mcp.json) is private.

**Q: Free tier works?** Yes. Drop the --header arg from `claude mcp add`.
100 calls/month, all coins + timeframes.

**Q: Multiple MCP servers?** Yes — repeat `claude mcp add` per server.

**Q: How does this differ from Claude Desktop?** Claude Code is the CLI;
Claude Desktop is the chat app. Both run on the same Claude family but use
separate config files.

## CTAs

→ Add AlgoVault to your strategy-dev repo in 30 seconds.
→ See the verified track record: algovault.com/track-record
```

### G.3 `/integrations/cursor` — "Connect AlgoVault to Cursor"

```
H1: Connect AlgoVault to Cursor
Lede: Drop AlgoVault into Cursor's IDE agent. Live trade calls inside your
editor while you write strategy code.

## Setup

Edit ~/.cursor/mcp.json (global, all projects) OR .cursor/mcp.json in the
project root (per-project, commit-friendly):

  {"mcpServers": {"algovault": {
    "url": "https://api.algovault.com/mcp",
    "headers": {"Authorization": "Bearer ${env:AV_API_KEY}"}}}}

Set AV_API_KEY in your shell. Restart Cursor. Cursor's agent now has the
4 AlgoVault tools available in any prompt.

## Example: get a BTC trade call

Open Cursor's agent panel. Ask: "Use AlgoVault to check BTC at 4h." The
agent invokes get_trade_call and returns the verdict (call, confidence,
regime, indicators) inline.
[screenshot: Cursor IDE with agent panel showing AlgoVault tool call and
returned trade verdict]

Cursor's coding agent can also chain AlgoVault calls into strategy-code
edits — ask "If BTC 4h is BUY, add a long entry at the current bar in
strategy.py."

## Troubleshooting

- **"AlgoVault tool not showing in agent menu"** — restart Cursor. The
  mcp.json is read at app launch.
- **"${env:AV_API_KEY} not interpolated"** — Cursor reads env vars from the
  shell that launched it (macOS Launchpad vs terminal differ). Set the key
  in /etc/launchd.conf or use launchctl setenv on macOS.
- **"Network timeout"** — AlgoVault MCP is hosted at api.algovault.com.
  Check VPN/firewall.
- **"401 unauthorized"** — confirm Bearer key shape: av_live_… for paid;
  free tier needs NO header (delete the headers block entirely).

## FAQ

**Q: Free tier OK?** Yes. Remove the headers block from mcp.json. 100
calls/month, every coin + timeframe.

**Q: Per-project vs global?** Per-project (.cursor/mcp.json) is commit-
friendly — teammates inherit. Global is private.

**Q: Cursor's agent vs chat?** Both have access to MCP tools. The agent
can chain calls + edit code; chat is single-turn.

**Q: Does Cursor Composer use these tools?** Yes. Composer has the same
MCP access as the agent and chat panels.

## CTAs

→ Pull live signals into your strategy code, mid-edit.
→ Verify accuracy on-chain: algovault.com/track-record
```

### G.4 `/integrations/cline` — "Connect AlgoVault to Cline (VSCode)"

```
H1: Connect AlgoVault to Cline (VSCode)
Lede: Add AlgoVault as a remote MCP server to Cline, the VSCode coding agent.
Streamable-HTTP transport; setup ≤2 minutes.

## Setup

Open the Cline panel in VSCode → MCP Servers → Remote Servers tab → Add
server. OR edit cline_mcp_settings.json directly (Configure MCP Servers →
Edit):

  {"mcpServers": {"algovault": {
    "type": "streamableHttp",
    "url": "https://api.algovault.com/mcp",
    "headers": {"Authorization": "Bearer ${env:AV_API_KEY}"},
    "disabled": false,
    "autoApprove": []}}}

`type: "streamableHttp"` is the modern transport (recommended). The legacy
`"sse"` type still works but is being deprecated upstream.

## Example: get a BTC trade call

In a Cline thread, type "Use AlgoVault to check ETH 1h." Cline lists the
tools available; selects get_trade_call; returns the parsed verdict.
[screenshot: VSCode with Cline panel showing AlgoVault MCP server entry and
a get_trade_call response]

Cline can also wire AlgoVault into multi-step plans — "If ETH 1h is BUY,
write a Python script that opens a long position via ccxt."

## Troubleshooting

- **"streamableHttp transport not supported"** — update Cline to v3.x or
  later. v2.x only supports SSE.
- **"Server not initialized"** — first call needs the MCP handshake; Cline
  handles this automatically on streamableHttp. If you see this, switch
  type to "streamableHttp" (NOT "sse").
- **"autoApprove not respected"** — Cline asks before each tool call by
  default. Add tool names to autoApprove (e.g. ["get_trade_call"]) to
  pre-approve.
- **"Cline can't find cline_mcp_settings.json"** — path varies by OS.
  Access via Cline panel → Configure MCP Servers; that opens the file.

## FAQ

**Q: Cline vs Continue.dev?** Both are VSCode coding agents; Cline supports
MCP natively. Continue.dev's MCP support is community-driven.

**Q: Free tier?** Yes. Remove the headers field. 100 calls/month.

**Q: SSE vs streamableHttp?** streamableHttp is the modern transport.
AlgoVault MCP supports both, but new setups should use streamableHttp.

**Q: Auto-approve safe?** Auto-approve is convenient for trusted servers.
AlgoVault is read-only (no order placement), so auto-approving its tools
won't trigger side effects.

## CTAs

→ Test AlgoVault in your VSCode workflow today. Free tier, no signup.
→ See the verified track record: algovault.com/track-record
```

### G.5 `/integrations/smithery` — "Install AlgoVault via Smithery"

```
H1: Install AlgoVault via Smithery
Lede: One command installs AlgoVault into Claude Desktop, Cursor, Cline, or
Claude Code. Smithery picks the right config file for your client.

## Setup

  npx -y @smithery/cli install crypto-quant-signal-mcp --client <name>

Replace `<name>` with: claude, cursor, cline, or claude-code.

Smithery writes the right MCP-server entry into your client's config file.
If your client needs an API key, the CLI prompts for AV_API_KEY (or skip
to use the free tier).

## Example: install for Claude Desktop

  $ npx -y @smithery/cli install crypto-quant-signal-mcp --client claude
  ✔ AlgoVault MCP installed for Claude Desktop.
  ✔ Config written to ~/Library/Application Support/Claude/claude_desktop_config.json.
  ℹ Restart Claude Desktop to load.

[screenshot: terminal output of the smithery install command + Claude
Desktop restart prompt]

Restart Claude Desktop. Open a chat and ask "Use AlgoVault to check BTC
4h." AlgoVault's tools are now available.

## Troubleshooting

- **"smithery: command not found"** — use `npx -y @smithery/cli` (not bare
  `smithery`). The CLI doesn't install globally by default.
- **"Client not detected"** — Smithery probes your machine for installed
  clients. If your client lives in a non-default path, pass --config-path
  manually.
- **"Existing AlgoVault entry overwritten"** — Smithery preserves other
  servers but replaces existing AlgoVault entries. Back up your config
  first if you've hand-edited.
- **"npm 404 on @smithery/cli"** — confirm npm is configured for the public
  registry; corporate proxies sometimes block.

## FAQ

**Q: Which clients does Smithery support?** Claude Desktop, Cursor, Cline,
Claude Code. Continue.dev support is in beta.

**Q: Free tier setup?** Yes. Hit Enter at the API-key prompt; Smithery
writes a no-header config (free tier, 100 calls/month).

**Q: Can I see AlgoVault on the Smithery registry?** Yes —
smithery.ai/server/@AlgoVaultLabs/crypto-quant-signal-mcp.

**Q: What does Smithery actually do?** It generates the right
mcpServers entry for your client's config file. Same result as hand-
editing the JSON, but automated for each client's quirks.

## CTAs

→ One-command install: get AlgoVault in your client right now.
→ Browse the Smithery registry: smithery.ai/server/@AlgoVaultLabs/crypto-quant-signal-mcp
```

---

## H. Approval gate

**Code's recommended approval string** (Path A — same shape as last wave):

> INTEGRATIONS-FULL-STACK-W1 Plan Mode APPROVED. Client count: 5. Plain HTTP page: NO. /integrations index path: A. Hero: "Integrate AlgoVault" + Code-recommended subtitle. 3-step cards: MOVE. Why-pair body: KEEP. KTW1 status: SHIPPED. Version baseline rebased to v1.15.1 per RELEASE-CADENCE-GOVERNANCE-W1 (R7 gate's `package.json = 1.14.1` literal becomes `= 1.15.1`; all other version-related "MUST NOT touch" rules apply unchanged). 5 per-page content drafts (§G) pre-approved for C5. Proceed C1.

**Alternatives**:
- **Path B**: Architect can request modifications to any of the 5 page drafts before C5 lands (Code rewrites + re-surfaces).
- **Path C**: Cowork rewrites the spec on v1.15.1 baseline + adds Continue.dev as a 6th MCP-client page (round-trip latency vs Path A's 0-round-trip).

---

## I. Wave readiness checklist (post-approval, pre-C1)

- [ ] E.1 maintenance commit of snapshot bump (`chore(snapshot): asset_count 730+ → 740+ live API refresh`)
- [ ] Working tree clean before C1 start
- [ ] Plan-Mode artifact (this file) committed alongside C1 first commit
- [ ] R7 gate version assertion in this wave's final commit references `1.15.1`, not `1.14.1`
- [ ] 5 page drafts (§G) used verbatim in C5 (with light HTML wrapping for the page template)
- [ ] system-map.md edge enumeration (E1-E7) tracked from C1 onward, updated in same commit as each chapter's substantive change
- [ ] Forbidden-phrase canary clean at every chapter

---

**End of baseline audit.** Awaiting architect ratification before C1 dispatch.
