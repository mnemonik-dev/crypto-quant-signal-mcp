# Owned-link UTM registry — FUNNEL-FIX-ATTRIBUTION-W1

Canonical lowercase taxonomy for tagging **owned OUTBOUND links that point INTO AlgoVault**
(so inbound arrives already classified). Apply via `taggedLink(url, channel, medium)`
(`src/lib/tagged-link.ts`) — it tags ONLY absolute `https://algovault.com` / `api.algovault.com`
URLs and **refuses internal/relative links** (tagging an internal link overwrites first-touch).

## `utm_source` = channel slug (must be an `ATTRIBUTION_SOURCES` value)
`npm` · `github` · `x` · `docs` · `smithery` · `glama` · `pulsemcp` · `mcp_so` · `bazaar` ·
`agentkit` · `elizaos` · `llamahub` · `lobehub` · `producthunt` · `devto` · `medium` ·
`chatgpt` · `claude` · (LLM clients once observed) · `reddit` · `organic`

## `utm_medium` (coarse)
`listing` (registry/marketplace homepage links) · `launch` (a launch post, e.g. PH) ·
`post` (blog/dev.to/Medium article CTA) · `bio` (X bio / profile) · `readme` (GitHub README) ·
`discussion` (GitHub Discussions CTA)

## Where to apply (EXTERNAL owned surfaces — MANUAL for the off-repo ones)
| surface | channel | medium | who |
|---|---|---|---|
| GitHub README "try it" links | `github` | `readme` | repo edit |
| npm registry homepage URL (`package.json` `homepage`) | `npm` | `listing` | repo edit |
| MCP-registry / Glama / Smithery / LobeHub / cursor.directory listing "homepage" URL | that slug | `listing` | MANUAL (each console) |
| X bio + pinned | `x` | `bio` | MANUAL |
| dev.to / Medium / GH-Discussions post CTAs | `devto`/`medium`/`github` | `post`/`discussion` | editorial pipeline |

## Rules
- **NEVER tag internal/relative links** (`/welcome`, `/dashboard/*`, footer links to other pages) — the helper enforces this; a manual paste MUST too.
- **Idempotent** — an existing `utm_source` is preserved.
- Extend the channel set by adding an `ATTRIBUTION_SOURCES` slug (+ a Referer/UA rule) — one row.
