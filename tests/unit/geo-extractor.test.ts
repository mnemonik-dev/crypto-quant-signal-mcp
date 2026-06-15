/**
 * GEO-MEASUREMENT-W1 (C3) — geo-extractor unit tests.
 *
 * Locks the contract: valid JSON parsed, markdown fences stripped, safe
 * defaults on every failure path, system prompt marked cacheable.
 */
import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider, LLMCompletion, Citation } from '../../src/lib/llm-provider.js';
import { extractMentions, mapSourceCitations, isOwnHost } from '../../src/lib/geo-extractor.js';
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

describe('geo-extractor: W2 retrieval dimensions (extractMentions)', () => {
  const SIX = {
    mention_found: true,
    mention_count: 1,
    mention_position: 1,
    mention_context: 'AlgoVault',
    competitors_mentioned: ['vectorbt'],
    sentiment_score: 0.5,
  };

  it('parses + clamps share_of_voice and derives cited/cited_url from citations', async () => {
    const provider = new CannedProvider(JSON.stringify({ ...SIX, share_of_voice: 0.25 }));
    const cites: Citation[] = [
      { url: 'https://algovault.com/faq' },
      { url: 'https://github.com/polakowo/vectorbt' },
    ];
    const m = await extractMentions(provider, Q, RESULT, cites);
    expect(m.share_of_voice).toBe(0.25);
    expect(m.cited).toBe(true);
    expect(m.cited_url).toBe('https://algovault.com/faq');
  });

  it('clamps out-of-range share_of_voice into [0,1]', async () => {
    const provider = new CannedProvider(JSON.stringify({ ...SIX, share_of_voice: 4 }));
    const m = await extractMentions(provider, Q, RESULT, []);
    expect(m.share_of_voice).toBe(1);
  });

  it('defaults share_of_voice to 0 when absent — W1 JSON (no SoV) still parses', async () => {
    const provider = new CannedProvider(JSON.stringify(SIX)); // no share_of_voice
    const m = await extractMentions(provider, Q, RESULT);
    expect(m.mention_found).toBe(true);
    expect(m.share_of_voice).toBe(0);
    expect(m.cited).toBe(false);
    expect(m.cited_url).toBeNull();
  });

  it('preserves cited/cited_url even on LLM failure (deterministic from citations)', async () => {
    const provider = new CannedProvider(() => {
      throw new Error('LLM down');
    });
    const m = await extractMentions(provider, Q, RESULT, [{ url: 'https://docs.algovault.com/x' }]);
    expect(m.mention_found).toBe(false); // safe defaults
    expect(m.cited).toBe(true); // but citation facts survive
    expect(m.cited_url).toBe('https://docs.algovault.com/x');
  });
});

describe('geo-extractor: mapSourceCitations (source-citation map)', () => {
  it('classifies algovault.com -> algovault, vectorbt -> competitor, else neutral; ranks in order', () => {
    const cites: Citation[] = [
      { url: 'https://algovault.com/faq', title: 'FAQ' },
      { url: 'https://github.com/polakowo/vectorbt', title: 'vectorbt' },
      { url: 'https://example.com/random-blog' },
    ];
    const mapped = mapSourceCitations(Q, cites); // Q.competitor_terms = ['vectorbt','ccxt']
    expect(mapped).toHaveLength(3);
    expect(mapped[0]).toMatchObject({ attributed_to: 'algovault', source_domain: 'algovault.com', rank: 1 });
    expect(mapped[1]).toMatchObject({ attributed_to: 'competitor', competitor_name: 'vectorbt', rank: 2 });
    expect(mapped[2]).toMatchObject({ attributed_to: 'neutral', competitor_name: null, rank: 3 });
  });

  it('skips citations without a url', () => {
    const mapped = mapSourceCitations(Q, [{ url: '' }, { url: 'https://algovault.com' }] as Citation[]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].attributed_to).toBe('algovault');
  });
});

describe('geo-extractor: look-alike domains are NOT attributed to AlgoVault (INVESTIGATE-LOOKALIKE-DOMAINS-W1)', () => {
  // algovault.io / algovaults.com / algovaultai.com (+ newsletter.) / algovaultstrategies.com
  // all CONTAIN the substring "algovault" but are NOT ours — a bare substring match
  // mis-tagged their citations as trusted and inflated the weekly momentum verdict.
  it('mapSourceCitations tags every look-alike neutral; only the real apex is algovault', () => {
    const cites: Citation[] = [
      { url: 'https://algovault.com/track-record' }, // ours
      { url: 'https://algovaults.com/' }, // MT5 Gold-EA look-alike
      { url: 'https://www.algovaultstrategies.com/' }, // TradingView-strategy look-alike
      { url: 'https://newsletter.algovaultai.com/' }, // creator-newsletter look-alike
      { url: 'https://algovault.io/' }, // digital-agency look-alike
    ];
    const by: Record<string, string> = {};
    for (const m of mapSourceCitations(Q, cites)) by[m.source_domain] = m.attributed_to;
    expect(by['algovault.com']).toBe('algovault');
    expect(by['algovaults.com']).toBe('neutral');
    expect(by['www.algovaultstrategies.com']).toBe('neutral');
    expect(by['newsletter.algovaultai.com']).toBe('neutral');
    expect(by['algovault.io']).toBe('neutral');
  });

  it('deriveCited (via extractMentions) does NOT set cited for a look-alike-only citation set', async () => {
    const provider = new CannedProvider(() => {
      throw new Error('LLM down');
    });
    const m = await extractMentions(provider, Q, RESULT, [
      { url: 'https://algovaults.com/pricing' },
      { url: 'https://www.algovaultstrategies.com/' },
    ]);
    expect(m.cited).toBe(false);
    expect(m.cited_url).toBeNull();
  });

  it('still attributes the real apex + subdomains to AlgoVault (no over-correction)', async () => {
    const provider = new CannedProvider(() => {
      throw new Error('LLM down');
    });
    const m = await extractMentions(provider, Q, RESULT, [
      { url: 'https://algovaults.com/x' }, // look-alike first
      { url: 'https://docs.algovault.com/guide' }, // our subdomain
    ]);
    expect(m.cited).toBe(true);
    expect(m.cited_url).toBe('https://docs.algovault.com/guide');
  });
});

describe('geo-extractor: isOwnHost — exact ownership, not substring', () => {
  it('accepts the apex and any algovault.com subdomain', () => {
    expect(isOwnHost('algovault.com')).toBe(true);
    expect(isOwnHost('www.algovault.com')).toBe(true);
    expect(isOwnHost('docs.algovault.com')).toBe(true);
    expect(isOwnHost('ALGOVAULT.COM')).toBe(true); // case-insensitive
    expect(isOwnHost('algovault.com.')).toBe(true); // FQDN trailing dot
  });
  it('rejects look-alikes and prefix/suffix spoofs that merely contain "algovault"', () => {
    expect(isOwnHost('algovault.io')).toBe(false);
    expect(isOwnHost('algovaults.com')).toBe(false);
    expect(isOwnHost('algovaultai.com')).toBe(false);
    expect(isOwnHost('newsletter.algovaultai.com')).toBe(false);
    expect(isOwnHost('www.algovaultstrategies.com')).toBe(false);
    expect(isOwnHost('evil-algovault.com')).toBe(false); // prefix spoof
    expect(isOwnHost('algovault.com.evil.example')).toBe(false); // suffix spoof
  });
});
