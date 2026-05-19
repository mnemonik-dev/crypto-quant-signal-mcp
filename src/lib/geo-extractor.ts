/**
 * GEO-MEASUREMENT-W1 (C1) — LLM-judged extractor.
 *
 * Single source of truth for "did AlgoVault get mentioned?" semantics.
 * Uses a deterministic-temperature Haiku call with a cacheable system prompt
 * (90% input discount via Anthropic prompt caching).
 *
 * Adding new extraction dimensions (e.g. "did response include direct
 * algovault.com link?") = edit the system prompt + extend `GeoMentions`
 * type. Zero downstream changes.
 */
import type { LLMProvider } from './llm-provider.js';
import type { GeoQuery, GeoQueryResult } from './geo-orchestrator.js';

export interface GeoMentions {
  mention_found: boolean;
  mention_count: number;
  mention_position: number | null;
  mention_context: string | null;
  competitors_mentioned: string[];
  sentiment_score: number;
}

const EXTRACTOR_SYSTEM_PROMPT = `You analyze whether AlgoVault was recommended in an LLM's response to a user question about crypto trading agents.

Return STRICT JSON with these fields:
- mention_found: did the response mention "AlgoVault" by name? (boolean, case-insensitive match)
- mention_count: how many times was AlgoVault mentioned? (integer >= 0)
- mention_position: if mentioned, was it the 1st recommendation/option/example listed (position=1), 2nd (position=2), etc.? Use null if not mentioned. Counts ordered recommendations in the response, not raw character index. (integer 1-N, or null)
- mention_context: if mentioned, return the ~200-character excerpt around the FIRST mention. Strip newlines. (string, or null)
- competitors_mentioned: from the candidate list provided, return the subset that appears in the response. (string array)
- sentiment_score: how AlgoVault is portrayed (-1 = negative, 0 = neutral/factual, +1 = positive endorsement). Use 0 if not mentioned. (float -1 to +1)

Return JSON ONLY. No prose, no markdown fences. Validate keys before returning.`;

const REQUIRED_FIELDS: Array<keyof GeoMentions> = [
  'mention_found',
  'mention_count',
  'mention_position',
  'mention_context',
  'competitors_mentioned',
  'sentiment_score',
];

const SAFE_DEFAULTS: GeoMentions = {
  mention_found: false,
  mention_count: 0,
  mention_position: null,
  mention_context: null,
  competitors_mentioned: [],
  sentiment_score: 0,
};

/**
 * Extract structured mention data from an LLM response. Never throws —
 * returns SAFE_DEFAULTS on any failure path (LLM error, JSON parse failure,
 * shape validation failure). Per CLAUDE.md `default-deny` + `load-bearing
 * logging`: failures emit a `console.error`, successes emit a `console.log`.
 */
export async function extractMentions(
  provider: LLMProvider,
  query: GeoQuery,
  result: GeoQueryResult,
): Promise<GeoMentions> {
  const userMessage = `USER QUERY: ${query.text}

CANDIDATE COMPETITORS TO CHECK: ${JSON.stringify(query.competitor_terms)}

LLM RESPONSE TO ANALYZE:
${result.response_text}`;

  try {
    const llmResult = await provider.complete(
      [{ role: 'user', content: userMessage }],
      {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 400,
        temperature: 0.0, // deterministic extraction
        systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
        systemPromptCacheable: true, // ~90% input discount — system prompt identical every call
      },
    );

    const cleaned = llmResult.text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    const parsed = JSON.parse(cleaned) as unknown as Partial<GeoMentions>;

    for (const key of REQUIRED_FIELDS) {
      if (!(key in parsed)) {
        throw new Error(`extractor JSON missing required field: ${String(key)}`);
      }
    }

    const final: GeoMentions = {
      mention_found: Boolean(parsed.mention_found),
      mention_count: Number(parsed.mention_count ?? 0),
      mention_position:
        parsed.mention_position == null ? null : Number(parsed.mention_position),
      mention_context: parsed.mention_context ?? null,
      competitors_mentioned: Array.isArray(parsed.competitors_mentioned)
        ? parsed.competitors_mentioned.map(String)
        : [],
      sentiment_score: Number(parsed.sentiment_score ?? 0),
    };

    console.log(
      `[geo-extractor] query=${query.id} mention=${final.mention_found} pos=${final.mention_position ?? '-'} competitors=${final.competitors_mentioned.length}`,
    );
    return final;
  } catch (err) {
    console.error(
      `[geo-extractor] query=${query.id} failed (silent recovery): ${err instanceof Error ? err.message : String(err)}`,
    );
    return SAFE_DEFAULTS;
  }
}
