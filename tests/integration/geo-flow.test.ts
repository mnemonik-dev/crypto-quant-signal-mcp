/**
 * GEO-MEASUREMENT-W1 (C3) — end-to-end integration test.
 *
 * Wires YAML loader → runWeeklyProbe (StubLLM) → extractor (StubLLM returns
 * canned JSON) → mocked storage → assert storage saw 15 (result, mentions)
 * pairs with valid shapes.
 *
 * Does NOT hit a real DB; storage layer is mocked. Live DB persistence is
 * verified post-deploy via the LIVE_GREEN probe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import type { LLMProvider, LLMCompletion } from '../../src/lib/llm-provider.js';
import type { GeoQueryResult } from '../../src/lib/geo-orchestrator.js';
import type { GeoMentions } from '../../src/lib/geo-extractor.js';

const recordedRuns: Array<{ result: GeoQueryResult; mentions: GeoMentions }> = [];

vi.mock('../../src/lib/geo-storage.js', () => ({
  recordGeoRun: async (result: GeoQueryResult, mentions: GeoMentions) => {
    recordedRuns.push({ result, mentions });
  },
  ensureGeoSchema: () => {
    /* no-op in tests */
  },
}));

import { runWeeklyProbe } from '../../src/lib/geo-orchestrator.js';

const YAML_PATH = path.resolve(__dirname, '..', '..', 'landing', 'Prompt', 'geo-queries.yaml');

const CANNED_EXTRACTOR_JSON = JSON.stringify({
  mention_found: true,
  mention_count: 1,
  mention_position: 2,
  mention_context: 'AlgoVault is a good option…',
  competitors_mentioned: ['vectorbt'],
  sentiment_score: 0.6,
});

class DualBehaviorProvider implements LLMProvider {
  readonly name = 'stub' as const;
  private callCount = 0;
  async complete(_messages: unknown, opts: unknown): Promise<LLMCompletion> {
    this.callCount++;
    // Heuristic: extractor calls pass systemPromptCacheable:true; orchestrator
    // calls pass systemPromptCacheable:undefined.
    const o = opts as { systemPromptCacheable?: boolean };
    if (o.systemPromptCacheable === true) {
      return { text: CANNED_EXTRACTOR_JSON, usage: { promptTokens: 1, completionTokens: 1 } };
    }
    return {
      text: `Top picks include vectorbt and AlgoVault for query #${this.callCount}.`,
      usage: { promptTokens: 10, completionTokens: 30 },
    };
  }
}

beforeEach(() => {
  recordedRuns.length = 0;
});

describe('GEO-MEASUREMENT-W1: end-to-end flow', () => {
  it('processes all 15 queries through orchestrator → extractor → storage', async () => {
    const provider = new DualBehaviorProvider();
    const { runId, resultCount, errorCount } = await runWeeklyProbe({
      provider,
      model: 'claude-haiku-4-5-20251001',
      yamlPath: YAML_PATH,
      interQueryDelayMs: 0,
    });

    expect(resultCount).toBe(15);
    expect(errorCount).toBe(0);
    expect(recordedRuns).toHaveLength(15);

    // Every recorded run has consistent run_id, valid result shape, valid mentions shape
    for (const { result, mentions } of recordedRuns) {
      expect(result.run_id).toBe(runId);
      expect(result.query_id.length).toBeGreaterThan(0);
      expect(result.response_text).toContain('AlgoVault');
      expect(mentions.mention_found).toBe(true);
      expect(mentions.mention_position).toBe(2);
      expect(mentions.competitors_mentioned).toContain('vectorbt');
      expect(mentions.sentiment_score).toBe(0.6);
    }

    // Run IDs are uniform across the run
    const uniqueRunIds = new Set(recordedRuns.map((r) => r.result.run_id));
    expect(uniqueRunIds.size).toBe(1);
  });
});
