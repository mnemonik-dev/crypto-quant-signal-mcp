/**
 * SUBSCRIBER-ATTRIBUTION-SPINE-W1 (C1) — attribution capture unit invariants.
 *
 * Locks the channel-derivation map (channel-agnostic by construction: direct /
 * tg_bot / mcp / api snap in by client_reference_id prefix) and the fail-open
 * contract: a capture error MUST NOT throw on the /signup request path (revenue
 * path is LAW for this wave).
 */
import { describe, it, expect } from 'vitest';
import { deriveChannel, recordSignupAttribution } from '../src/lib/subscriber-attribution.js';

describe('deriveChannel', () => {
  it('maps direct: prefix to direct', () => {
    expect(deriveChannel('direct:1780796896353:0n031n')).toBe('direct');
  });
  it('maps tg: and tg_bot: prefixes to tg_bot', () => {
    expect(deriveChannel('tg:123:abc')).toBe('tg_bot');
    expect(deriveChannel('tg_bot:123:abc')).toBe('tg_bot');
  });
  it('maps mcp: prefix to mcp', () => {
    expect(deriveChannel('mcp:123:abc')).toBe('mcp');
  });
  it('maps api: prefix to api', () => {
    expect(deriveChannel('api:123:abc')).toBe('api');
  });
  it('returns unknown for an unrecognized prefix or empty id', () => {
    expect(deriveChannel('weird:123')).toBe('unknown');
    expect(deriveChannel('')).toBe('unknown');
  });
  it('falls back to a utm_source hint when the id prefix is unknown', () => {
    expect(deriveChannel('xxx:1', 'tg_bot')).toBe('tg_bot');
    expect(deriveChannel('xxx:1', 'telegram')).toBe('tg_bot');
    expect(deriveChannel('xxx:1', 'mcp_tool')).toBe('mcp');
  });
});

describe('recordSignupAttribution (fail-open)', () => {
  const baseInput = {
    clientReferenceId: 'direct:1:abc',
    utmSource: null, utmMedium: null, utmCampaign: null,
    referrer: null, landingPath: null, tierRequested: 'starter',
    ipHash: 'deadbeef16hex000', userAgent: 'UA/1.0',
  };

  it('does NOT throw when the DB writer throws (fail-open revenue path)', () => {
    const throwingWriter = {
      ensure: () => { throw new Error('schema boom'); },
      run: () => { throw new Error('insert boom'); },
    };
    expect(() => recordSignupAttribution(baseInput, throwingWriter)).not.toThrow();
  });

  it('issues one ON CONFLICT DO NOTHING INSERT with the derived channel on the happy path', () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const writer = {
      ensure: () => {},
      run: (sql: string, ...params: unknown[]) => { calls.push({ sql, params }); },
    };
    recordSignupAttribution(baseInput, writer);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/INSERT INTO signup_attribution/i);
    expect(calls[0].sql).toMatch(/ON CONFLICT \(client_reference_id\) DO NOTHING/i);
    expect(calls[0].params[0]).toBe('direct:1:abc'); // client_reference_id
    expect(calls[0].params[1]).toBe('direct');        // derived channel
  });
});
