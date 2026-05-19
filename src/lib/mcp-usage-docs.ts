/**
 * Single-source Integration H2 section for `landing/docs.html`.
 *
 * Introduced in v1.10.3 as an inline HTML string. Later refactored to
 * data-driven (Fix-at-Generator) — the exported `MCP_USAGE_HTML`
 * constant is now computed from the 3 single-SoT data files in
 * src/lib/integrations-data/ via `renderIntegrationH2`.
 *
 * The renderer accepts exchangeKits as the 3rd surface, adding the
 * "Connect Your Exchange Kit" H3 with anchor #connect-exchange-kit
 * alongside #connect-mcp and #connect-ai-agent. H2 intro paragraph
 * mentions the 3 integration paths.
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
