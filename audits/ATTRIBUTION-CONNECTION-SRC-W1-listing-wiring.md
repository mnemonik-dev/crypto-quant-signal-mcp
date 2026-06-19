# ATTRIBUTION-CONNECTION-SRC-W1 — `?src=` listing-wiring manifest

Authoritative map of every connection listing → its `?src=<slug>` → mechanism →
status. Cowork-ratified slug map (A4): `direct` dropped (untagged → `unknown`);
README → `github`; framework packages (agentkit/elizaos/llamahub) wired in their
own remote URL; X/social → `x`. `?src=` is captured ONLY for **remote-HTTP**
connections — **local-stdio (`npx`) is uncapturable** (the `npm` channel; volume
via npm registry download stats, not per-session).

A `?src=` is **orthogonal** to the existing `X-AlgoVault-Track-Token` header
(prior OPS-TRACK-TOKEN wave, e.g. `chan-docs`) and to `?ref=` (REFERRAL-LIGHT,
not yet shipped) — all parse independently; a listing may carry several.

Release-cadence LAW: versioned manifests / registry descriptions / the npm
README are NOT edited mid-wave — they ride the next `RELEASE-vX.Y.Z`.

---

## ✅ DONE this wave (in-repo, non-versioned)

| Surface | File | Slug | Notes |
|---|---|---|---|
| /docs + /integrations index connection snippets (Claude Desktop UI, mcp-remote, Cursor, Cline, Claude Code) | `src/lib/integrations-data/mcp-clients.ts` → built into `landing/docs.html` (`BUILD:mcp-usage`) | `docs` | 6 connection URLs → `…/mcp?src=docs`; rebuilt via `npm run build:landing`; `--check` green. Coexists with the existing `X-AlgoVault-Track-Token:chan-docs` header. |

## 🔜 IN-REPO FOLLOW-UP (low-risk; not done this wave to keep the public-copy edit tight)

| Surface | File | Slug | Why deferred |
|---|---|---|---|
| Per-platform integration pages | `docs/integrations/mcp-clients/{claude-desktop,cursor,cline,claude-code}.md` | `docs` | Markdown SoT → renders to `landing/integrations/*.html` via `scripts/render-integrations.mjs --source ~/git/algovault-skills` (external repo; no `--check` guard). Edit md + re-render in a follow-up. |
| Raw-curl "test your key" diagnostic block | `landing/docs.html:244-267` (hand-written, NOT a BUILD block) | `docs` (optional) | Diagnostic example, not an acquisition listing — low attribution value; tag only if desired. |

## 📦 STAGE for next `RELEASE-vX.Y.Z` (versioned public copy / manifests)

| Surface | File | Slug | Notes |
|---|---|---|---|
| npm/GitHub README connection URLs | `README.md` (lines ~43,50,138-145,302) | `github` | npm-README SoT — release-wave only. NOTE: README's `X-AlgoVault-Track-Token` was already stripped (`a932333`); `?src=github` is the replacement attribution. |
| MCP Registry manifest remote | `server.json` `remotes[].url` | *(keep clean)* | Recommend the canonical base URL stays **un-tagged**; each downstream registry listing carries its OWN `?src=<registry>` (below) so one slug doesn't mask all registries. |
| LobeHub manifest | `lobehub-manifest.json` | *(none — see Q)* | LobeHub has no slug in the enum → would resolve `unknown`. Flag: add `lobehub` to the SoT enum if LobeHub traffic warrants distinguishing. |
| DXT package manifest | `manifest.json` | — | DXT is a packaged (stdio-class) install → connect-uncapturable; do NOT claim coverage. |

## 🧑‍✈️ OPERATOR MANUAL_PENDING (external dashboards — not in any repo)

| Surface | Slug | Notes |
|---|---|---|
| ChatGPT App directory MCP URL (OpenAI console) | `chatgpt` | Case 09452954 in review. Set URL `…/mcp?src=chatgpt`. UA heuristic also tags ChatGPT. |
| Claude Connectors directory listing URL (Anthropic) | `claude` | `…/mcp?src=claude`. UA heuristic also tags Claude. |
| Smithery listing | `smithery` | `…/mcp?src=smithery` |
| Glama listing | `glama` | `…/mcp?src=glama` |
| PulseMCP listing | `pulsemcp` | `…/mcp?src=pulsemcp` |
| mcp.so listing | `mcp_so` | `…/mcp?src=mcp_so` |
| x402 CDP Bazaar resource URL | `bazaar` | `…/mcp?src=bazaar`. NOTE: Bazaar MCP-discovery gap is HELD (mainnet flip pending HTTP-redeclare) — wire when re-enabled. |
| X / social-posted connect URLs | `x` | Tag any posted `…/mcp?src=x`. |

## 🔗 CROSS-REPO (packages we control — separate repos; wire in their remote-URL config)

| Package | Repo | Slug | Notes |
|---|---|---|---|
| AgentKit provider | `coinbase/agentkit` PR #1278 (OPEN) | `agentkit` | Wire `…/mcp?src=agentkit` into the provider's remote URL when the PR lands. |
| ElizaOS plugin | `github.com/AlgoVaultLabs/plugin-algovault` (npm) | `elizaos` | Wire into the plugin's configured remote URL; needs the Automation npm token to publish. |
| LlamaIndex ToolSpec | `AlgoVaultLabs/llama-index-tools-algovault` (PyPI) | `llamahub` | Wire into the ToolSpec's remote URL. |

## 🚫 UNCAPTURABLE at connect (documented, not wired)

| Channel | Slug | Why | Volume signal instead |
|---|---|---|---|
| Local npm / `npx … TRANSPORT=stdio` | `npm` | stdio makes no outbound call to api.algovault.com | npm registry download stats (aggregate, not per-session) |
