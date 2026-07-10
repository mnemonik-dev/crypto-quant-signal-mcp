/**
 * FUNNEL-FIX-ATTRIBUTION-W1 — extensible LLM-client User-Agent → source map (add-a-row).
 *
 * SEEDED FROM OBSERVED UAs ONLY (Mr.1: "a guessed UA silently never matches"). Today only
 * `claude` is observed in the connect logs (272 connects); `chatgpt` carries an identifying
 * connector UA too. Cursor / Windsurf / Cline / Continue / Zed / Copilot are ADDED HERE only
 * once their REAL UA is seen — the `logUnmatchedUa` sampler below surfaces them in the logs.
 * Default-deny: an unmatched UA stays `unknown` (never fabricate a channel).
 */
import type { AttributionSource } from './attribution-sources.js';

export interface LlmClientPattern {
  pattern: RegExp;
  source: AttributionSource;
  note: string;
}

/**
 * OBSERVED-only seed. Extend by adding a row AFTER seeing the real UA in the logs
 * (via logUnmatchedUa). The enum already carries cursor/windsurf/cline/continue/zed/copilot
 * slugs so a new row is one line here — no enum edit needed.
 */
export const LLM_CLIENT_UA: ReadonlyArray<LlmClientPattern> = [
  { pattern: /chatgpt|openai/i, source: 'chatgpt', note: 'ChatGPT connector UA' },
  { pattern: /claude|anthropic/i, source: 'claude', note: 'observed — 272 connects' },
  // ── add once observed (paste the real UA substring) ──
  // { pattern: /cursor/i,   source: 'cursor',   note: 'pending observed UA' },
  // { pattern: /windsurf/i, source: 'windsurf', note: 'pending observed UA' },
  // { pattern: /cline/i,    source: 'cline',    note: 'pending observed UA' },
];

/** Match a UA against the client map; null if unmatched. Pure. */
export function matchLlmClientUa(ua: string): AttributionSource | null {
  if (!ua) return null;
  for (const c of LLM_CLIENT_UA) if (c.pattern.test(ua)) return c.source;
  return null;
}

// ── Log-only unmatched-UA sampler (NO DB retention, NO PII) ──────────────────────
// Truncated + deduped + bounded, so the operator greps logs to find real cursor/windsurf
// UAs and adds a row. Forensic-in-logs (per CLAUDE.md — logs, not the alert channel).
const _seenUaSamples = new Set<string>();
const MAX_UA_SAMPLES = 500;

/** Log a truncated sample of an UNMATCHED, non-empty UA (once per distinct sample, bounded). */
export function logUnmatchedUa(ua: string | undefined | null): void {
  if (typeof ua !== 'string' || ua.length < 4) return;
  const sample = ua.slice(0, 64);
  if (_seenUaSamples.has(sample) || _seenUaSamples.size >= MAX_UA_SAMPLES) return;
  _seenUaSamples.add(sample);
  console.log(`[attribution] unmatched-UA sample (add a llm-clients.ts row if it's a channel): ${sample}`);
}

/** Test seam (module-level-cache reset idiom). */
export function _resetUaSamplesForTest(): void {
  _seenUaSamples.clear();
}
