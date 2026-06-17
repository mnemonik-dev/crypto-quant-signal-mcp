import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

/**
 * Generator-level single source of truth for the MCP tool-annotation hints
 * carried by EVERY public AlgoVault tool. index.ts registers each tool as
 * `{ title, ...PUBLIC_READONLY_TOOL_ANNOTATIONS }`, so all three behavioral
 * hints come verbatim from this one constant — no hand-written annotations
 * object that can silently drift. The live prod set spreading it (verified via
 * tools/list, 2026-06-17): get_trade_call, get_trade_signal, get_market_regime,
 * scan_funding_arb, scan_trade_calls, get_equity_call, get_equity_regime,
 * chat_knowledge, search_knowledge. tests/unit/tool-annotations.test.ts locks
 * the shape + the prod tool set; adding a tool forces a deliberate update there.
 *
 * Why centralise: the OpenAI Apps SDK / ChatGPT App Directory relies on these
 * hints to classify the app as safe, read-only decision-support — no
 * confirmation gate, no autonomous money movement. A single constant means
 * every future tool inherits the correct, policy-clean hints by importing this
 * value (the historical failure mode left destructiveHint unset on a subset).
 *
 * Semantics (CHATGPT-APP-DIRECTORY-SUBMIT-W1, architect-confirmed 2026-05-31;
 * doc + prod-set refreshed GEO-REGISTRY-RANK-TDQS-W1, 2026-06-17):
 *   readOnlyHint    true  — tools only retrieve/compute; they never write or
 *                           send data on the caller's behalf.
 *   openWorldHint   true  — every tool surfaces LIVE external data (an open,
 *                           changing world): trading tools read venue/exchange
 *                           APIs; the knowledge tools query an evolving external
 *                           knowledge corpus (chat_knowledge additionally calls
 *                           an LLM). Deliberately TRUE because it is accurate;
 *                           the directory keys its policy review on the
 *                           read-only + non-destructive hints, not openWorldHint.
 *   destructiveHint false — no irreversible side effects in any code path.
 *
 * idempotentHint is intentionally unset — moot under readOnlyHint:true (a read
 * has no environment effect) and not MCP-spec-meaningful here. Keep this a
 * single shared constant; extend it, do not fork per-tool.
 */
export const PUBLIC_READONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
};
