/**
 * OPS-POSTGRES-MEM-RIGHTSIZE-W1 — monitor PFE check off the cached public API.
 *
 * The monitor's `checkPfeWinRate` called `getPerformanceStatsAsync()`, which on
 * a cold `docker exec` process (fresh every 2-min cron) ran the full ~6 s /
 * 152k-row scan with no cache. It now reads `/api/performance-public.overall.
 * pfeWinRate` (server-side cached) instead. This unit-tests the pure verdict
 * logic over an already-fetched payload — the same <85% threshold, and never
 * alerting when the rate is unknown (null / missing / malformed).
 */
import { describe, it, expect } from 'vitest';
import { evaluatePfeWinRate, internalPerfPublicUrl } from '../../src/scripts/monitor-pfe.js';

describe('evaluatePfeWinRate', () => {
  it('returns no error for a healthy win rate', () => {
    const r = evaluatePfeWinRate({ overall: { pfeWinRate: 0.9168 } });
    expect(r.error).toBeNull();
    expect(r.rate).toBeCloseTo(0.9168);
  });

  it('flags a win rate below 85% with the same message shape', () => {
    const r = evaluatePfeWinRate({ overall: { pfeWinRate: 0.83 } });
    expect(r.error).toBe('PFE win rate dropped to 83.0% (< 85%)');
    expect(r.rate).toBe(0.83);
  });

  it('does not alert exactly at the 85% boundary', () => {
    expect(evaluatePfeWinRate({ overall: { pfeWinRate: 0.85 } }).error).toBeNull();
  });

  it('does not alert when the rate is null (no matured data yet)', () => {
    const r = evaluatePfeWinRate({ overall: { pfeWinRate: null } });
    expect(r.error).toBeNull();
    expect(r.rate).toBeNull();
  });

  it('does not alert on a malformed / empty payload (rate unknown, not < 85%)', () => {
    expect(evaluatePfeWinRate({}).error).toBeNull();
    expect(evaluatePfeWinRate(null).error).toBeNull();
    expect(evaluatePfeWinRate({ overall: {} }).rate).toBeNull();
    expect(evaluatePfeWinRate({ overall: { pfeWinRate: 'oops' } }).rate).toBeNull();
  });
});

describe('internalPerfPublicUrl', () => {
  it('targets the in-container server on 127.0.0.1 with the PORT env (avoids the public Cloudflare hairpin that intermittently returns HTTP 0)', () => {
    expect(internalPerfPublicUrl({ PORT: '3000' })).toBe('http://127.0.0.1:3000/api/performance-public');
    expect(internalPerfPublicUrl({ PORT: '8080' })).toBe('http://127.0.0.1:8080/api/performance-public');
  });

  it('defaults to port 3000 when PORT is unset or non-numeric', () => {
    expect(internalPerfPublicUrl({})).toBe('http://127.0.0.1:3000/api/performance-public');
    expect(internalPerfPublicUrl({ PORT: 'abc' })).toBe('http://127.0.0.1:3000/api/performance-public');
  });
});
