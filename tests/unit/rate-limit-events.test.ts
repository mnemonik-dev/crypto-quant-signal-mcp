/**
 * tests/unit/rate-limit-events.test.ts — OPS-RATELIMIT-TELEMETRY-DIGEST-W1 R4
 *
 * Recorder fail-open + the PURE digest trigger logic (both sides of every threshold).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { recordRateLimitEvent } from '../../src/lib/rate-limit-events.js';
import { recordRateLimitEventImpl } from '../../src/lib/performance-db.js';
import { p95, aggregateRateLimit, evaluateRateLimitTriggers } from '../../src/scripts/shadow-digest-weekly.js';

describe('recordRateLimitEvent — fail-open', () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_EVENTS_TEST;
  });

  it('impl never throws when the rate_limit_events table is missing (DB-down equivalent)', () => {
    // Under vitest there is no migrated rate_limit_events table → the INSERT fails →
    // the recorder must swallow it (telemetry must never break the fetch/acquire path).
    expect(() => recordRateLimitEventImpl('TestVenue', 'throw', '418', 'interactive', null)).not.toThrow();
    expect(() => recordRateLimitEventImpl('TestVenue', 'wait', null, 'batch', 1234)).not.toThrow();
  });

  it('thin recorder is a no-op under vitest by default (no DB touched, no throw)', () => {
    expect(() => recordRateLimitEvent('TestVenue', 'skip', null, 'batch')).not.toThrow();
  });

  it('thin recorder runs fail-open when RATE_LIMIT_EVENTS_TEST=1 (no throw, fire-and-forget)', () => {
    process.env.RATE_LIMIT_EVENTS_TEST = '1';
    expect(() => recordRateLimitEvent('TestVenue', 'throw', 'BUDGET_CEILING', 'interactive')).not.toThrow();
  });
});

describe('p95', () => {
  it('returns 0 on empty', () => expect(p95([])).toBe(0));
  it('picks the 95th-percentile element', () => {
    expect(p95([1000])).toBe(1000);
    // 20 samples 1..20 → ceil(0.95*20)-1 = 18 → the 19th value (=19)
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
  });
});

describe('aggregateRateLimit', () => {
  it('rolls counts into per-venue totals (throws split interactive/batch)', () => {
    const out = aggregateRateLimit([
      { venue: 'Hyperliquid', kind: 'throw', class: 'interactive', n: 5 },
      { venue: 'Hyperliquid', kind: 'wait', class: 'batch', n: 2 },
      { venue: 'Bybit', kind: 'throw', class: 'batch', n: 4 },
      { venue: 'Bybit', kind: 'skip', class: 'batch', n: 1 },
    ]);
    const hl = out.find((v) => v.venue === 'Hyperliquid')!;
    expect(hl).toMatchObject({ throws: 5, iThrows: 5, bThrows: 0, waits: 2, skips: 0 });
    const bybit = out.find((v) => v.venue === 'Bybit')!;
    expect(bybit).toMatchObject({ throws: 4, iThrows: 0, bThrows: 4, skips: 1 });
    expect(out[0].venue).toBe('Hyperliquid'); // sorted desc by throws
  });
});

describe('evaluateRateLimitTriggers — both sides of every threshold', () => {
  const venue = (venue: string, o: Partial<{ throws: number; iThrows: number; waits: number; skips: number; bThrows: number }> = {}) =>
    ({ venue, throws: 0, iThrows: 0, bThrows: 0, waits: 0, skips: 0, ...o });

  it('all-healthy → no trigger lines', () => {
    const r = evaluateRateLimitTriggers([venue('Hyperliquid'), venue('Aster')], 0);
    expect(r.lines).toHaveLength(0);
    expect(r.shadowBudget).toBe(false);
    expect(r.hlWebsocket).toBe(false);
  });

  it('shadow throws: 2 = silent, 3 = OPS-SHADOW-BUDGET trigger', () => {
    expect(evaluateRateLimitTriggers([venue('Aster', { throws: 2 })], 0).shadowBudget).toBe(false);
    const hit = evaluateRateLimitTriggers([venue('Aster', { throws: 3 })], 0);
    expect(hit.shadowBudget).toBe(true);
    expect(hit.lines.join('\n')).toContain('OPS-SHADOW-BUDGET-W{NEXT}');
  });

  it('promoted-venue throws do NOT trip the shadow trigger (only non-promoted venues are "shadow")', () => {
    expect(evaluateRateLimitTriggers([venue('Bybit', { throws: 99 })], 0).shadowBudget).toBe(false);
  });

  it('HL interactive throws: 24 = silent, 25 = OPS-HL-WEBSOCKET trigger', () => {
    expect(evaluateRateLimitTriggers([venue('Hyperliquid', { iThrows: 24, throws: 24 })], 0).hlWebsocket).toBe(false);
    const hit = evaluateRateLimitTriggers([venue('Hyperliquid', { iThrows: 25, throws: 25 })], 0);
    expect(hit.hlWebsocket).toBe(true);
    expect(hit.lines.join('\n')).toContain('OPS-HL-WEBSOCKET-W{NEXT}');
  });

  it('HL batch-wait p95: 19s = silent, 21s = OPS-HL-WEBSOCKET trigger (independent of throws)', () => {
    expect(evaluateRateLimitTriggers([venue('Hyperliquid')], 19_000).hlWebsocket).toBe(false);
    expect(evaluateRateLimitTriggers([venue('Hyperliquid')], 21_000).hlWebsocket).toBe(true);
  });

  it('trigger lines use the W{NEXT} template — NEVER a literal wave number', () => {
    const r = evaluateRateLimitTriggers([venue('Aster', { throws: 9 }), venue('Hyperliquid', { iThrows: 99, throws: 99 })], 99_000);
    const joined = r.lines.join('\n');
    expect(joined).toMatch(/W\{NEXT\}/);
    expect(joined).not.toMatch(/-W\d/); // no OPS-...-W1 / -W2 / etc.
  });
});
