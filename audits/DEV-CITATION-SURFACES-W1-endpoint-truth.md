# DEV-CITATION-SURFACES-W1 — endpoint-truth (Plan-Mode probe)

**Probed:** 2026-06-04 (UTC) · **Repo:** `crypto-quant-signal-mcp` @ `8b8b669` (== origin/main, clean baseline; v1.20.0) · **Probe type:** read-only pre-edit
**Verdict:** 🟢 **Proceed** with R2–R4. **1 fictional primitive** (the spec's numerical-fact-density canary does not exist in this repo) → fix inline + gate-adjust + flag, not a HALT (< 3 threshold). 1 of 3 seed lists is a **closed channel** (drop). Net: 2 list PRs submit-this-week + 1 next-week runbook.

## A. README injector firewall (R1.1)

| Item | Reality | Rule for the rewrite |
|---|---|---|
| Live-injected numbers | **4 `data-tr-field` spans**, all on README line 42 (hero stats): `pfe_wr`, `total_calls`, `merkle_batches`, `hold_rate`. Driven by `scripts/snapshot-landing-manifest.json` (claims `dtrf-pfe-wr`, `dtrf-hold-rate`, `dtrf-readme-total-calls`, `dtrf-readme-merkle-batches` → `apply_to_files: ["README.md"]`) + `scripts/snapshot-landing-data.mjs`. | **MUST keep all 4 spans** (`<span data-tr-field="X">fallback</span>`) somewhere in the README, byte-identical span syntax, or the injector zero-matches (manifest has a `≥50% zero-match → exit 1` guard). |
| `<!-- SNAPSHOT-LINE -->` markers | 8 in README (lines 13, 42, 192, 193, 198, 238, 437) + `<!-- SNAPSHOT-LINE-TABLE -->` (349, 350). Only **line 42 carries actual `data-tr-field` spans**; the rest mark static drifting-number prose for the fact-density canary's awareness. | Keep the comment marker on any line I retain that carries a snapshot number. Drop a marker only if I drop its whole line. |
| SoT comment block | README lines 37–40 (`<!-- SoT: this README is the single canonical source… Wired by OPS-NPM-README-SINGLE-SOT-W1 -->`). | Preserve (or relocate intact) so the injector contract stays documented. |
| **What's-new section** | **Lines 104–182** (`## What's new in v1.20.0` → next `## Why AlgoVault` @ 183). Release-wave-owned. | **Preserve VERBATIM** (diff must prove byte-identical). `tests/changelog-parser.test.ts` reads it. |
| Current H2 count | **18** H2 sections (sprawling). | Rebuild to the approved **7-section** outline (≤5 + What's-new + conventional Privacy/License footers), consolidating existing content. |

## B. npm `description` (R1.1 / R3)

| | Value | len |
|---|---|---|
| **Current** (`8b8b669`) | `The Brain Layer for AI Trading Agents — composite quant calls across 5 exchanges (Hyperliquid, Binance, Bybit, OKX, Bitget), cross-venue arb, regime-aware classification, and a 20-skill catalog via MCP.` | **202** (>200) |
| **Approved** | `The Brain Layer for AI Trading Agents — one MCP call returns a composite trade verdict (direction, confidence, regime) across 5 perp venues. On-chain Merkle-verified track record.` | 178 |

→ **Materially different** (entity-first verdict framing + Merkle vs. "20-skill catalog"; also fixes the >200 overflow) → **apply** the approved string (R3). NO version bump; companion manifests (server.json/DXT/lobehub) are release-owned → flag the sync to the next release wave.

## C. 🔴 Numerical-fact-density canary — FICTIONAL PRIMITIVE (1)

`lib/check-numerical-fact-density.mjs` (spec AC + gate) **does not exist**: no `lib/` dir, no `*numerical*`/`*fact-density*` file anywhere in the repo or as a vitest test, no `package.json`/CI reference (prepublish uses `scripts/snapshot_capabilities.mjs`, not this). CLAUDE.md references it but it is not present in *this* repo.
- **Resolution (fix inline + flag):** (1) author the README to be **numerically-anchored by design** — every number is either a `data-tr-field` span, a forward-stable qualitative, or anchored to a verifiable surface; (2) run a **manual** numerical-anchoring audit in lieu of the missing canary (documented in status); (3) **adjust the verification gate** to drop the `node lib/check-numerical-fact-density.mjs` line (replace with a grep proving no unanchored `%`/count drift); (4) **WIS-flag** building the real canary (dovetails with the spec's own "README geo-checklist CI canary" WIS candidate). Per CLAUDE.md Plan-Mode: 1 fictional primitive ⇒ fix inline, not HALT.

## D. Target-list probes (R1.2) — channel + abandonment + format

| List | ★ | Last merge | Open PRs | Channel probe | Verdict |
|---|---|---|---|---|---|
| **punkpeye/awesome-mcp-servers** | 88.5k | 2026-05-27 (8d) | ≥100 (1525 issues+PRs) | Active; `CONTRIBUTING.md` = standard fork→edit README→PR, alphabetical within category, follow format. No auto-close/staff-only. Category **Finance & Fintech** (💰). Peer entry exists (`Octodamus/octodamus-core` — crypto BUY/SELL/HOLD oracle, x402, on-chain, free tier) → exact fit. | ✅ **SUBMIT THIS WEEK** |
| **wilsonfreitas/awesome-quant** | 26.6k | 2026-05-30 (5d) | 13 (28 issues+PRs) | Active, **low backlog → fast merges**. Format `- [Name](url) - \`Lang\` - desc.`; category **Trading & Backtesting**. Hosted/commercial entries exist (DeepAlpha, QuantOracle) → acceptable. More curated → needs a library-shaped, non-promotional blurb. | ✅ **SUBMIT THIS WEEK** |
| **modelcontextprotocol/servers** | 86.7k | 2026-05-30 | ≥100 | 🔴 **CLOSED CHANNEL** — `CONTRIBUTING.md`: *"The README no longer contains a list of third-party MCP servers — that list has been retired in favor of the MCP Server Registry… publish your server there instead."* PR #4255 moved community resources out. | ❌ **DROP** — community PRs not accepted. AlgoVault is **already** registry-published (`mcp-publisher publish`), so this surface is covered. |
| **wong2/awesome-mcp-servers** | 4.1k | active (pushed 2026-06-03) | — | Active, 2nd-best-known MCP list. | 🟡 **#3 NEXT-WEEK runbook** (spam cap = ≤2/ISO-week). |

**W2 source-map supplement:** `geo_source_citations` is **empty pre-first-probe** — the first real 4-engine GEO run fires **Mon 2026-06-08** (W2: probe-test rows were cleaned). So it cannot inform list selection this wave; selection rests on seed candidates + the authority/abandonment/channel probes above. (Non-blocking per spec.)

## E. Spam-discipline compliance
ISO week (Mon–Sun) cap = **≤2 PRs submitted this week** → punkpeye + wilsonfreitas this week; wong2 runbook marked **next week**. All PRs submitted by **Mr.1 from the brand account** (`AlgoVaultFi`/AlgoVaultLabs) per the runbooks — **no automated PR creation** by Code.

## F. Verification-gate adjustment (fictional canary)
Original gate line `node lib/check-numerical-fact-density.mjs` → **replaced** with a manual-equivalent grep (README carries no unanchored WR%/count outside `data-tr-field` spans) + `ls docs/SUBMIT_AWESOME_*.md` count + entity-first opener grep + `! git diff` manifest guard + `npm test`. Documented as a fact-honest relaxation (canary doesn't exist to run).

## Probe commands (reproducible)
```bash
grep -noE 'data-tr-field="[a-z_]+"' README.md            # → 4 spans on line 42
awk 'NR>=104 && /^## /{print NR": "$0}' README.md         # → What's-new 104..182
find . -iname '*fact-density*' -o -iname '*numerical*'    # → ∅ (fictional)
gh api repos/modelcontextprotocol/servers/contents/CONTRIBUTING.md --jq .content | base64 -d | grep -i retired  # → closed channel
for r in punkpeye/awesome-mcp-servers wilsonfreitas/awesome-quant; do gh pr list --repo $r --state merged --limit 1 --json mergedAt; done  # → recent
```
