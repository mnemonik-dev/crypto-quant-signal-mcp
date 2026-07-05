import { describe, expect, it } from 'vitest';
import { checkpointStartMs, episodesConflictClause } from '../../src/scripts/carry-freshness-helpers.js';

const H = 3600_000;
const NOW = Date.UTC(2026, 6, 5); // 2026-07-05T00:00:00Z

describe('checkpointStartMs', () => {
  it('resumes 2 intervals before the stored max (8h venue)', () => {
    const max = Date.UTC(2026, 6, 4, 16);
    expect(checkpointStartMs(max, 8, Date.UTC(2020, 0, 1), NOW, 30)).toBe(max - 16 * H);
  });

  it('resumes 2 intervals before the stored max (1h venue — HL)', () => {
    const max = Date.UTC(2026, 6, 4, 23);
    expect(checkpointStartMs(max, 1, Date.UTC(2023, 4, 1), NOW, 30)).toBe(max - 2 * H);
  });

  it('never goes earlier than the venue earliest', () => {
    const earliest = Date.UTC(2020, 0, 1);
    expect(checkpointStartMs(earliest + H, 8, earliest, NOW, 30)).toBe(earliest);
  });

  it('new symbol (no checkpoint) forward-accumulates from the bounded lookback, not deep history', () => {
    const earliest = Date.UTC(2020, 0, 1);
    expect(checkpointStartMs(null, 8, earliest, NOW, 30)).toBe(NOW - 30 * 24 * H);
  });

  it('new symbol on a seed venue (earliest=null) uses the lookback', () => {
    expect(checkpointStartMs(null, 8, null, NOW, 30)).toBe(NOW - 30 * 24 * H);
  });

  it('lookback is clamped to earliest when the venue is younger than the lookback', () => {
    const earliest = NOW - 5 * 24 * H;
    expect(checkpointStartMs(null, 8, earliest, NOW, 30)).toBe(earliest);
  });

  it('NaN checkpoint is treated as absent (default-deny on unparseable state)', () => {
    expect(checkpointStartMs(Number.NaN, 8, null, NOW, 30)).toBe(NOW - 30 * 24 * H);
  });
});

describe('episodesConflictClause', () => {
  it('default (backfill) stays byte-identical DO NOTHING', () => {
    expect(episodesConflictClause(false)).toBe('ON CONFLICT (venue,symbol,entry_ts,entry_floor_apr) DO NOTHING');
  });

  it('reclose mode upserts ONLY censored rows', () => {
    const c = episodesConflictClause(true);
    expect(c).toContain('DO UPDATE SET');
    expect(c).toContain("WHERE funding_episodes.exit_reason='data_end'");
  });

  it('reclose mode updates every exit-side column', () => {
    const c = episodesConflictClause(true);
    for (const col of ['exit_ts', 'held_intervals', 'gross_carry', 'rt_cost', 'net_carry', 'gross_apr', 'net_apr', 'exit_reason', 'net_positive', 'built_at']) {
      expect(c).toMatch(new RegExp(`${col}=`));
    }
  });

  it('reclose mode NEVER touches entry-side identity columns', () => {
    const c = episodesConflictClause(true);
    for (const col of ['entry_ts', 'entry_sign', 'entry_floor_apr', 'cluster_week', 'source', 'interval_hours']) {
      expect(c).not.toMatch(new RegExp(`(^|[\\s,])${col}=`));
    }
  });
});
