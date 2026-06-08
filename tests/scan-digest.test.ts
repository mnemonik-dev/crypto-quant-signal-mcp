/**
 * FEATURE-PARITY-CHANNELS-W1 CH2 — scan-digest pure helpers (cadence math).
 *
 * cadenceForTimeframe is the timeframe-aware default cadence: the nearest cadence
 * ≥ the scan timeframe, hard-floored at 1h (never sub-hourly). It is MIRRORED by
 * the bot's Python cadence_for_timeframe (CH4) — these tests pin the shared map.
 */
import { describe, it, expect } from 'vitest';
import {
  cadenceForTimeframe,
  cadenceBucketEpoch,
  isValidCadence,
  cadenceFasterThanTimeframe,
  scanDigestEventId,
  VALID_CADENCES,
} from '../src/lib/scan-digest.js';

describe('cadenceForTimeframe — nearest cadence ≥ tf, floor 1h', () => {
  it.each([
    ['1m', '1h'], ['3m', '1h'], ['5m', '1h'], ['15m', '1h'], ['30m', '1h'], ['1h', '1h'],
    ['2h', '4h'], ['4h', '4h'],
    ['8h', '1d'], ['12h', '1d'], ['1d', '1d'],
  ])('%s → %s', (tf, expected) => {
    expect(cadenceForTimeframe(tf)).toBe(expected);
  });

  it('unknown/unsupported tf → 1d (conservative default-deny: slowest = least quota)', () => {
    expect(cadenceForTimeframe('7m')).toBe('1d');
    expect(cadenceForTimeframe('')).toBe('1d');
  });
});

describe('isValidCadence', () => {
  it('accepts the 3 cadences, rejects anything else', () => {
    for (const c of VALID_CADENCES) expect(isValidCadence(c)).toBe(true);
    for (const c of ['30m', '2h', '1w', '', 1, null, undefined]) expect(isValidCadence(c)).toBe(false);
  });
});

describe('cadenceBucketEpoch — floor now to the cadence period', () => {
  it('1h bucket aligns to the top of the hour', () => {
    expect(cadenceBucketEpoch('1h', 1_700_003_725)).toBe(Math.floor(1_700_003_725 / 3600) * 3600);
  });
  it('two times in the same hour share a bucket; the next hour differs', () => {
    const base = 1_699_999_200; // 3600-aligned bucket start
    const a = cadenceBucketEpoch('1h', base);
    const b = cadenceBucketEpoch('1h', base + 3599);
    const c = cadenceBucketEpoch('1h', base + 3600);
    expect(a).toBe(b);
    expect(c).toBeGreaterThan(a);
  });
  it('1d bucket period is 86400', () => {
    const base = 1_699_920_000; // 86400-aligned day start
    const a = cadenceBucketEpoch('1d', base);
    const b = cadenceBucketEpoch('1d', base + 86399);
    expect(a).toBe(b);
  });
});

describe('cadenceFasterThanTimeframe — the stronger-heads-up trigger', () => {
  it('a cadence MORE frequent than the tf is faster (repeats the scan)', () => {
    expect(cadenceFasterThanTimeframe('1h', '4h')).toBe(true); // 1h digest on a 4h scan repeats ~4x
    expect(cadenceFasterThanTimeframe('1h', '2h')).toBe(true);
    expect(cadenceFasterThanTimeframe('4h', '1d')).toBe(true);
  });
  it('the timeframe-derived default is never flagged as faster', () => {
    expect(cadenceFasterThanTimeframe('1h', '15m')).toBe(false); // 1h on 15m: slower than refresh
    expect(cadenceFasterThanTimeframe('4h', '4h')).toBe(false);
    expect(cadenceFasterThanTimeframe('1d', '1d')).toBe(false);
  });
});

describe('scanDigestEventId — idempotent per (sub, cadence bucket)', () => {
  it('same sub + same bucket → identical id (replay-safe)', () => {
    const t = 1_700_000_123;
    expect(scanDigestEventId(7, '1h', t)).toBe(scanDigestEventId(7, '1h', t + 60));
  });
  it('different bucket → different id', () => {
    const t = 1_700_000_123;
    expect(scanDigestEventId(7, '1h', t)).not.toBe(scanDigestEventId(7, '1h', t + 3600));
  });
  it('format is scan_digest:<subId>:<bucketEpoch>', () => {
    expect(scanDigestEventId(42, '1h', 1_700_003_600)).toBe(`scan_digest:42:${Math.floor(1_700_003_600 / 3600) * 3600}`);
  });
});
