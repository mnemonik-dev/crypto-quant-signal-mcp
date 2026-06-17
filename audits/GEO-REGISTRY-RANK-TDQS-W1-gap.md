# GEO-REGISTRY-RANK-TDQS-W1 — Probe + Gap Table

**Date:** 2026-06-17
**Authoritative source:** live prod `tools/list` at `https://api.algovault.com/mcp` (3-step
streamable-HTTP handshake) + `src/tool-descriptions.ts` / `src/tool-annotations.ts` on
`origin/main` (`67a2e29`). The vault mirror was NOT read (≥6 weeks stale, predates both SoT files).

## R1a — collision / gap probe

- `git log --oneline -25 origin/main`: the 25 most-recent commits are all GEO-content /
  GEO-autopilot / adapter / security work. **No TDQS / tool-description-optimization commit
  has landed on `origin/main`.**
- Vault `status.md` grep: the "Glama tool-description optimization" dispatched to a separate
  signal-MCP session (status.md L38) is recorded as **out of scope / not-run-here** and has
  **not pushed** to `origin/main`. No live collision (no `tdqs` / `glama` / `description`
  worktree among the 10 active worktrees).
- **Decision:** no prior TDQS rewrite to defer to. This wave carries the rewrite, scoped per
  the per-tool gap table below.

## R1b — authoritative prod tool set (live `tools/list`)

9 tools exposed (equity tools are **live**, not HOLD-gated):
`get_trade_call`, `get_trade_signal` (alias), `get_market_regime`, `scan_funding_arb`,
`scan_trade_calls`, `get_equity_call`, `get_equity_regime`, `chat_knowledge`, `search_knowledge`.

Server: `crypto-quant-signal-mcp` v1.20.1. Every tool already carries
`annotations = { title, readOnlyHint:true, openWorldHint:true, destructiveHint:false }`
(wired in `src/index.ts` as `{ title, ...PUBLIC_READONLY_TOOL_ANNOTATIONS }`).

## R1c — per-tool gap table

Legend: **TDQS-clean?** = satisfies all six Glama dimensions (purpose / usage / behavioral /
param-semantics / conciseness / completeness). **Hints complete?** = carries the 4-field
annotation shape. **Volatile count?** = description trips the forward-stability regex
(`/\b\d+\+?\s*(exchanges?|assets?|venues?|timeframes?)\b/i` or win-rate `/\b\d{2}(\.\d+)?%/`).

| Tool | TDQS-clean? | Hints complete? | Volatile count? | Action |
|---|---|---|---|---|
| `get_trade_call` | **No** — terse purpose; no use-when / do-NOT-use-when sibling routing; no behavioral-transparency line; marketing stuffing ("Verified track record, on-chain verified merkle anchor"; param tail "MCP tool for trading — AI trading signal") | Yes | No | **Rewrite** |
| `get_trade_signal` | **No** — alias; inherits `get_trade_call` desc + `[ALIAS]` suffix | Yes | No | **Rewrite** (shared const) |
| `get_market_regime` | **No** — same gaps; param stuffing ("Multi-exchange Claude trading agent") | Yes | No | **Rewrite** |
| `scan_funding_arb` | **No** — pure stuffing tail ("AI trading signal for crypto quant + Claude trading agents"); no use-when / behavioral | Yes | No | **Rewrite** |
| `scan_trade_calls` | **Partial** — good purpose + sibling pointer (`get_trade_call`); missing behavioral line; light stuffing ("for AI trading agents") | Yes | No (`1-100` = param range, capability bound) | **Light rewrite** |
| `get_equity_call` | **Partial** — strong purpose / universe / error-contract / sibling pointer; missing explicit behavioral-transparency line | Yes | No | **Light touch** (add behavioral; trim) |
| `get_equity_regime` | **Partial** — clear derivation; no use-when vs `get_equity_call`; no behavioral line | Yes | No | **Light touch** |
| `chat_knowledge` | **Minor** — purpose + use-when + sibling (`search_knowledge`) + quota present; no explicit behavioral line | Yes | No (quota integers are product pricing, outside the volatile-count regex scope) | **Minor** (add behavioral) |
| `search_knowledge` | **Minor** — already near-clean (purpose + use-when + "no LLM call, no quota cost" + sibling); no explicit read-only lead | Yes | No | **Minor** (add read-only lead) |

## Forward-stability baseline

`grep -nE` of both volatile-count regexes against current `src/tool-descriptions.ts`: **zero
matches**. The forward-stability canary added in R4 is therefore **preventive** — it locks the
clean state so a future hardcoded count (the root cause of the stale Glama "290+ assets /
3 exchanges" listing) fails CI. (That stale string is in the registry/`glama.json` listing
metadata, not in these per-tool description constants — tracked separately.)

## Scope decision (R2–R4)

- **R2 (descriptions):** all 9 tools touched. The universal gap is missing **Behavioral
  Transparency** (none state read-only / live-venue-API / no-side-effects). The 4 trade tools
  additionally get full rewrites (purpose sentence + use-when/do-NOT-use-when + de-stuffing).
  `search_knowledge` is already TDQS-clean → minimal read-only lead only. Routing-disambiguation
  keywords asserted by `tool-description-keywords.test.ts` preserved (≥15-of-20 kept; verified
  empirically). Server-level canonical positioning ("The Brain Layer for AI Trading Agents")
  untouched (not in these SoT files).
- **R3 (annotation hints):** SoT spread already complete on all 9 tools — no wiring change.
  Edit = refresh the stale `tool-annotations.ts` doc comment (it listed 6 tools / claimed
  `destructiveHint` unset). `idempotentHint` left unset (moot under `readOnlyHint:true`).
- **R4 (tests):** keep `tool-description-keywords.test.ts` green; add `tool-annotations.test.ts`
  (4-field shape per prod tool, iterated from `allToolNames()`); add the forward-stability canary.
