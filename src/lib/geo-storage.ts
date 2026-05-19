/**
 * GEO-MEASUREMENT-W1 (C1) — Postgres storage for geo_query_runs + geo_mentions
 * + geo_weekly_summary view. Mirrors CHAT-USAGE-ANALYTICS-W1 schema-pattern:
 * `ensureGeoSchema()` is idempotent (CREATE IF NOT EXISTS / CREATE OR REPLACE
 * VIEW) and called from `src/index.ts` module-init.
 *
 * `recordGeoRun()` is fire-and-forget — never throws to the caller. Errors
 * land in console.error (per CLAUDE.md default-deny + load-bearing-logging
 * rule); the success path is implicit via the orchestrator's existing
 * per-query log.
 */
import { dbExec, dbRun } from './performance-db.js';
import type { GeoQueryResult } from './geo-orchestrator.js';
import type { GeoMentions } from './geo-extractor.js';

export function ensureGeoSchema(): void {
  // SINGLE multi-statement dbExec — PgBackend.exec is fire-and-forget per
  // statement, so issuing N separate dbExec calls races (CREATE INDEX
  // referencing a not-yet-committed CREATE TABLE fails). Pg's pool.query()
  // processes a single multi-statement SQL string in order within ONE
  // backend session. Witnessed live in GEO-MEASUREMENT-W1 deploy:
  // 5 indexes + view all failed because they raced their CREATE TABLEs.
  dbExec(`
    CREATE TABLE IF NOT EXISTS geo_query_runs (
      id                BIGSERIAL PRIMARY KEY,
      run_id            UUID NOT NULL,
      ran_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      model             TEXT NOT NULL,
      query_id          TEXT NOT NULL,
      query_text        TEXT NOT NULL,
      response_text     TEXT NOT NULL,
      prompt_tokens     INT NOT NULL DEFAULT 0,
      completion_tokens INT NOT NULL DEFAULT 0,
      latency_ms        INT NOT NULL DEFAULT 0,
      error_code        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_geo_query_runs_ran_at ON geo_query_runs (ran_at);
    CREATE INDEX IF NOT EXISTS idx_geo_query_runs_run_id ON geo_query_runs (run_id);
    CREATE INDEX IF NOT EXISTS idx_geo_query_runs_query_id ON geo_query_runs (query_id, ran_at);

    CREATE TABLE IF NOT EXISTS geo_mentions (
      id                     BIGSERIAL PRIMARY KEY,
      run_id                 UUID NOT NULL,
      ran_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
      query_id               TEXT NOT NULL,
      model                  TEXT NOT NULL,
      mention_found          BOOLEAN NOT NULL,
      mention_count          INT NOT NULL DEFAULT 0,
      mention_position       INT,
      mention_context        TEXT,
      competitors_mentioned  TEXT[],
      sentiment_score        REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_geo_mentions_ran_at ON geo_mentions (ran_at);
    CREATE INDEX IF NOT EXISTS idx_geo_mentions_query_id ON geo_mentions (query_id, ran_at);

    CREATE OR REPLACE VIEW geo_weekly_summary AS
    SELECT
      date_trunc('week', ran_at AT TIME ZONE 'UTC') AS week_utc,
      model,
      count(*) AS query_count,
      count(*) FILTER (WHERE mention_found) AS mention_count,
      ROUND(100.0 * count(*) FILTER (WHERE mention_found) / NULLIF(count(*), 0), 1) AS mention_rate_pct,
      AVG(mention_position) FILTER (WHERE mention_found) AS avg_position,
      AVG(sentiment_score) FILTER (WHERE mention_found) AS avg_sentiment
    FROM geo_mentions
    WHERE ran_at > now() - interval '1 year'
    GROUP BY week_utc, model
    ORDER BY week_utc DESC, model;
  `);
}

/**
 * Persist one (result, mentions) pair. Fire-and-forget — catches and logs;
 * never throws to the orchestrator. Mirrors `recordChatEvent` precedent.
 */
export async function recordGeoRun(result: GeoQueryResult, mentions: GeoMentions): Promise<void> {
  try {
    dbRun(
      `INSERT INTO geo_query_runs
         (run_id, model, query_id, query_text, response_text, prompt_tokens, completion_tokens, latency_ms, error_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      result.run_id,
      result.model,
      result.query_id,
      result.query_text,
      result.response_text,
      result.prompt_tokens,
      result.completion_tokens,
      result.latency_ms,
      result.error_code ?? null,
    );
    dbRun(
      `INSERT INTO geo_mentions
         (run_id, query_id, model, mention_found, mention_count, mention_position, mention_context, competitors_mentioned, sentiment_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      result.run_id,
      result.query_id,
      result.model,
      mentions.mention_found,
      mentions.mention_count,
      mentions.mention_position,
      mentions.mention_context,
      mentions.competitors_mentioned,
      mentions.sentiment_score,
    );
  } catch (err) {
    console.error(
      `[geo-storage] insert failed (silent recovery) run_id=${result.run_id} query_id=${result.query_id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
