/**
 * Byte-equivalence canary for the INTEGRATIONS-FULL-STACK-W1 C1 refactor.
 *
 * The pre-refactor MCP_USAGE_HTML inline string is captured at
 * tests/fixtures/mcp-usage-html-pre-refactor.txt. The refactored
 * `renderIntegrationH2({mcpClients, aiAgents, exchangeKits: null})` MUST
 * produce HTML that — after whitespace normalization — byte-matches the
 * fixture. This catches accidental content drift during the data-layer
 * extraction.
 *
 * Normalization: collapse any run of whitespace (spaces, tabs, newlines)
 * to a single space; trim leading/trailing. Order of tags, attributes,
 * and text content is preserved.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MCP_USAGE_HTML } from '../../src/lib/mcp-usage-docs.js';
import { normalizeHtml } from '../../src/lib/integrations-data/render.js';

const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'mcp-usage-html-pre-refactor.txt');

describe('mcp-usage-docs byte-equivalence (C1 refactor)', () => {
  it('refactored MCP_USAGE_HTML normalizes to match pre-refactor fixture', () => {
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    const normalizedFixture = normalizeHtml(fixture);
    const normalizedRefactored = normalizeHtml(MCP_USAGE_HTML);
    expect(normalizedRefactored).toBe(normalizedFixture);
  });

  it('refactored output preserves all 3 existing anchors (connect-mcp + connect-ai-agent + outer integration)', () => {
    expect(MCP_USAGE_HTML).toContain('id="integration"');
    expect(MCP_USAGE_HTML).toContain('id="connect-mcp"');
    expect(MCP_USAGE_HTML).toContain('id="connect-ai-agent"');
  });

  it('exchangeKits:null path does NOT introduce a 3rd H3 anchor', () => {
    expect(MCP_USAGE_HTML).not.toContain('id="connect-exchange-kit"');
    expect(MCP_USAGE_HTML).not.toContain('Connect Your Exchange Kit');
  });

  it('preserves the 6 MCP-client table rows (5 dedicated + Plain HTTP)', () => {
    expect(MCP_USAGE_HTML).toContain('Claude Desktop');
    expect(MCP_USAGE_HTML).toContain('Cursor');
    expect(MCP_USAGE_HTML).toContain('Cline (VSCode)');
    expect(MCP_USAGE_HTML).toContain('Claude Code');
    expect(MCP_USAGE_HTML).toContain('Smithery');
    expect(MCP_USAGE_HTML).toContain('Plain HTTP / curl');
  });

  it('preserves the 4 AI-agent framework table rows', () => {
    expect(MCP_USAGE_HTML).toContain('LangChain');
    expect(MCP_USAGE_HTML).toContain('LlamaIndex');
    expect(MCP_USAGE_HTML).toContain('Microsoft Agent Framework');
    expect(MCP_USAGE_HTML).toContain('CrewAI');
  });

  it('preserves all 4 NEW /integrations/<framework> tutorial links', () => {
    expect(MCP_USAGE_HTML).toContain('/integrations/langchain');
    expect(MCP_USAGE_HTML).toContain('/integrations/llamaindex');
    expect(MCP_USAGE_HTML).toContain('/integrations/maf');
    expect(MCP_USAGE_HTML).toContain('/integrations/crewai');
  });

  it('does NOT leak the deprecated /docs/integrations/<slug> path', () => {
    expect(MCP_USAGE_HTML).not.toMatch(
      /\/docs\/integrations\/(binance|okx|bybit|bitget|langchain|llamaindex|maf|crewai)/,
    );
  });
});
