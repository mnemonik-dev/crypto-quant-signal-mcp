/**
 * venue-public-formatter.test.ts — OPS-AUDIT-REMEDIATION-MED-W1 R1 (SV-01).
 *
 * Encodes the SV-01 finding: the two public venue surfaces
 * (`/api/performance-shadow` + `mcp://algovault/venues`) MUST NOT expose the
 * internal promotion threshold `min_buy_sell_sample` or the `last_eval_*`
 * evaluation internals. The allow-list formatters strip them BY CONSTRUCTION.
 *
 * Assertions:
 *   1. Every VENUE_FORBIDDEN_KEYS entry is ABSENT from both formatter outputs.
 *   2. The legitimately-public fields are PRESENT (no over-stripping / data loss).
 */
import { describe, it, expect } from 'vitest';
import {
  VENUE_FORBIDDEN_KEYS,
  formatShadowVenuePublic,
  formatVenueForResource,
} from '../../src/lib/venue-public-formatter.js';
import type { VenueRecord, PerformanceStats } from '../../src/types.js';

const NOW_SEC = Math.floor(Date.parse('2026-06-07T00:00:00Z') / 1000);

// A venue row carrying EVERY internal field the audit flagged as leaked.
const VENUE: VenueRecord = {
  exchange_id: 'ASTER',
  status: 'shadow',
  asset_count: 410,
  min_buy_sell_sample: 4100, // FORBIDDEN — internal promotion threshold
  integrated_at: '2026-05-16T00:00:00.000Z',
  promoted_at: null,
  retired_at: null,
  extension_count: 1,
  last_eval_at: '2026-06-01T00:00:00.000Z', // FORBIDDEN
  last_eval_pfe_wr: 0.869, // FORBIDDEN
  last_eval_buy_sell_count: 3200, // FORBIDDEN
  seeding_started_at: '2026-05-17T00:00:00.000Z',
  notes: 'pilot adapter',
};

const EX: PerformanceStats['byExchange'][string] = {
  exchange: 'ASTER',
  count: 3200,
  evaluated: 3000,
  pfeWinRate: 0.869,
  byTimeframe: { '1h': { count: 100, evaluated: 90, pfeWinRate: 0.9 } },
  byTier: { '1': { count: 50, evaluated: 45, pfeWinRate: 0.88 } },
  byCallType: { BUY: { count: 60, evaluated: 55, pfeWinRate: 0.91 } },
  byAsset: { BTC: { count: 30, tier: 1, pfeWinRate: 0.92 } },
};

describe('venue-public-formatter — allow-list by construction (SV-01)', () => {
  describe('formatShadowVenuePublic (/api/performance-shadow)', () => {
    const out = formatShadowVenuePublic(VENUE, EX, NOW_SEC);
    const keys = Object.keys(out);

    it('strips every forbidden internal key', () => {
      for (const forbidden of VENUE_FORBIDDEN_KEYS) {
        expect(keys).not.toContain(forbidden);
        expect(out).not.toHaveProperty(forbidden);
      }
    });

    it('keeps every legitimately-public field (no data loss)', () => {
      for (const field of [
        'exchange_id', 'status', 'asset_count', 'integrated_at',
        'days_since_integration', 'extension_count',
        'current_buy_sell_count', 'current_pfe_wr',
        'byTimeframe', 'byTier', 'byCallType',
      ]) {
        expect(keys).toContain(field);
      }
      expect(out.exchange_id).toBe('ASTER');
      expect(out.current_buy_sell_count).toBe(3200);
      expect(out.current_pfe_wr).toBe(0.869);
      expect(out.days_since_integration).toBeGreaterThan(0);
      expect(out.byTimeframe).toEqual(EX.byTimeframe);
    });

    it('defaults aggregate fields when the venue has no signals yet', () => {
      const empty = formatShadowVenuePublic(VENUE, null, NOW_SEC);
      expect(empty.current_buy_sell_count).toBe(0);
      expect(empty.current_pfe_wr).toBeNull();
      expect(empty.byTimeframe).toEqual({});
      expect(empty.byTier).toEqual({});
      expect(empty.byCallType).toEqual({});
      // still no forbidden keys on the empty-aggregate path
      for (const forbidden of VENUE_FORBIDDEN_KEYS) {
        expect(empty).not.toHaveProperty(forbidden);
      }
    });

    it('serialized JSON contains no forbidden key (round-trip)', () => {
      const json = JSON.stringify(formatShadowVenuePublic(VENUE, EX, NOW_SEC));
      for (const forbidden of VENUE_FORBIDDEN_KEYS) {
        expect(json).not.toContain(forbidden);
      }
    });
  });

  describe('formatVenueForResource (mcp://algovault/venues)', () => {
    const out = formatVenueForResource(VENUE);
    const keys = Object.keys(out);

    it('strips every forbidden internal key', () => {
      for (const forbidden of VENUE_FORBIDDEN_KEYS) {
        expect(keys).not.toContain(forbidden);
        expect(out).not.toHaveProperty(forbidden);
      }
    });

    it('keeps the lifecycle + provenance fields (no data loss)', () => {
      for (const field of [
        'exchange_id', 'status', 'asset_count', 'integrated_at',
        'promoted_at', 'retired_at', 'extension_count', 'notes',
      ]) {
        expect(keys).toContain(field);
      }
      expect(out.exchange_id).toBe('ASTER');
      expect(out.status).toBe('shadow');
      expect(out.notes).toBe('pilot adapter');
    });

    it('serialized JSON contains no forbidden key (round-trip)', () => {
      const json = JSON.stringify(formatVenueForResource(VENUE));
      for (const forbidden of VENUE_FORBIDDEN_KEYS) {
        expect(json).not.toContain(forbidden);
      }
    });
  });

  it('VENUE_FORBIDDEN_KEYS pins the audited internal-key set', () => {
    expect([...VENUE_FORBIDDEN_KEYS]).toEqual([
      'min_buy_sell_sample',
      'last_eval_at',
      'last_eval_pfe_wr',
      'last_eval_buy_sell_count',
      'outcome_return_pct',
    ]);
  });
});
