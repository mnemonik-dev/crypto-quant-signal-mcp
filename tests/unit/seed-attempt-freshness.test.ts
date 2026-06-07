// OPS-SEED-FRESHNESS-W1 — attempt-heartbeat pager (pure units).
// monitor.ts runs main() on import (not import-safe), so the existing pattern
// tests the PURE evaluators. The new paging logic is extracted into pure helpers
// in monitor-seed-freshness.ts + the R1 cross-TF read in seed-heartbeats.ts.
import { describe, it, expect, vi } from 'vitest';

// seed-heartbeats imports ONLY dbQuery from performance-db → mock it to capture SQL.
vi.mock('../../src/lib/performance-db.js', () => ({ dbQuery: vi.fn(async () => []) }));
import { getLatestSeedHeartbeatPerVenue } from '../../src/lib/seed-heartbeats.js';
import { dbQuery } from '../../src/lib/performance-db.js';
import { buildSeedFreshnessRows, formatSeedOutagePage, evaluateSeedFreshness } from '../../src/scripts/monitor-seed-freshness.js';

describe('OPS-SEED-FRESHNESS-W1 — attempt-heartbeat pager', () => {
  it('R1 getLatestSeedHeartbeatPerVenue: cross-TF max(last_attempt_at) GROUP BY exchange, NO WHERE/timeframe', async () => {
    (dbQuery as ReturnType<typeof vi.fn>).mockClear();
    await getLatestSeedHeartbeatPerVenue();
    const sql = (dbQuery as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toMatch(/SELECT exchange,\s*max\(last_attempt_at\)\s*AS last_attempt_at/i);
    expect(sql).toMatch(/FROM seed_heartbeats\s+GROUP BY exchange/i);
    expect(sql).not.toMatch(/WHERE/i);      // cross-TF — no per-timeframe filter
    expect(sql).not.toMatch(/timeframe/i);
  });

  it('buildSeedFreshnessRows: present → ×1000 ms; missing promoted venue → null (report-not-page)', () => {
    const rows = buildSeedFreshnessRows(['BINANCE', 'HL', 'NEWVENUE'], [
      { exchange: 'BINANCE', last_attempt_at: 1700 },
      { exchange: 'HL', last_attempt_at: 1600 },
      // NEWVENUE has no heartbeat row
    ]);
    expect(rows).toEqual([
      { exchange: 'BINANCE', lastCreatedAtMs: 1_700_000 },
      { exchange: 'HL', lastCreatedAtMs: 1_600_000 },
      { exchange: 'NEWVENUE', lastCreatedAtMs: null },
    ]);
  });

  it('formatSeedOutagePage: all fresh (or never-seen) → null (no page)', () => {
    const now = Date.now();
    const verdicts = evaluateSeedFreshness([
      { exchange: 'BINANCE', lastCreatedAtMs: now - 60_000 },  // 1m fresh
      { exchange: 'NEW', lastCreatedAtMs: null },               // never-seen → staleMin -1, not stale
    ], now, 45);
    expect(formatSeedOutagePage(verdicts)).toBeNull();
  });

  it('formatSeedOutagePage: stale venue → page string naming ONLY it + staleMin + no hardcoded W<N>', () => {
    const now = Date.now();
    const verdicts = evaluateSeedFreshness([
      { exchange: 'BINANCE', lastCreatedAtMs: now - 60_000 },     // fresh
      { exchange: 'OKX', lastCreatedAtMs: now - 46 * 60_000 },    // 46m stale
    ], now, 45);
    const page = formatSeedOutagePage(verdicts);
    expect(page).not.toBeNull();
    expect(page!).toContain('OKX');
    expect(page!).toContain('46m');
    expect(page!).not.toContain('BINANCE');   // only stale venues named
    expect(page!).not.toMatch(/W\d+/);        // recommendation-drift rule: no literal wave id
    expect(page!).toMatch(/45m|outage/i);     // cause hint present
  });

  it('boundary: 44m attempt not stale, 46m stale (45 threshold) — via the ×1000 conversion', () => {
    const now = Date.now();
    const rows = buildSeedFreshnessRows(['A', 'B'], [
      { exchange: 'A', last_attempt_at: Math.floor((now - 44 * 60_000) / 1000) },
      { exchange: 'B', last_attempt_at: Math.floor((now - 46 * 60_000) / 1000) },
    ]);
    const v = evaluateSeedFreshness(rows, now, 45);
    expect(v.find(x => x.venue === 'A')!.stale).toBe(false);
    expect(v.find(x => x.venue === 'B')!.stale).toBe(true);
  });
});
