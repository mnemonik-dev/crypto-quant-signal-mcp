# NPM-PUBLISH-v1.23.0-W1 — Endpoint-Truth (Plan-Mode Step 0)

**Probed:** 2026-07-03 (live + origin/main worktree) · **Verdict:** GREEN — executable; 1 anticipated HALT (JWT); 2 spec-premise drifts (fix-inline, factual target clear). MINOR — `scan_funding_arb` 3→7-venue public-copy reconcile.

## R0.0 — Worktree

`/Users/tank/code/cqsm-v1.23.0` (branch `release-v1.23.0` @ origin/main `5a2f03c`), clean; `npm ci` done. Ran per the worktree-first LAW (canonical checkout routinely dirty).

## R0.2 — Version table (frozen at baseline)

npm/health/registry/GH-Release all `1.22.1` → target **1.23.0** (DXT 1.15.0→**1.16.0**, lobehub "17"→**"18"**).

## R0.3 — JWT

`401 expired` → 🛑 Mr.1 `mcp-publisher logout && login github` before R6a (anticipated).

## R0.4–0.6 — Baseline + provenance + tools/list

`1.22.1 / 1.22.1 / 1.15.0 / 17`; server.json **icons present** (preserve); lobehub api[]=7. `repository.url` ✅. tools/list = **9**, names unchanged ✅.

## R0.7 — 🟠 DRIFT #1: tool-description is 5-venue (incl. Bitget), not the assumed 3

The `scan_funding_arb` description at **`src/tool-descriptions.ts:42`** (and live tools/list, and lobehub api[]) currently reads *"…on **Binance Bybit OKX Bitget Hyperliquid**…"* — a **5-venue** set that **includes Bitget**, NOT the "old 3" (HL/Binance/Bybit) the spec assumed. Target 7-venue set (code-confirmed): **Hyperliquid, Binance, Bybit, Gate, KuCoin, Aster, OKX** — so the reconcile **drops Bitget** and adds Gate/KuCoin/Aster. Factuality: `src/tools/scan-funding-arb.ts` scans exactly HL+Binance+Bybit+Gate+KuCoin+Aster+OKX (7, no Bitget); commits `e39ca68`+`f34e0eb` in main. Three strings carry the stale 5-venue text → all three get the accurate 7: (1) src tool-description (R2), (2) lobehub api[] desc (R1), (3) landing copy (R4b).

## R0.8 — Landing funding-arb copy

Funding-arb text appears across `landing/cross-venue-funding-rate-arbitrage.html` (dedicated page), `index.html`, `llms.txt`, `llms-full.txt`, `skills.html`, `glossary.html`, etc. — R4b narrows to the files carrying the venue-scope phrasing + reconciles to the 7-venue set (copy-only; if generator-driven, edit source + regen).

## R0.9 — Held pre-grep (public-copy blocks clean)

Forbidden terms (`equit|robinhood|stock|get_equity|okx.ai|a2mcp|win-rate|89.4|91.7|88.2`) in spec only at directive/gate lines (14/15/17 HELD, 34, 57, 65, 76/82, 118, 138, 181/182, 190/191, 205/208) — **0** in verbatim public-copy blocks R3(90–98)/R4(107–113)/R7-Discussion(144–153)/R8-X(161–175). ✅ "OKX" (the exchange, in the 7-venue list) is allowed; `okx.ai`/`a2mcp`/win-rate are not. All machine-gated at R6b/R9.

## R0.10 — 🟠 DRIFT #2: README R4.3 target strings don't exist

README anchors: `## What's new in v1.22.0` = 1 (demote), `v1.23.0` = 0 ✅. But the spec's R4.3 target strings — *"across Hyperliquid, Binance, and Bybit"* + the *"OKX and Bitget … expansion is planned"* line — are **NOT in the README**. The `scan_funding_arb` entry (line 178) is a generic one-liner ("cross-venue funding-rate spreads, ranked. The only MCP server doing multi-exchange derivatives arbitrage.") with no venue list. So R4.3's specific removals are N/A; I'll lightly enrich line 178 to name the 7-venue scope for accuracy. (README line 247's 12-exchange track-record list is injector-owned data-tr-field — NOT touched.)

## R0.11–0.12 — Injector + identifier diff

Injector wired (manifest README=4, publish-npm step=1) ✅. `1.23.0`×39 / `1.16.0`×6 / `"18"`×4 consistent ✅.

## Summary

Executable. 1 HALT (JWT → Mr.1 before R6a). 2 fix-inline drifts (reconcile the stale 5-venue text everywhere → accurate 7, dropping Bitget; README R4.3 is a light enrich not a removal). Tag-on-final (5th fire) + tag-tree gate. Held: win-rate/okx.ai/a2mcp/ACP/equities machine-gated. R2 rebuilds (`rm -rf dist && npm run build`) + greps dist for Gate/KuCoin/Aster.
