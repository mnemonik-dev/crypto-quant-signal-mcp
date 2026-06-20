/**
 * P0 VERDICT-WITH-RECEIPTS-W1 — in-process cached track-record accessor.
 *
 * The receipts proof numbers must be LIVE but readable on the synchronous hot
 * response path, so a background warmer caches `{pfe_win_rate, n, window, as_of}`
 * sourced from the SAME in-process performance data behind
 * `performance://signal-performance` (`getPerformanceStatsAsync`) — NOT a fresh
 * HTTP self-call to `/api/performance-public`. `getReceiptTrackRecord()` is a
 * pure sync read (fail-open: null before first warm / on source failure).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockStats } = vi.hoisted(() => ({ mockStats: vi.fn() }));
// Mock the in-process performance source. If the warmer instead issued an HTTP
// self-call, it would bypass this mock entirely (and the call-count assertion
// below would fail) — so this doubles as the "in-process, not HTTP" guard.
vi.mock('../../src/lib/performance-db.js', () => ({
  getPerformanceStatsAsync: (...args: unknown[]) => mockStats(...args),
}));

import {
  getReceiptTrackRecord,
  refreshReceiptTrackRecord,
  _resetReceiptTrackRecordForTest,
} from '../../src/lib/receipts-track-record.js';

beforeEach(() => {
  _resetReceiptTrackRecordForTest();
  mockStats.mockReset();
});

describe('receipts-track-record — in-process cached accessor', () => {
  it('returns null before the first warm (fail-open → receipts omit track_record)', () => {
    expect(getReceiptTrackRecord()).toBeNull();
  });

  it('maps in-process performance stats into the receipt track-record shape', async () => {
    mockStats.mockResolvedValue({
      overall: { pfeWinRate: 0.9155, totalEvaluated: 231222, totalCalls: 232425 },
      period: { from: '2026-04-10', to: '2026-06-15' },
    });
    const tr = await refreshReceiptTrackRecord();
    expect(tr).not.toBeNull();
    expect(tr!.pfe_win_rate).toBeCloseTo(0.9155, 4);
    expect(tr!.n).toBe(231222); // EVALUATED = the honest WR denominator
    expect(tr!.window).toBe('2026-04-10..2026-06-15');
    expect(typeof tr!.as_of).toBe('string');
    expect(getReceiptTrackRecord()).toEqual(tr); // cached for the sync hot path
    expect(mockStats).toHaveBeenCalledTimes(1); // sourced in-process, not via HTTP
  });

  it('fail-open: keeps the last-good value when the source throws', async () => {
    mockStats.mockResolvedValue({ overall: { pfeWinRate: 0.9, totalEvaluated: 100 }, period: { from: 'a', to: 'b' } });
    const good = await refreshReceiptTrackRecord();
    mockStats.mockRejectedValue(new Error('db down'));
    const after = await refreshReceiptTrackRecord();
    expect(after).toEqual(good); // never blanked to null on a transient failure
    expect(getReceiptTrackRecord()).toEqual(good);
  });

  it('fail-open: ignores a null-WR / zero-sample payload (never adopts a 0-call rate)', async () => {
    mockStats.mockResolvedValue({ overall: { pfeWinRate: null, totalEvaluated: 0 }, period: { from: '', to: '' } });
    expect(await refreshReceiptTrackRecord()).toBeNull();
    expect(getReceiptTrackRecord()).toBeNull();
  });
});
