/**
 * Single-source Integration H2 section for `landing/docs.html`.
 *
 * Introduced in v1.10.3 as an inline HTML string. Refactored to
 * data-driven in INTEGRATIONS-FULL-STACK-W1 C1 (Fix-at-Generator) — the
 * exported `MCP_USAGE_HTML` constant is now computed from the 3 single-SoT
 * data files in src/lib/integrations-data/ via `renderIntegrationH2`.
 *
 * C2 (this commit): exchangeKits switched from null to EXCHANGE_KITS,
 * adding the 3rd "Connect Your Exchange Kit" H3 with anchor
 * #connect-exchange-kit. H2 intro paragraph updated to mention the
 * 3rd integration path.
 *
 * Rendered into `landing/docs.html` between
 * `<!-- BUILD:mcp-usage:start -->` / `<!-- BUILD:mcp-usage:end -->` markers
 * by `scripts/build_landing.mjs`.
 */

import MCP_CLIENTS from './integrations-data/mcp-clients.js';
import AI_AGENTS from './integrations-data/ai-agents.js';
import EXCHANGE_KITS from './integrations-data/exchange-kits.js';
import { renderIntegrationH2 } from './integrations-data/render.js';

export const MCP_USAGE_HTML: string = renderIntegrationH2({
  mcpClients: MCP_CLIENTS,
  aiAgents: AI_AGENTS,
  exchangeKits: EXCHANGE_KITS,
  h2IntroHtml:
    'Drop AlgoVault into any MCP-compatible client, any major agent framework, or any exchange Agent Trade Kit. Pick your path below.',
});
