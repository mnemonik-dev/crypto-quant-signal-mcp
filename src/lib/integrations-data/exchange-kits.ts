/**
 * Exchange Kit integrations — 4 entries (Binance · OKX · Bybit · Bitget).
 *
 * Used at C2 to add the new "Connect Your Exchange Kit" H3 to
 * docs.html#integration. Per-slug landing pages already shipped (4
 * detailed tutorials at /integrations/{binance,okx,bybit,bitget} via
 * INTEGRATIONS-W1 C6 + AI-AGENT-FRAMEWORK-TUTORIALS-W1).
 *
 * Setup snippets reflect live npm/GH coords (Plan-Mode P12 probe
 * 2026-05-19): @okx_ai/okx-trade-mcp@1.3.3 (bumped from spec's 1.3.1);
 * bybit-official-trading-server@2.1.5 (bumped from 2.0.9);
 * bitget-mcp-server@1.1.0 (unchanged); binance/binance-skills-hub is a
 * GH-coord, not an npm package — install via `claude plugin install`.
 */

import type { SurfaceModule } from './types.js';

const EXCHANGE_KITS: SurfaceModule = {
  meta: {
    anchorId: 'connect-exchange-kit',
    title: 'Connect Your Exchange Kit',
    marginTopClass: 'mt-12',
    introHtml:
      "Already running an exchange's Agent Trade Kit? Pair AlgoVault's composite verdict with the kit's execution layer. AlgoVault returns analytics; the exchange kit places orders; your agent decides.",
    firstColumnHeader: 'Exchange',
    footerVerifiedDate: '2026-05-19',
    footerPreamble: 'Tutorials verified 2026-05-19 against:',
    footerDriftNote:
      'Snippets can drift &mdash; if one doesn\'t work, please refer to the upstream doc and report it at <a class="text-mint-400 hover:underline" href="https://github.com/AlgoVaultLabs/crypto-quant-signal-mcp/issues">GitHub issues</a>.',
    footerLinks: [
      { label: 'Binance Skills Hub', href: 'https://github.com/binance/binance-skills-hub' },
      { label: '@okx_ai/okx-trade-mcp', href: 'https://www.npmjs.com/package/@okx_ai/okx-trade-mcp' },
      { label: 'bybit-official-trading-server', href: 'https://www.npmjs.com/package/bybit-official-trading-server' },
      { label: 'bitget-mcp-server', href: 'https://www.npmjs.com/package/bitget-mcp-server' },
    ],
    ctaParagraphHtml:
      'Try an exchange integration: <a class="text-mint-400 hover:underline" href="/integrations/binance">algovault.com/integrations/binance</a>',
  },
  entries: [
    {
      slug: 'binance',
      displayName: 'Binance',
      surfaceType: 'exchange-kit',
      setupSummary:
        '<code class="text-xs bg-navy-800 px-1 rounded">claude plugin install binance/binance-skills-hub</code> &middot; Spot Testnet execution',
      whatYouGet:
        "Composite verdict + official Binance Skills Hub. Agent fetches signals, decides, executes against Binance's testnet.",
      walkthroughHtml: `      <p>Install the Skills Hub plugin alongside AlgoVault:</p>
      <div class="code-block bg-navy-800 border border-white/5 rounded-lg p-4">
        <pre><code class="text-xs text-gray-300">claude plugin install AlgoVaultLabs/algovault-skills
claude plugin install binance/binance-skills-hub</code></pre>
      </div>
      <p>Your agent now has AlgoVault's analytics tools and Binance's execution tools side-by-side. Set <code class="text-xs bg-navy-800 px-1 rounded">BINANCE_TESTNET=true</code> for zero real-money risk during development.</p>
      <p><a href="/integrations/binance" class="text-mint-400 hover:underline">Full tutorial + runnable demo &rarr;</a></p>`,
      fullTutorialUrl: '/integrations/binance',
      hasDedicatedPage: true,
    },
    {
      slug: 'okx',
      displayName: 'OKX',
      surfaceType: 'exchange-kit',
      setupSummary:
        '<code class="text-xs bg-navy-800 px-1 rounded">npx -y @okx_ai/okx-trade-mcp</code> &middot; 83 execution tools (spot, swap, futures, options, grid)',
      whatYouGet:
        "Composite verdict + OKX's full execution surface. Agent reads signals, places orders across spot or derivatives via one MCP server.",
      walkthroughHtml: `      <p>Install OKX's official trade MCP server in your client config:</p>
      <div class="code-block bg-navy-800 border border-white/5 rounded-lg p-4">
        <pre><code class="text-xs text-gray-300">{
  "mcpServers": {
    "algovault": {"url": "https://api.algovault.com/mcp"},
    "okx-trade": {"command": "npx", "args": ["-y", "@okx_ai/okx-trade-mcp"]}
  }
}</code></pre>
      </div>
      <p>Set <code class="text-xs bg-navy-800 px-1 rounded">OKX_DEMO=true</code> (or pass <code class="text-xs">--demo</code>) for the demo trading environment. Real keys go in env vars; never commit them.</p>
      <p><a href="/integrations/okx" class="text-mint-400 hover:underline">Full tutorial + runnable demo &rarr;</a></p>`,
      fullTutorialUrl: '/integrations/okx',
      hasDedicatedPage: true,
    },
    {
      slug: 'bybit',
      displayName: 'Bybit',
      surfaceType: 'exchange-kit',
      setupSummary:
        '<code class="text-xs bg-navy-800 px-1 rounded">npx -y bybit-official-trading-server</code> &middot; Linear Perpetual + conditional orders',
      whatYouGet:
        "Composite verdict + Bybit's official MCP server. Agent fetches AlgoVault signals, places perpetual + conditional orders via Bybit testnet.",
      walkthroughHtml: `      <p>Wire Bybit's official server next to AlgoVault:</p>
      <div class="code-block bg-navy-800 border border-white/5 rounded-lg p-4">
        <pre><code class="text-xs text-gray-300">{
  "mcpServers": {
    "algovault": {"url": "https://api.algovault.com/mcp"},
    "bybit-trade": {"command": "npx", "args": ["-y", "bybit-official-trading-server"]}
  }
}</code></pre>
      </div>
      <p>Set <code class="text-xs bg-navy-800 px-1 rounded">BYBIT_TESTNET=true</code> + API keys in env. Conditional orders (stop-loss, take-profit, OCO) are first-class — your agent can attach risk policy at order time.</p>
      <p><a href="/integrations/bybit" class="text-mint-400 hover:underline">Full tutorial + runnable demo &rarr;</a></p>`,
      fullTutorialUrl: '/integrations/bybit',
      hasDedicatedPage: true,
    },
    {
      slug: 'bitget',
      displayName: 'Bitget',
      surfaceType: 'exchange-kit',
      setupSummary:
        '<code class="text-xs bg-navy-800 px-1 rounded">npx -y bitget-mcp-server</code> &middot; GetClaw agent-native execution',
      whatYouGet:
        "Composite verdict + Bitget's MCP server inside a dedicated AI account. Agent-native execution; isolate from your main funds.",
      walkthroughHtml: `      <p>Bitget exposes a dedicated AI sub-account ("GetClaw") for agent execution:</p>
      <div class="code-block bg-navy-800 border border-white/5 rounded-lg p-4">
        <pre><code class="text-xs text-gray-300">{
  "mcpServers": {
    "algovault": {"url": "https://api.algovault.com/mcp"},
    "bitget-trade": {"command": "npx", "args": ["-y", "bitget-mcp-server"]}
  }
}</code></pre>
      </div>
      <p>Set <code class="text-xs bg-navy-800 px-1 rounded">BITGET_DEMO=true</code> in the wrapper (the MCP server has no built-in demo flag — the env var gates order placement at the client level). Fund the GetClaw account separately from your main account.</p>
      <p><a href="/integrations/bitget" class="text-mint-400 hover:underline">Full tutorial + runnable demo &rarr;</a></p>`,
      fullTutorialUrl: '/integrations/bitget',
      hasDedicatedPage: true,
    },
  ],
};

export default EXCHANGE_KITS;
