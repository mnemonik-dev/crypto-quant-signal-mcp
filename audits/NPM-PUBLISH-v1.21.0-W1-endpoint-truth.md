# NPM-PUBLISH-v1.21.0-W1 — Endpoint-Truth (Plan-Mode Step 0)

**Probed:** 2026-06-28 (live + origin/main) · **Verdict:** GREEN — every anchor verified; 1 environment HALT resolved (worktree); 1 expected manual touchpoint (OAuth refresh). MINOR catch-up release unfreezing ~3 weeks post-flag.

## R0.0 — $REPO + execution environment (HALT → resolved)

Canonical `/Users/tank/code/crypto-quant-signal-mcp` was **70 commits behind** origin/main (`8e96064`) **and dirty** with a parallel session's in-flight `README.md` (MM) + `landing/index.html` (M) edits. Per spec "dirty = HALT, surface, never stash" + the worktree-first LAW → **running the wave from a fresh worktree off origin/main** (`/Users/tank/code/cqsm-v1.21.0`, branch `release-v1.21.0` @ `8e96064`, clean). All anchors below re-derived from origin/main HEAD, NOT the v1.20.1 tag. Architect approved the worktree path.

## R0.2 — Version freeze confirmed (the bug the wave fixes)

npm `1.20.0` · MCP Registry `1.20.0` · GH Release `v1.20.0` — all frozen. prod `health` = `1.20.1`. **`1.20.1` NOT published to npm** (`versions["1.20.1"]` absent). Prod is ahead of every publish surface → the flag-period freeze. Target: all → **1.21.0**.

## R0.3 — OAuth (expected stale)

`mcp-publisher publish --dry-run` → `Error: not authenticated` (token cleared during the months-long flag block). 🛑 Manual touchpoint: Mr.1 `mcp-publisher logout && mcp-publisher login github` before R5a (1.5.0 dual-token trap → logout first).

## R0.4–0.5 — Baseline + provenance (origin/main)

`package 1.20.1 / server 1.20.1 / DXT 1.13.1 / lobehub 15`; `server.json has("icons")` == **false** (icons to add for Smithery) ✅ matches spec. lobehub api[]=7 (keep 7-of-9). `repository.url` present ✅.

## R0.6 — tools/list = 9, unchanged

`chat_knowledge, get_equity_call, get_equity_regime, get_market_regime, get_trade_call, get_trade_signal, scan_funding_arb, scan_trade_calls, search_knowledge`. No new tool ✅ (minor is from the `rankBy` param + `_receipts` field + x402 routes, not a tool add).

## R0.7 — Minor justification (new package surface since v1.20.0)

`rankBy` in **8** src files · `_receipts` in **6** src files on origin/main ✅. Cited commits all ancestors: SCAN-RANKBY `dcf4d6f`/`26e7319`/`fe59c54`, receipts `486e725`, x402 `140cba2`.

## R0.8 — HOLD pre-grep (public-copy blocks equity-clean)

`equit|robinhood|stock|get_equity` in spec only at directive/gate lines (17–20 HOLD, 82/89 R0, 103 commit-body, 155 R3.5, 174 R5b, 227 R8, 238/239/241 AC, 259 pillar). **0** in verbatim public-copy blocks R2(111–130)/R3(138–150)/R6(180–197)/R7(206–221) ✅. EQUITIES PUBLIC-COPY HOLD enforced + AC-gated.

## R0.9 — Security commits ship in the tag tree

`84713c3` (SECURITY-FIX-X402-WEBHOOK-W1), `de9ea91` (TIER-ESCALATION), `31f9534` (audit-hardening) all ancestors of origin/main ✅ → present in the v1.21.0 tag tree. The never-run RELEASE-HOTFIX folds in here (CHANGELOG Security + breaking webhook-signature notice).

## R0.10–0.12 — Webhook doc + Smithery + pairings + injector

`docs/WEBHOOKS.md` signature content = 13 ✅ (R3b updates it). Smithery badge **200** ✅. pairings gemini/kraken/alpaca all **200** ✅. injector wired (manifest README=4, publish-npm step=1) ✅.

## R0.13 — Identifier diff + v1.20.1 tag

`1.21.0`×46 / `1.14.0`×6 / `"16"`×4 consistent ✅. `v1.20.1` tag `1dbacc1` present on remote → **leave untouched** (harmless superseded marker) ✅.

## Summary

Executable from the worktree. Tag-placement (4th fire): `npm version minor --no-git-tag-version` → R1–R3b commits → annotated `v1.21.0` on the FINAL commit → tag-tree gate (README v1.21.0 + server 1.21.0 + has(icons) + CHANGELOG [1.21.0]). Breaking webhook-signature notice in CHANGELOG/README/Discussion + docs/WEBHOOKS.md. Smithery icons + badge. EQUITIES HOLD machine-gated. 1 manual: OAuth refresh before R5a.
