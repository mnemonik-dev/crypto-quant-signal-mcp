/**
 * ACTIVATION-NUDGE-W1 — unit tests for the track-record snapshot source.
 * Mocks global fetch; asserts the live-value parse path, the cold/fail-open
 * fallback, and the NESTED `.overall.pfeWinRate` read (the path `email.ts` gets
 * wrong — a regression guard so the nudges never quote "0.9%" or the fallback
 * when the live WR is available).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTrackRecord,
  refreshTrackRecord,
  _setTrackRecordForTest,
  _resetTrackRecordForTest,
} from '../../src/lib/track-record-snapshot.js';

function mockFetchOnce(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }));
}

beforeEach(() => {
  _resetTrackRecordForTest();
});
afterEach(() => {
  _resetTrackRecordForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getTrackRecord — fallback + injection', () => {
  it('returns the [STATIC] fallback before any warm fetch', () => {
    expect(getTrackRecord()).toEqual({ pfeWr: '91.6', callCount: '246,331' });
  });

  it('returns an injected snapshot once set', () => {
    _setTrackRecordForTest({ pfeWr: '92.0', callCount: '300,000' });
    expect(getTrackRecord()).toEqual({ pfeWr: '92.0', callCount: '300,000' });
  });
});

describe('refreshTrackRecord — live parse', () => {
  it('reads the NESTED .overall.pfeWinRate (×100, 1dp) + totalCalls — NOT the top-level path', async () => {
    // Top-level pfeWinRate is null (the real endpoint shape); the WR lives under
    // .overall. If the reader used the top-level path it would fall back to 91.6
    // by luck — so we use a DISTINCT overall value (0.8742 → "87.4") to prove the
    // nested read.
    mockFetchOnce({ pfeWinRate: null, overall: { pfeWinRate: 0.8742, totalCalls: 246331 }, totalCalls: 246331 });
    const tr = await refreshTrackRecord();
    expect(tr).toEqual({ pfeWr: '87.4', callCount: '246,331' });
    expect(getTrackRecord()).toEqual({ pfeWr: '87.4', callCount: '246,331' });
  });

  it('matches the live 2026-06-18 snapshot (0.9156… → 91.6, 246331 → "246,331")', async () => {
    mockFetchOnce({ overall: { pfeWinRate: 0.9156671160401911, totalCalls: 246331 } });
    expect(await refreshTrackRecord()).toEqual({ pfeWr: '91.6', callCount: '246,331' });
  });

  it('falls back to top-level totalCalls when overall.totalCalls is absent', async () => {
    mockFetchOnce({ overall: { pfeWinRate: 0.9 }, totalCalls: 246331 });
    expect(await refreshTrackRecord()).toEqual({ pfeWr: '90.0', callCount: '246,331' });
  });
});

describe('refreshTrackRecord — fail-open (never blanks the nudge)', () => {
  it('keeps the last-good value when fetch rejects', async () => {
    _setTrackRecordForTest({ pfeWr: '90.0', callCount: '200,000' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await refreshTrackRecord();
    expect(getTrackRecord()).toEqual({ pfeWr: '90.0', callCount: '200,000' });
  });

  it('keeps the last-good value on a non-OK response', async () => {
    _setTrackRecordForTest({ pfeWr: '90.0', callCount: '200,000' });
    mockFetchOnce({}, false);
    await refreshTrackRecord();
    expect(getTrackRecord()).toEqual({ pfeWr: '90.0', callCount: '200,000' });
  });

  it('keeps the last-good value when the payload WR is null / shape is partial', async () => {
    _setTrackRecordForTest({ pfeWr: '90.0', callCount: '200,000' });
    mockFetchOnce({ overall: { pfeWinRate: null, totalCalls: 246331 } });
    await refreshTrackRecord();
    expect(getTrackRecord()).toEqual({ pfeWr: '90.0', callCount: '200,000' });
  });

  it('rejects a non-positive / non-finite call count', async () => {
    _setTrackRecordForTest({ pfeWr: '90.0', callCount: '200,000' });
    mockFetchOnce({ overall: { pfeWinRate: 0.9, totalCalls: 0 } });
    await refreshTrackRecord();
    expect(getTrackRecord()).toEqual({ pfeWr: '90.0', callCount: '200,000' });
  });
});
