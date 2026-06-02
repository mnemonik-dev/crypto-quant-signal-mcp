/**
 * GEO-MEASUREMENT-W1 (C1) — weekly LLM-recommendation probe orchestrator.
 *
 * Loads the canonical 15-query SoT from `landing/Prompt/geo-queries.yaml`,
 * runs each query against an `LLMProvider` (default: Claude Haiku 4.5 via
 * `AnthropicProvider` from AV-CHAT-MCP-W1), then delegates to the extractor
 * + storage primitives. Pure orchestration; no DB calls or HTTP routes here.
 *
 * Fix-at-generator: this is the ONE orchestrator. Adding probe queries =
 * edit YAML. Adding LLM providers (W2) = implement `LLMProvider`, pass into
 * `runWeeklyProbe`. Zero changes to extractor / storage / dashboard / cron.
 */
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LLMProvider } from './llm-provider.js';
import { extractMentions, SAFE_DEFAULTS, type GeoMentions } from './geo-extractor.js';
import { recordGeoRun } from './geo-storage.js';

export interface GeoQuery {
  id: string;
  text: string;
  competitor_terms: string[];
}

export interface GeoQueryResult {
  run_id: string;
  query_id: string;
  query_text: string;
  model: string;
  response_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  error_code?: string;
}

/**
 * Resolve YAML path. Default: `landing/Prompt/geo-queries.yaml` relative to
 * the compiled module's location (`dist/lib/` → repo root). Override via
 * `yamlPath` arg for tests.
 */
export function loadQueries(yamlPath?: string): GeoQuery[] {
  const resolved =
    yamlPath ??
    path.resolve(__dirname, '..', '..', 'landing', 'Prompt', 'geo-queries.yaml');
  const raw = yaml.load(fs.readFileSync(resolved, 'utf-8')) as { queries: GeoQuery[] };
  if (!raw || !Array.isArray(raw.queries)) {
    throw new Error(`geo-queries.yaml at ${resolved} missing 'queries' array`);
  }
  return raw.queries;
}

/**
 * Run one query through the LLM. Returns a GeoQueryResult shape on success
 * OR on failure (with `error_code` populated). Never throws — the weekly
 * probe must continue across query-level errors.
 */
export async function runGeoQuery(
  provider: LLMProvider,
  query: GeoQuery,
  model: string,
  runId: string,
): Promise<GeoQueryResult> {
  const start = Date.now();
  try {
    const result = await provider.complete(
      [{ role: 'user', content: query.text }],
      {
        model,
        maxTokens: 800,
        temperature: 0.3, // moderate temp — match a real user's asking experience
        systemPrompt: '', // no system prompt: we measure the LLM's default recommendation behavior
      },
    );
    return {
      run_id: runId,
      query_id: query.id,
      query_text: query.text,
      model,
      response_text: result.text,
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      run_id: runId,
      query_id: query.id,
      query_text: query.text,
      model,
      response_text: '',
      prompt_tokens: 0,
      completion_tokens: 0,
      latency_ms: Date.now() - start,
      error_code: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

/**
 * Run the full weekly probe: load YAML, iterate queries, extract mentions,
 * persist results. Spreads queries over ~5 min to avoid API-rate-limit spikes.
 * Returns summary for the cron caller's digest.
 */
export async function runWeeklyProbe(opts: {
  provider: LLMProvider;
  model: string;
  yamlPath?: string;
  /** Delay between queries in ms. Default 15s. Set to 0 in tests. */
  interQueryDelayMs?: number;
}): Promise<{ runId: string; resultCount: number; errorCount: number }> {
  const runId = randomUUID();
  const queries = loadQueries(opts.yamlPath);
  const delay = opts.interQueryDelayMs ?? 15_000;
  let errorCount = 0;
  let successCount = 0;

  console.log(`[geo-orchestrator] starting weekly probe run_id=${runId} queries=${queries.length} model=${opts.model}`);

  for (const query of queries) {
    const result = await runGeoQuery(opts.provider, query, opts.model, runId);
    if (result.error_code) errorCount++;
    else successCount++;

    // GEO-MEASUREMENT-W2 (C2 forced-touch): error-path mentions = the
    // extractor's SAFE_DEFAULTS (single source) so future GeoMentions fields
    // never re-break this literal. Citation-threading + ctx arrive in C5.
    const mentions: GeoMentions = result.error_code
      ? { ...SAFE_DEFAULTS }
      : await extractMentions(opts.provider, query, result);

    await recordGeoRun(result, mentions);
    console.log(
      `[geo-orchestrator] query=${query.id} status=${result.error_code ? 'error' : 'ok'} mention_found=${mentions.mention_found}`,
    );

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  console.log(`[geo-orchestrator] run ${runId} complete: ${successCount} ok, ${errorCount} errors`);
  return { runId, resultCount: queries.length, errorCount };
}
