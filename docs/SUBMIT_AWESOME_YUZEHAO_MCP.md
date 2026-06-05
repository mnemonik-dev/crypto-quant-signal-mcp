# SUBMIT — #3 slot (OPTIONAL, NEXT WEEK) + channel findings

**Status:** 🟡 **OPTIONAL, next ISO week.** The 2 high-value PRs (punkpeye + wilsonfreitas) are submitted this week; AlgoVault's list/registry coverage is already strong (see below), so a 3rd is marginal — pursue only if you want extra surface.
**Submitter:** Mr.1, from the brand account (`AlgoVaultFi`).

## Channel findings (live-probed 2026-06-05)
| List | Outcome |
|---|---|
| **punkpeye/awesome-mcp-servers** (88.5k★) | ✅ **SUBMITTED** — PR [#7446](https://github.com/punkpeye/awesome-mcp-servers/pull/7446) |
| **wilsonfreitas/awesome-quant** (26.6k★) | ✅ **SUBMITTED** — PR [#403](https://github.com/wilsonfreitas/awesome-quant/pull/403) |
| **TensorBlock/awesome-mcp-servers** (727★) | ✅ **ALREADY LISTED** in `docs/finance--crypto.md` (the v1.17.0 "TensorBlock listing") — no action |
| **appcypher/awesome-mcp-servers** (5.6k★) | ❌ **CLOSED CHANNEL** — owner disabled PR creation AND Issues (`has_issues=false`); CONTRIBUTING still says "PR" but repo settings block both. No external submission path. **DROPPED** — don't retry. |
| `modelcontextprotocol/servers` | ❌ third-party list **retired → MCP Registry** (already published) |
| `wong2/awesome-mcp-servers` | ❌ **no PRs** → web-form mcpservers.org/submit |
| `e2b-dev/awesome-ai-agents` (28k★) | ❌ **soft-abandoned** (last merge 2025-01-08, >16mo) |
| `PipedreamHQ/awesome-mcp-servers` | ❌ no merged PRs, pushed >14mo ago |

→ The viable-PR-open + relevant + not-already-listed universe for this niche is thin. **YuzeHao2023** is the one remaining marginal option.

## #3 (optional): YuzeHao2023/Awesome-MCP-Servers
- 1,045★ · `has_issues=true` · last merged PR 2026-05-03 (PR-open) · not already listed · category **`## Category: Finance (💹)`** (line ~416).
- Lower authority than the 2 above (1k vs 88.5k/26.6k) — optional.

### The exact entry
```
- [AlgoVault](https://github.com/AlgoVaultLabs/crypto-quant-signal-mcp) - Composite crypto trade verdicts (direction, confidence, regime) across 5 perp venues, cross-venue funding-rate arbitrage, and an on-chain Merkle-verified track record. Free tier.
```
Open the list's `## Category: Finance (💹)` section and **match a neighboring entry's exact format** before committing (some lists prefix an icon or use `*` bullets).

### Click-by-click (Mr.1, web-UI — next week)
1. Signed in as **AlgoVaultFi**, open <https://github.com/YuzeHao2023/Awesome-MCP-Servers/blob/main/README.md> → **✏️ Edit this file** (auto-forks).
2. **Ctrl/Cmd-F** → `## Category: Finance` → add the entry in alphabetical position (`AlgoVault` near the top), matching a neighbor's format.
3. **Commit changes** → "Create a new branch… and start a pull request" → branch `add-algovault` → **Propose changes**.
4. **PR title:** `Add AlgoVault to Finance`
   **PR body:**
   > Adds **AlgoVault** (`crypto-quant-signal-mcp`) to **Finance**. A composite trade-verdict MCP server — one call returns direction, confidence, and regime across 5 perpetual-futures venues, plus cross-venue funding-rate arbitrage; track record Merkle-anchored on Base L2 and verifiable on-chain.
   >
   > Repo: https://github.com/AlgoVaultLabs/crypto-quant-signal-mcp · npm: https://www.npmjs.com/package/crypto-quant-signal-mcp · Free tier · `npx crypto-quant-signal-mcp`. Format-matched, no drifting numbers.
5. **Create pull request.**

> **Lesson (for future list waves):** the channel probe MUST check the repo-level PR/Issues *enablement* (`has_issues` + an actual fork-compare "open PR" attempt), not just whether CONTRIBUTING mentions PRs — appcypher had PR guidelines in CONTRIBUTING but PRs disabled in repo settings.
