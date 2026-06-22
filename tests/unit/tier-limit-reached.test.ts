/**
 * Unit test for TierLimitReachedError (ACTIVATION-PAYWALL-W1 / R3).
 *
 * Asserts the structured-error envelope shape that fires when a free-tier
 * caller exceeds the in-process monthly quota counter (license.ts:checkQuota
 * returns allowed:false at >=100 calls/month).
 */
import { describe, expect, it } from 'vitest';
import { TierLimitReachedError } from '../../src/lib/errors.js';

describe('TierLimitReachedError', () => {
  it('exposes the canonical code TIER_LIMIT_REACHED', () => {
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter&utm_source=mcp_tool&utm_campaign=tier_limit_reached',
      retryAfterDays: 7,
    });
    expect(err.code).toBe('TIER_LIMIT_REACHED');
  });

  it('persists the structured fields (+ appends upgrade_from=limit when absent, A2)', () => {
    const err = new TierLimitReachedError({
      currentUsage: 105,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://example.com/upgrade',
      retryAfterDays: 12,
    });
    expect(err.current_usage).toBe(105);
    expect(err.monthly_limit).toBe(100);
    expect(err.tier).toBe('free');
    // ACTIVATION-NUDGE-W1: funnel-attribution param added to the structured field.
    expect(err.suggested_upgrade_url).toBe('https://example.com/upgrade?upgrade_from=limit');
    expect(err.retry_after_days).toBe(12);
  });

  it('builds the referral-prominent + upgrade-retained .message (REFERRAL-INPRODUCT-NUDGE-W1)', () => {
    // KEYLESS (no referralCode) → the get-your-link free-signup path leads, upgrade
    // retained beneath. No "unlimited". The bare upgrade_from=limit URL is embedded.
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter',
      retryAfterDays: 5,
    });
    expect(err.message).toContain("You've hit your 100 free calls this month");
    expect(err.message.toLowerCase()).toContain('refer a friend');
    expect(err.message).toContain('500 bonus calls');
    expect(err.message).toContain('create a free account'); // keyless get-your-link path
    expect(err.message).toContain('Or Upgrade → Starter, 3,000 calls/mo, $9.99'); // upgrade retained
    expect(err.message).toContain('signup?plan=starter&upgrade_from=limit');
    expect(err.message).not.toContain('unlimited');
  });

  it('KEYED message renders the user\'s own give-get link (state-adaptive)', () => {
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter',
      retryAfterDays: 5,
      referralCode: 'ABCD1234',
    });
    expect(err.message).toContain('Your link: algovault.com/join?ref=ABCD1234');
    expect(err.message).not.toContain('create a free account'); // keyed → not the keyless path
  });

  it('carries the allow-listed structured referral_hint (from: limit; keyed→link, keyless→path)', () => {
    const keyed = new TierLimitReachedError({
      currentUsage: 100, monthlyLimit: 100, tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter',
      retryAfterDays: 5, referralCode: 'ABCD1234',
    });
    expect(keyed.referral_hint.from).toBe('limit');
    expect(keyed.referral_hint.link_or_path).toBe('https://algovault.com/join?ref=ABCD1234');
    expect(keyed.referral_hint.bonus_calls).toBe(500);
    expect(Object.keys(keyed.referral_hint).sort()).toEqual(['bonus_calls', 'cta', 'from', 'link_or_path']);

    const keyless = new TierLimitReachedError({
      currentUsage: 100, monthlyLimit: 100, tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter',
      retryAfterDays: 5, // no referralCode
    });
    expect(keyless.referral_hint.link_or_path).toBe('https://api.algovault.com/signup?upgrade_from=limit_referral');
    // no outcome_* leak in the structured hint
    expect(JSON.stringify(keyed.referral_hint)).not.toContain('outcome_');
  });

  it('is instance-of Error AND TierLimitReachedError (prototype chain preserved across CJS transpile)', () => {
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup',
      retryAfterDays: 7,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TierLimitReachedError);
  });

  it('UTM tags are present in the canonical suggested_upgrade_url', () => {
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter&utm_source=mcp_tool&utm_campaign=tier_limit_reached',
      retryAfterDays: 7,
    });
    expect(err.suggested_upgrade_url).toContain('utm_source=mcp_tool');
    expect(err.suggested_upgrade_url).toContain('utm_campaign=tier_limit_reached');
  });
});
