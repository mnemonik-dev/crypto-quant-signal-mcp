import { describe, it, expect } from 'vitest';
import {
  selectFacilitator,
  resolveFacilitatorAdapterConfig,
  parseFacilitatorChoice,
  parseBazaarFlag,
  CDP_FACILITATOR_URL,
  type FacilitatorEnv,
} from '../src/lib/x402-facilitator.js';

// Fake CDP creds (lazy — createFacilitatorConfig does not validate at creation time).
const CDP_KEYS = { CDP_API_KEY_ID: 'cdp-test-id-0000', CDP_API_KEY_SECRET: 'dGVzdHNlY3JldA==' };

function resolve(env: FacilitatorEnv) {
  return selectFacilitator(resolveFacilitatorAdapterConfig(env));
}

describe('FacilitatorAdapter — two-flag firewall', () => {
  it('defaults to legacy when X402_FACILITATOR is unset (byte-identical to today)', () => {
    const r = resolve({});
    expect(r.effectiveChoice).toBe('legacy');
    expect(r.discoveryEnabled).toBe(false);
    expect(r.stubFellBack).toBe(false);
    expect(r.facilitatorConfig).toBeUndefined(); // exact SDK default — no behavior change
  });

  it('legacy passes { url } only when X402_FACILITATOR_URL is set (matches pre-wave logic)', () => {
    expect(resolve({ X402_FACILITATOR_URL: 'http://facilitator:4022' }).facilitatorConfig).toEqual({
      url: 'http://facilitator:4022',
    });
    expect(resolve({}).facilitatorConfig).toBeUndefined();
  });

  it('selects cdp when X402_FACILITATOR=cdp AND both CDP keys present', () => {
    const r = resolve({ X402_FACILITATOR: 'cdp', ...CDP_KEYS });
    expect(r.effectiveChoice).toBe('cdp');
    expect(r.stubFellBack).toBe(false);
    expect(r.facilitatorConfig?.url).toBe(CDP_FACILITATOR_URL);
    expect(typeof r.facilitatorConfig?.createAuthHeaders).toBe('function');
  });

  it('stub-falls-back to legacy when cdp requested but keys absent', () => {
    const r = resolve({ X402_FACILITATOR: 'cdp' });
    expect(r.effectiveChoice).toBe('legacy');
    expect(r.stubFellBack).toBe(true);
    expect(r.discoveryEnabled).toBe(false);
  });

  it('stub-falls-back when only one CDP key is present', () => {
    expect(resolve({ X402_FACILITATOR: 'cdp', CDP_API_KEY_ID: 'only-id' }).stubFellBack).toBe(true);
    expect(resolve({ X402_FACILITATOR: 'cdp', CDP_API_KEY_SECRET: 'only-secret' }).stubFellBack).toBe(true);
  });

  it('declares Bazaar discovery ONLY when cdp AND BAZAAR_DISCOVERABLE=true', () => {
    expect(resolve({ X402_FACILITATOR: 'cdp', BAZAAR_DISCOVERABLE: 'true', ...CDP_KEYS }).discoveryEnabled).toBe(true);
    expect(resolve({ X402_FACILITATOR: 'cdp', BAZAAR_DISCOVERABLE: 'false', ...CDP_KEYS }).discoveryEnabled).toBe(false);
    // never on legacy even if the inner flag is true
    expect(resolve({ X402_FACILITATOR: 'legacy', BAZAAR_DISCOVERABLE: 'true' }).discoveryEnabled).toBe(false);
    // cdp + flag true but keys absent → stub → discovery off
    expect(resolve({ X402_FACILITATOR: 'cdp', BAZAAR_DISCOVERABLE: 'true' }).discoveryEnabled).toBe(false);
  });

  it('parses flag values case-insensitively; unknown facilitator → legacy', () => {
    expect(parseFacilitatorChoice('CDP')).toBe('cdp');
    expect(parseFacilitatorChoice('Legacy')).toBe('legacy');
    expect(parseFacilitatorChoice(undefined)).toBe('legacy');
    expect(parseFacilitatorChoice('x402org')).toBe('legacy'); // legacy alias / unknown → legacy
    expect(parseBazaarFlag('TRUE')).toBe(true);
    expect(parseBazaarFlag('false')).toBe(false);
    expect(parseBazaarFlag(undefined)).toBe(false);
  });
});
