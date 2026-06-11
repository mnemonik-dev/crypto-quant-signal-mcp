/**
 * tests/unit/reset-venue-window.test.ts — OPS-SHADOW-WINDOW-RESET-AND-WR-DISPLAY-W1.
 * Operator window-reset script: shadow-only flip + read-back verify, promoted/
 * retired status guard, --check dry-run writes nothing, idempotent re-run,
 * strict --since parsing. Mocks venue-store (in-memory map so the post-write
 * read-back path is exercised for real).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/venue-store.js', () => ({
  getVenue: vi.fn(),
  resetSeedingStarted: vi.fn(),
}));

import { resetVenueWindow, parseSince } from '../../src/scripts/reset-venue-window.js';
import { getVenue, resetSeedingStarted } from '../../src/lib/venue-store.js';
import type { VenueRecord } from '../../src/types.js';

const mockGet = vi.mocked(getVenue);
const mockReset = vi.mocked(resetSeedingStarted);

function v(id: string, status: VenueRecord['status'], overrides: Partial<VenueRecord> = {}): VenueRecord {
  return {
    exchange_id: id, status, asset_count: 100, min_buy_sell_sample: 1000,
    integrated_at: '2026-05-27T00:00:00Z', promoted_at: null, retired_at: null,
    extension_count: 0, last_eval_at: null, last_eval_pfe_wr: null,
    last_eval_buy_sell_count: null, seeding_started_at: '2026-05-27T08:00:00Z', notes: null,
  ...overrides,
  };
}

/** In-memory venues table so the script's read-back verify sees real state. */
let venues: Map<string, VenueRecord>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  venues = new Map();
  mockGet.mockImplementation(async (id: string) => venues.get(id) ?? null);
  // Faithful mirror of the store's UPDATE: shadow-only WHERE guard.
  mockReset.mockImplementation(async (id: string, when: Date) => {
    const cur = venues.get(id);
    if (cur && cur.status === 'shadow') venues.set(id, { ...cur, seeding_started_at: when.toISOString() });
  });
});

const TS = new Date('2026-06-11T02:00:00.000Z');

describe('resetVenueWindow (R2)', () => {
  it('sets seeding_started_at to the given ts on a shadow venue (read-back verified, rc 0)', async () => {
    venues.set('BITMART', v('BITMART', 'shadow'));
    const rc = await resetVenueWindow(['BITMART'], TS);
    expect(rc).toBe(0);
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledWith('BITMART', TS);
    expect(venues.get('BITMART')!.seeding_started_at).toBe(TS.toISOString());
  });

  it('status guard: a promoted venue passed in is NOT modified (rc 1), shadow co-targets still flip', async () => {
    venues.set('BINANCE', v('BINANCE', 'promoted', { seeding_started_at: null }));
    venues.set('BITMART', v('BITMART', 'shadow'));
    const rc = await resetVenueWindow(['BINANCE', 'BITMART'], TS);
    expect(rc).toBe(1); // requested set not fully honored → operator sees non-zero
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledWith('BITMART', TS);
    expect(venues.get('BINANCE')!.seeding_started_at).toBeNull(); // untouched
    expect(venues.get('BITMART')!.seeding_started_at).toBe(TS.toISOString());
  });

  it('--check lists the planned change and writes NOTHING (rc 0)', async () => {
    venues.set('BITMART', v('BITMART', 'shadow'));
    const rc = await resetVenueWindow(['BITMART'], TS, { check: true });
    expect(rc).toBe(0);
    expect(mockReset).not.toHaveBeenCalled();
    expect(venues.get('BITMART')!.seeding_started_at).toBe('2026-05-27T08:00:00Z'); // unchanged
  });

  it('re-running with the same ts is idempotent (rc 0 both runs, same final state)', async () => {
    venues.set('WEEX', v('WEEX', 'shadow'));
    expect(await resetVenueWindow(['WEEX'], TS)).toBe(0);
    expect(await resetVenueWindow(['WEEX'], TS)).toBe(0);
    expect(venues.get('WEEX')!.seeding_started_at).toBe(TS.toISOString());
  });

  it('unknown venue → rc 1, no write', async () => {
    const rc = await resetVenueWindow(['NOPE'], TS);
    expect(rc).toBe(1);
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('read-back mismatch (UPDATE matched 0 rows) → rc 1', async () => {
    venues.set('KUCOIN', v('KUCOIN', 'shadow'));
    mockReset.mockImplementation(async () => { /* write silently lost */ });
    const rc = await resetVenueWindow(['KUCOIN'], TS);
    expect(rc).toBe(1);
  });
});

describe('parseSince — strict --since parsing (default-deny)', () => {
  it('accepts ISO8601', () => {
    expect(parseSince('2026-06-11T02:00:00Z')?.toISOString()).toBe('2026-06-11T02:00:00.000Z');
  });
  it('accepts 10-digit epoch seconds and 13-digit epoch millis', () => {
    expect(parseSince('1781143200')?.toISOString()).toBe('2026-06-11T02:00:00.000Z');
    expect(parseSince('1781143200000')?.toISOString()).toBe('2026-06-11T02:00:00.000Z');
  });
  it('rejects garbage, hex-ish strings, and undefined (no parseFloat coercion)', () => {
    expect(parseSince('0x6849f3a0')).toBeNull();
    expect(parseSince('12abc')).toBeNull();
    expect(parseSince('')).toBeNull();
    expect(parseSince(undefined)).toBeNull();
  });
  it('rejects a far-future or pre-2020 ts (operator-error guard)', () => {
    expect(parseSince('2031-01-01T00:00:00Z')).toBeNull();
    expect(parseSince('2019-12-31T23:59:59Z')).toBeNull();
  });
});
