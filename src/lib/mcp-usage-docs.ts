/**
 * Single-source Integration H2 section for `landing/docs.html`.
 *
 * Introduced in v1.10.3 as an inline HTML string. Refactored to
 * data-driven in INTEGRATIONS-FULL-STACK-W1 C1 (Fix-at-Generator) — the
 * exported `MCP_USAGE_HTML` constant is now computed from the 3 single-SoT
 * data files in src/lib/integrations-data/ via `renderIntegrationH2`.
 *
 * Rendered into `landing/docs.html` between
 * `<!-- BUILD:mcp-usage:start -->` / `<!-- BUILD:mcp-usage:end -->` markers
 * by `scripts/build_landing.mjs`.
 *
 * Note (C1 scope): `exchangeKits` is passed as null here. C2 will switch
 * it to the EXCHANGE_KITS module to add the 3rd "Connect Your Exchange Kit"
 * H3 to docs.html#integration.
 */

import MCP_CLIENTS from './integrations-data/mcp-clients.js';
import AI_AGENTS from './integrations-data/ai-agents.js';
import { renderIntegrationH2 } from './integrations-data/render.js';

export const MCP_USAGE_HTML: string = renderIntegrationH2({
  mcpClients: MCP_CLIENTS,
  aiAgents: AI_AGENTS,
  exchangeKits: null,
});
