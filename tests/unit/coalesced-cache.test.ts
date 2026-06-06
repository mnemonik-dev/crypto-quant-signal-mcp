/**
 * tests/unit/coalesced-cache.test.ts — OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 (C1)
 *
 * The AC1 spine: the stampede class is structurally dead — single-flight collapses
 * N concurrent cold-fills to one load, a throttled resource is negative-cached, a
 * short-lived proc never loads, and the meta-config is byte-equivalent (single-flight
 * + throw-on-error, no negative memo).
 */
import { describe, it, expect, vi } from 'vitest';
import { coalescedCache } from '../../src/lib/coalesced-cache.js';
import { UpstreamRateLimitError } from '../../src/lib/errors.js';

describe('coalescedCache — single-flight (request coalescing)', () => {
  it('collapses 42 concurrent cold-fills to EXACTLY ONE loader call', async () => {
    const load = vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return 'V'; });
    const c = coalescedCache<string>({ load, ttlMs: 60_000 });
    const results = await Promise.all(Array.from({ length: 42 }, () => c.get('k')));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results).toEqual(Array(42).fill('V'));
  });

  it('serves a fresh cached value without re-loading', async () => {
    const load = vi.fn(async () => 'V');
    const c = coalescedCache<string>({ load, ttlMs: 60_000 });
    await c.get('k');
    await c.get('k');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keys are independent (no cross-key coalescing)', async () => {
    const load = vi.fn(async (k: string) => `v:${k}`);
    const c = coalescedCache<string>({ load, ttlMs: 60_000 });
    expect(await Promise.all([c.get('a'), c.get('b')])).toEqual(['v:a', 'v:b']);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('coalescedCache — negative cache on throttle (the stampede breaker)', () => {
  it('throttled cold-fill: 42 concurrent → loader 1×; next call within the negative window does NOT reload', async () => {
    let t = 1_000_000;
    const load = vi.fn(async () => { throw new UpstreamRateLimitError('Hyperliquid', null); });
    const c = coalescedCache<string>({
      load, ttlMs: 60_000, negativeTtlMs: 30_000, staleOk: true,
      fallback: () => 'FB', now: () => t, random: () => 0.5,
    });
    const results = await Promise.all(Array.from({ length: 42 }, () => c.get('k')));
    expect(load).toHaveBeenCalledTimes(1);                 // single-flight even on throw
    expect(results).toEqual(Array(42).fill('FB'));         // fallback served
    t += 1_000;                                            // still inside the negative window
    expect(await c.get('k')).toBe('FB');
    expect(load).toHaveBeenCalledTimes(1);                 // negative memo suppressed the reload
  });

  it('re-attempts the loader after the negative window expires', async () => {
    let t = 1_000_000;
    let mode: 'throw' | 'ok' = 'throw';
    const load = vi.fn(async () => { if (mode === 'throw') throw new UpstreamRateLimitError('HL', null); return 'OK'; });
    const c = coalescedCache<string>({ load, ttlMs: 60_000, negativeTtlMs: 30_000, fallback: () => 'FB', now: () => t, random: () => 0.5 });
    expect(await c.get('k')).toBe('FB');
    expect(load).toHaveBeenCalledTimes(1);
    t += 40_000;                                           // past the ~30s negative window
    mode = 'ok';
    expect(await c.get('k')).toBe('OK');
    expect(load).toHaveBeenCalledTimes(2);                 // re-attempted
  });

  it('serves STALE on failure when staleOk (RFC 5861), value preserved', async () => {
    let t = 1_000_000;
    let mode: 'ok' | 'throw' = 'ok';
    const load = vi.fn(async () => { if (mode === 'throw') throw new Error('boom'); return 'FRESH'; });
    const c = coalescedCache<string>({ load, ttlMs: 10_000, negativeTtlMs: 30_000, staleOk: true, now: () => t });
    expect(await c.get('k')).toBe('FRESH');
    t += 20_000;                                           // cache expired AND loader now fails
    mode = 'throw';
    expect(await c.get('k')).toBe('FRESH');                // stale served, not thrown
  });
});

describe('coalescedCache — process-boundary gate (closes class B)', () => {
  it('short-lived proc → loader 0×, serves fallback', async () => {
    const load = vi.fn(async () => 'V');
    const c = coalescedCache<string>({ load, ttlMs: 60_000, fallback: () => 'FB', processGate: () => true });
    expect(await c.get('k')).toBe('FB');
    expect(load).toHaveBeenCalledTimes(0);
  });

  it('short-lived proc serves an existing cached value over fallback', async () => {
    let short = false;
    const load = vi.fn(async () => 'WARM');
    const c = coalescedCache<string>({ load, ttlMs: 60_000, fallback: () => 'FB', processGate: () => short });
    await c.get('k');           // server warms it
    short = true;               // now a short-lived proc reads
    expect(await c.get('k')).toBe('WARM');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('coalescedCache — fail-open + meta byte-equivalence config', () => {
  it('rethrows when there is no stale + no fallback (never worse than today)', async () => {
    const load = vi.fn(async () => { throw new Error('boom'); });
    const c = coalescedCache<string>({ load, ttlMs: 60_000 });
    await expect(c.get('k')).rejects.toThrow('boom');
  });

  it('meta config (staleOk=false, negativeTtlMs=0) = single-flight + throw-on-error, NO negative memo', async () => {
    let t = 1_000_000;
    const load = vi.fn(async () => { throw new Error('429'); });
    const c = coalescedCache<string>({ load, ttlMs: 60_000, staleOk: false, negativeTtlMs: 0, now: () => t });
    await expect(c.get('k')).rejects.toThrow('429');      // throws (no stale/fallback)
    t += 100;
    await expect(c.get('k')).rejects.toThrow('429');      // re-attempts immediately (no negative memo)
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('_clear + _getState seams', async () => {
    const load = vi.fn(async () => 'V');
    const c = coalescedCache<string>({ load, ttlMs: 60_000 });
    await c.get('k');
    expect(c._getState('k')?.value).toBe('V');
    c._clear('k');
    expect(c._getState('k')).toBeNull();
  });
});
