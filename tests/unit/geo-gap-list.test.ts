/**
 * GEO-MEASUREMENT-W2 (C4) — geo-gap-list unit tests.
 *
 *   - computeGapList ranks lowest-SoV × highest-tier × competitor-on-domain first.
 *   - persistGapBriefs caps at GEO_GAP_MAX_PER_WEEK; second call same ISO-week = no-op.
 *   - isoWeek labelling; no Telegram from this module (C6 owns the veto DM).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/performance-db.js', () => ({
  dbQuery: vi.fn(async () => []),
  dbExec: vi.fn(),
  dbRun: vi.fn(),
}));

import { dbQuery, dbExec, dbRun } from '../../src/lib/performance-db.js';
import {
  computeGapList,
  persistGapBriefs,
  isoWeek,
  GAP_SOURCE_COLUMN_VALUE,
  type GapBrief,
} from '../../src/lib/geo-gap-list.js';

const dbQueryMock = vi.mocked(dbQuery);
const dbExecMock = vi.mocked(dbExec);
const dbRunMock = vi.mocked(dbRun);

beforeEach(() => {
  dbQueryMock.mockReset();
  dbExecMock.mockClear();
  dbRunMock.mockClear();
});

describe('computeGapList', () => {
  it('ranks lowest-SoV × highest-tier × competitor-on-trusted-domain first', async () => {
    dbQueryMock
      .mockResolvedValueOnce([
        { query_id: 'head-low', query_tier: 'head', model: 'sonar', sov: 0.1, samples: 3 },
        { query_id: 'branded-high', query_tier: 'branded', model: 'sonar', sov: 0.9, samples: 3 },
        { query_id: 'niche-mid', query_tier: 'niche', model: 'sonar', sov: 0.5, samples: 3 },
      ] as never)
      .mockResolvedValueOnce([
        { query_id: 'head-low', source_domain: 'github.com', competitor_name: 'vectorbt', cites: 5 },
        { query_id: 'niche-mid', source_domain: 'reddit.com', competitor_name: 'ccxt', cites: 1 },
      ] as never);

    const briefs = await computeGapList(4);
    expect(briefs[0].query_id).toBe('head-low');
    expect(briefs[0].top_competitor).toBe('vectorbt');
    expect(briefs[0].top_competitor_domain).toBe('github.com');
    expect(briefs[0].recommended_action).toContain('github.com');
    // branded-high (high SoV, low tier weight, no competitor) ranks last
    expect(briefs[briefs.length - 1].query_id).toBe('branded-high');
    expect(briefs[0].rank_score).toBeGreaterThan(briefs[briefs.length - 1].rank_score);
  });

  it('fails open to [] if the query throws', async () => {
    dbQueryMock.mockRejectedValueOnce(new Error('db down') as never);
    expect(await computeGapList()).toEqual([]);
  });
});

const SAMPLE: GapBrief[] = [
  { query_id: 'head-low', query_tier: 'head', model: 'sonar', sov: 0.1, top_competitor: 'vectorbt', top_competitor_domain: 'github.com', recommended_action: 'x', rank_score: 1.8 },
  { query_id: 'niche-mid', query_tier: 'niche', model: 'sonar', sov: 0.5, top_competitor: 'ccxt', top_competitor_domain: 'reddit.com', recommended_action: 'y', rank_score: 0.36 },
];

describe('persistGapBriefs', () => {
  it('persists top `max` briefs when the week is empty', async () => {
    dbQueryMock.mockResolvedValueOnce([{ n: 0 }] as never); // existing count
    const persisted = await persistGapBriefs(SAMPLE, 1, new Date('2026-06-02T00:00:00Z'));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].query_id).toBe('head-low'); // highest rank_score
    expect(dbRunMock).toHaveBeenCalledTimes(1);
    const sql = String(dbRunMock.mock.calls[0][0]);
    expect(sql).toContain('INTO geo_content_gaps');
    expect(sql).toContain('ON CONFLICT');
    expect(dbExecMock).toHaveBeenCalled(); // ensureGeoGapSchema
  });

  it('is a no-op when the weekly cap is already reached (dedup)', async () => {
    dbQueryMock.mockResolvedValueOnce([{ n: 1 }] as never); // already 1 this week, max 1
    const persisted = await persistGapBriefs(SAMPLE, 1, new Date('2026-06-02T00:00:00Z'));
    expect(persisted).toEqual([]);
    expect(dbRunMock).not.toHaveBeenCalled();
  });

  it('returns [] for empty input without touching the db', async () => {
    const persisted = await persistGapBriefs([], 1);
    expect(persisted).toEqual([]);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

describe('isoWeek + constants', () => {
  it('labels ISO weeks: same week matches, adjacent weeks differ', () => {
    expect(isoWeek(new Date('2026-06-02T00:00:00Z'))).toMatch(/^2026-W\d{2}$/);
    // Mon 2026-06-01 .. Sun 2026-06-07 = same ISO week
    expect(isoWeek(new Date('2026-06-01T00:00:00Z'))).toBe(isoWeek(new Date('2026-06-07T23:00:00Z')));
    // next Monday = different week
    expect(isoWeek(new Date('2026-06-08T00:00:00Z'))).not.toBe(isoWeek(new Date('2026-06-01T00:00:00Z')));
  });

  it('exposes the geo-gap Source column value for C6', () => {
    expect(GAP_SOURCE_COLUMN_VALUE).toBe('geo-gap');
  });
});
