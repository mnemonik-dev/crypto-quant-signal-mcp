/**
 * FUNNEL-FIX-AUTH-UNIFY-W1 — byte-parity guard for /welcome.
 *
 * The unified sign-in is additive + reversible behind UNIFIED_SIGNIN_ENABLED.
 * When the flag is OFF (unifiedSignin unset/false) the /welcome page MUST render
 * byte-identically to the pre-wave layout. These snapshots are captured from the
 * CURRENT getWelcomePageHtml BEFORE the unified branch is added, then re-asserted
 * after — any drift on the OFF path fails the build (protects the LIVE /welcome).
 * (byte-equivalence-fixture-for-inline-to-data-driven-refactor.)
 */
import { describe, expect, it } from 'vitest';
import { getWelcomePageHtml } from '../src/lib/welcome-page.js';

const OAUTH_BOTH = { google: true, github: true };
const OAUTH_GH = { google: false, github: true };
const OAUTH_GG = { google: true, github: false };

describe('welcome-page byte-parity when UNIFIED_SIGNIN off (legacy layout intact)', () => {
  it('organic · newSignup off · no oauth', () => {
    expect(getWelcomePageHtml(null, null, null, {})).toMatchSnapshot();
  });
  it('organic · newSignup on · both oauth', () => {
    expect(getWelcomePageHtml(null, null, null, { newSignupEnabled: true, oauthProviders: OAUTH_BOTH })).toMatchSnapshot();
  });
  it('organic · newSignup on · github only', () => {
    expect(getWelcomePageHtml(null, null, null, { newSignupEnabled: true, oauthProviders: OAUTH_GH })).toMatchSnapshot();
  });
  it('organic · newSignup on · google only', () => {
    expect(getWelcomePageHtml(null, null, null, { newSignupEnabled: true, oauthProviders: OAUTH_GG })).toMatchSnapshot();
  });
  it('organic · newSignup on · with utm', () => {
    expect(getWelcomePageHtml(null, null, null, { newSignupEnabled: true, oauthProviders: OAUTH_BOTH, utmSource: 'lobehub', utmCampaign: 'launch' })).toMatchSnapshot();
  });
  it('post-checkout · key + tier + email', () => {
    expect(getWelcomePageHtml('av_live_deadbeefcafe0123456789ab', 'starter', 'buyer@example.com', { newSignupEnabled: true, oauthProviders: OAUTH_BOTH })).toMatchSnapshot();
  });
  it('pending · no key · tier + email', () => {
    expect(getWelcomePageHtml(null, 'starter', 'buyer@example.com', { newSignupEnabled: true, oauthProviders: OAUTH_BOTH })).toMatchSnapshot();
  });
});
