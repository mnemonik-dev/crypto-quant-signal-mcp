/**
 * GEO-MEASUREMENT-W1 (C3) — geo-extractor unit tests.
 *
 * Locks the contract: valid JSON parsed, markdown fences stripped, safe
 * defaults on every failure path, system prompt marked cacheable.
 */
import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, LLMCompletion } from '../../src/lib/llm-provider.js';
import { extractMentions } from '../../src/lib/geo-extractor.js';
import type { GeoQuery, GeoQueryResult } from '../../src/lib/geo-orchestrator.js';

const Q: GeoQuery = {
  id: 'test-q',
  text: 'test query',
  competitor_terms: ['vectorbt', 'ccxt'],
};

const RESULT: GeoQueryResult = {
  run_id: 'r1',
  query_id: 'test-q',
  query_text: 'test query',
  model: 'claude-haiku-4-5-20251001',
  response_text: 'You might try AlgoVault or vectorbt. Both are popular.',
  prompt_tokens: 50,
  completion_tokens: 100,
  latency_ms: 500,
};

class CannedProvider implements LLMProvider {
  readonly name = 'stub' as const;
  public lastOpts: unknown = null;
  constructor(private readonly text: string | (() => never)) {}
  async complete(_messages: unknown, opts: unknown): Promise<LLMCompletion> {
    this.lastOpts = opts;
    if (typeof this.text === 'function') (this.text as () => never)();
    return { text: this.text as string, usage: { promptTokens: 1, completionTokens: 1 } };
  }
}

describe('geo-extractor: extractMentions', () => {
  it('parses valid LLM JSON response into GeoMentions shape', async () => {
    const provider = new CannedProvider(
      JSON.stringify({
        mention_found: true,
        mention_count: 1,
        mention_position: 1,
        mention_context: 'AlgoVault is mentioned',
        competitors_mentioned: ['vectorbt'],
        sentiment_score: 0.5,
      }),
    );
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(true);
    expect(m.mention_count).toBe(1);
    expect(m.mention_position).toBe(1);
    expect(m.mention_context).toBe('AlgoVault is mentioned');
    expect(m.competitors_mentioned).toEqual(['vectorbt']);
    expect(m.sentiment_score).toBe(0.5);
  });

  it('strips markdown JSON fences before parsing', async () => {
    const provider = new CannedProvider(
      '```json\n' +
        JSON.stringify({
          mention_found: false,
          mention_count: 0,
          mention_position: null,
          mention_context: null,
          competitors_mentioned: [],
          sentiment_score: 0,
        }) +
        '\n```',
    );
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(false);
    expect(m.mention_position).toBeNull();
  });

  it('returns safe defaults on LLM provider failure', async () => {
    const provider = new CannedProvider(() => {
      throw new Error('LLM down');
    });
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(false);
    expect(m.mention_count).toBe(0);
    expect(m.mention_position).toBeNull();
    expect(m.competitors_mentioned).toEqual([]);
  });

  it('returns safe defaults on malformed JSON', async () => {
    const provider = new CannedProvider('this is not json at all');
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(false);
    expect(m.competitors_mentioned).toEqual([]);
  });

  it('returns safe defaults when JSON is valid but missing required fields', async () => {
    const provider = new CannedProvider(JSON.stringify({ mention_found: true /* missing the rest */ }));
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(false);
    expect(m.competitors_mentioned).toEqual([]);
  });

  it('passes systemPromptCacheable:true to provider.complete', async () => {
    const provider = new CannedProvider(
      JSON.stringify({
        mention_found: false,
        mention_count: 0,
        mention_position: null,
        mention_context: null,
        competitors_mentioned: [],
        sentiment_score: 0,
      }),
    );
    await extractMentions(provider, Q, RESULT);
    expect((provider.lastOpts as { systemPromptCacheable: boolean }).systemPromptCacheable).toBe(true);
    expect((provider.lastOpts as { systemPrompt: string }).systemPrompt).toContain('AlgoVault');
    expect((provider.lastOpts as { temperature: number }).temperature).toBe(0.0);
  });
});
