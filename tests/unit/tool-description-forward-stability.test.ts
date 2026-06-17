/**
 * GEO-REGISTRY-RANK-TDQS-W1 forward-stability canary (2026-06-17).
 *
 * Locks the forward-stability rule: a tool description (or param describe()
 * string) must NEVER hardcode a VOLATILE count — exchange / asset / venue /
 * timeframe counts, or a win-rate %. Volatile counts are the root cause of the
 * stale registry-listing bug class (e.g. a Glama listing frozen at an old
 * "N exchanges / M+ assets" because the number was baked into description text
 * instead of described qualitatively). Capability is described QUALITATIVELY
 * ("across major crypto perpetual venues"), never enumerated.
 *
 * The check regexes the actual EXPORTED string constants (what ships in
 * tools/list), so any NEW description added later is covered automatically —
 * a future hardcoded count fails CI here.
 *
 * Note: a param RANGE like "1-100" (a capability bound, e.g. topN) is NOT a
 * volatile count — it is a fixed parameter domain. The regexes below target
 * "<number> <exchanges|assets|venues|timeframes>" and "NN%" specifically.
 */
import { describe, it, expect } from 'vitest';
import * as descriptions from '../../src/tool-descriptions.js';

// "<n> exchanges|assets|venues|timeframes" (singular/plural, optional trailing +).
const VOLATILE_COUNT_RE = /\b\d+\+?\s*(exchanges?|assets?|venues?|timeframes?)\b/i;
// A win-rate / percentage figure (two-digit %, optional decimals).
const WIN_RATE_RE = /\b\d{2}(\.\d+)?%/;

// Every exported STRING constant in tool-descriptions.ts = a tool description,
// a param describe() string, or the alias suffix. (TOP_20_KEYWORDS is an array
// and is filtered out by the typeof check.)
const STRING_CONSTANTS: Array<[string, string]> = Object.entries(descriptions).filter(
  (entry): entry is [string, string] => typeof entry[1] === 'string',
);

describe('GEO-REGISTRY-RANK-TDQS-W1 — description forward-stability canary', () => {
  it('covers a non-trivial set of exported description strings', () => {
    // Guards against the filter silently matching nothing (then every assertion
    // below would vacuously pass).
    expect(STRING_CONSTANTS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(STRING_CONSTANTS)('%s contains no hardcoded exchange/asset/venue/timeframe count', (name, value) => {
    const m = value.match(VOLATILE_COUNT_RE);
    if (m) {
      throw new Error(`${name}: volatile count "${m[0]}" — describe capability qualitatively, do not enumerate.`);
    }
    expect(m).toBeNull();
  });

  it.each(STRING_CONSTANTS)('%s contains no hardcoded win-rate / percentage figure', (name, value) => {
    const m = value.match(WIN_RATE_RE);
    if (m) {
      throw new Error(`${name}: win-rate/% figure "${m[0]}" — public track-record numbers come from live /api/performance-public, never baked into copy.`);
    }
    expect(m).toBeNull();
  });
});
