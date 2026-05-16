/**
 * EXCHANGE-SHADOW-PROMOTE-W1 / C2 — venue-shadow unit tests.
 *
 * Mocks venue-store.getVenue so the shadow module's defaults + error-path
 * fail-open behavior are exercised in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/venue-store.js', () => ({
  getVenue: vi.fn(),
}));

import { getVenueStatus, describeVenueForToolList } from '../../src/lib/venue-shadow.js';
import { getVenue } from '../../src/lib/venue-store.js';

const mockGetVenue = vi.mocked(getVenue);

const promotedRecord = {
  exchange_id: 'BINANCE',
  status: 'promoted' as const,
  asset_count: 571,
  min_buy_sell_sample: 5710,
  integrated_at: '2026-04-01T00:00:00Z',
  promoted_at: '2026-05-16T12:00:00Z',
  retired_at: null,
  extension_count: 0,
  last_eval_at: null,
  last_eval_pfe_wr: null,
  last_eval_buy_sell_count: null,
  notes: null,
};

const shadowRecord = {
  ...promotedRecord,
  exchange_id: 'GATEIO',
  status: 'shadow' as const,
  promoted_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getVenueStatus', () => {
  it("returns 'promoted' for a known promoted venue (BINANCE per C1 backfill)", async () => {
    mockGetVenue.mockResolvedValueOnce(promotedRecord);
    expect(await getVenueStatus('BINANCE')).toBe('promoted');
  });

  it("returns 'shadow' for a known shadow venue", async () => {
    mockGetVenue.mockResolvedValueOnce(shadowRecord);
    expect(await getVenueStatus('BINANCE')).toBe('shadow');
  });

  it("defaults to 'promoted' for unknown venue (backward-compat — no row in venues table)", async () => {
    mockGetVenue.mockResolvedValueOnce(null);
    expect(await getVenueStatus('BINANCE')).toBe('promoted');
  });

  it("fails open to 'promoted' when database errors (envelope hot-path can't break tool response)", async () => {
    mockGetVenue.mockRejectedValueOnce(new Error('postgres down'));
    expect(await getVenueStatus('BINANCE')).toBe('promoted');
  });
});

describe('describeVenueForToolList', () => {
  it("returns empty string for promoted venue (no annotation)", async () => {
    mockGetVenue.mockResolvedValueOnce(promotedRecord);
    expect(await describeVenueForToolList('BINANCE')).toBe('');
  });

  it("returns ' (experimental — shadow mode)' for shadow venue", async () => {
    mockGetVenue.mockResolvedValueOnce(shadowRecord);
    const annotation = await describeVenueForToolList('BINANCE');
    expect(annotation).toContain('experimental');
    expect(annotation).toContain('shadow mode');
    expect(annotation.startsWith(' (')).toBe(true);
  });

  it("returns empty string for unknown venue (defaults to promoted)", async () => {
    mockGetVenue.mockResolvedValueOnce(null);
    expect(await describeVenueForToolList('BINANCE')).toBe('');
  });
});
