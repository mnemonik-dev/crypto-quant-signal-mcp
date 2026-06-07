// OPS-COALESCED-CACHE-LOAD-TIMEOUT-W1 — loadTimeoutMs (a slow NON-throwing load must
// never block a hot read). Fake timers control both the race setTimeout and Date.now().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coalescedCache } from '../../src/lib/coalesced-cache.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// a load whose Nth call resolves when deferreds[N-1] is called
function deferredLoad() {
  const deferreds: Array<(v: string) => void> = [];
  const load = vi.fn(() => new Promise<string>((res) => { deferreds.push(res); }));
  return { load, deferreds };
}

describe('coalescedCache loadTimeoutMs', () => {
  it('default-off (no loadTimeoutMs) → unbounded await, byte-identical to today', async () => {
    const { load, deferreds } = deferredLoad();
    const c = coalescedCache<string>({ load, ttlMs: 60_000, fallback: () => 'FB' });
    const p = c.get('k');
    let resolved = false; void p.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(resolved).toBe(false);            // no timeout → did NOT serve fallback; still awaiting load
    deferreds[0]('REAL');
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe('REAL');
  });

  it('slow non-throwing load + no stale → serves fallback at the timeout; load self-warms the store; single-flight; NO negative memo', async () => {
    const { load, deferreds } = deferredLoad();
    const c = coalescedCache<string>({ load, ttlMs: 60_000, fallback: () => 'FB', staleOk: true, loadTimeoutMs: 2500 });
    const p = c.get('k');
    await vi.advanceTimersByTimeAsync(2500);
    expect(await p).toBe('FB');               // served fallback on timeout
    expect(load).toHaveBeenCalledTimes(1);    // single-flight (load fired once, still running)
    expect(c._getState('k')).toBeNull();      // timeout created NO store entry → NO negative memo (load not failed)
    deferreds[0]('REAL');                      // the in-flight load now resolves
    await vi.advanceTimersByTimeAsync(0);
    expect(c._getState('k')?.value).toBe('REAL');      // background-populated (self-warm)
    expect(c._getState('k')?.negativeUntil).toBe(0);   // success path, no memo
    expect(await c.get('k')).toBe('REAL');             // next caller gets the real value
    expect(load).toHaveBeenCalledTimes(1);             // no re-load (bg flight populated it)
  });

  it('stale present → serves STALE (not fallback) on timeout', async () => {
    const { load, deferreds } = deferredLoad();
    const c = coalescedCache<string>({ load, ttlMs: 1_000, fallback: () => 'FB', staleOk: true, loadTimeoutMs: 2500 });
    const p1 = c.get('k'); deferreds[0]('STALE'); await vi.advanceTimersByTimeAsync(0);
    expect(await p1).toBe('STALE');
    await vi.advanceTimersByTimeAsync(1_500);  // age past ttl=1000 → stale
    const p2 = c.get('k');                      // cold/expired → flight (deferreds[1], unresolved)
    await vi.advanceTimersByTimeAsync(2500);    // race times out
    expect(await p2).toBe('STALE');             // serves the stale value, not 'FB'
  });

  it('load THROW path unchanged → catch serves fallback (no timeout involved)', async () => {
    const load = vi.fn(() => Promise.reject(new Error('boom')));
    const c = coalescedCache<string>({ load, ttlMs: 60_000, fallback: () => 'FB', negativeTtlMs: 30_000, loadTimeoutMs: 2500, random: () => 0.5 });
    expect(await c.get('k')).toBe('FB');        // throw → catch → fallback (wins the race before 2500)
    expect(c._getState('k')?.ts).toBe(0);       // fallback entry ts=0 (never "fresh")
    expect(c._getState('k')!.negativeUntil).toBeGreaterThan(0);  // throw DID set a negative memo (unchanged)
  });

  it('no fallback + no stale + loadTimeoutMs → falls through to awaiting load (can serve nothing else)', async () => {
    const { load, deferreds } = deferredLoad();
    const c = coalescedCache<string>({ load, ttlMs: 60_000, loadTimeoutMs: 2500 });  // no fallback
    const p = c.get('k');
    let resolved = false; void p.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(resolved).toBe(false);               // no fallback/stale → can't serve on timeout → awaits load
    deferreds[0]('REAL');
    await vi.advanceTimersByTimeAsync(0);
    expect(await p).toBe('REAL');
  });
});

describe('top20Cache integration (R2 — getTop20ByOI bounded at 2500ms)', () => {
  it('slow HL OI load → getTop20ByOI returns FALLBACK_TOP20 fast (not an 84s block)', async () => {
    vi.doMock('../../src/lib/oi-ranking.js', () => ({
      getTopAssetsByOI: vi.fn(() => new Promise(() => { /* never resolves — simulates HL batch_wait */ })),
    }));
    const { getTop20ByOI, _getFallbackTop20 } = await import('../../src/lib/asset-tiers.js');
    const gp = getTop20ByOI();
    await vi.advanceTimersByTimeAsync(2500);
    expect(await gp).toEqual(_getFallbackTop20());
    vi.doUnmock('../../src/lib/oi-ranking.js');
  });
});
