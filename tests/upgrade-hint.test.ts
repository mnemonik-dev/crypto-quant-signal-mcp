import { describe, it, expect, beforeEach } from 'vitest';
import { getUpgradeHint, getQuotaExhaustedMessage, trackCall, resetLicenseCache } from '../src/lib/license.js';
import type { LicenseInfo } from '../src/types.js';

describe('getUpgradeHint', () => {
  const free: LicenseInfo = { tier: 'free', key: null };
  const starter: LicenseInfo = { tier: 'starter', key: 'av_starter_test' };
  const pro: LicenseInfo = { tier: 'pro', key: 'pro_test' };
  const enterprise: LicenseInfo = { tier: 'enterprise', key: 'ent_test' };
  const x402: LicenseInfo = { tier: 'x402', key: null };

  it('returns undefined for non-free tiers', () => {
    for (const license of [starter, pro, enterprise, x402]) {
      expect(getUpgradeHint(license, { used: 90, total: 100 })).toBeUndefined();
      expect(getUpgradeHint(license, { cappedResults: 5, totalResults: 20 })).toBeUndefined();
    }
  });

  it('returns undefined for free tier under 80% usage', () => {
    expect(getUpgradeHint(free, { used: 50, total: 100 })).toBeUndefined();
    expect(getUpgradeHint(free, { used: 79, total: 100 })).toBeUndefined();
  });

  it('returns the approved soft nudge when free tier is at 80%+ usage', () => {
    // ACTIVATION-NUDGE-W1: approved CTA copy + LIVE track-record values (the
    // deterministic fallback in tests, since no warmer runs) + upgrade_from=soft.
    const hint = getUpgradeHint(free, { used: 80, total: 100 })!;
    expect(hint).toContain("You've used 80 of your 100 free calls"); // factual used/total
    expect(hint).toContain('PFE win rate');
    expect(hint).toContain('algovault.com/track-record');           // trust→conversion lever
    expect(hint).toContain('Starter, 3,000 calls/mo (30× the free tier)');
    expect(hint).toContain('$9.99');
    expect(hint).toContain('signup?plan=starter&upgrade_from=soft'); // primary funnel attribution
    expect(hint).not.toContain('unlimited');                         // copy-rule: no "unlimited"
  });

  it('renders the live per-request usage (factual, not the illustrative 80)', () => {
    const hint = getUpgradeHint(free, { used: 95, total: 100 })!;
    expect(hint).toContain("You've used 95 of your 100 free calls");
    expect(hint).not.toContain('80 of your 100');
  });

  it('returns undefined at 100% usage (handled by quota block)', () => {
    expect(getUpgradeHint(free, { used: 100, total: 100 })).toBeUndefined();
  });

  it('returns capped results hint when funding arb is limited', () => {
    const hint = getUpgradeHint(free, { cappedResults: 5, totalResults: 12 });
    expect(hint).toContain('top 5 of 12');
    expect(hint).toContain('Starter');
    expect(hint).toContain('$9.99/mo');
  });

  it('returns undefined when results are not capped', () => {
    expect(getUpgradeHint(free, { cappedResults: 5, totalResults: 3 })).toBeUndefined();
    expect(getUpgradeHint(free, { cappedResults: 5, totalResults: 5 })).toBeUndefined();
  });

  it('capped results hint takes priority over quota hint', () => {
    const hint = getUpgradeHint(free, {
      cappedResults: 5,
      totalResults: 20,
      used: 85,
      total: 100,
    });
    expect(hint).toContain('top 5 of 20');
    expect(hint).not.toContain('85/100');
  });

  it('returns undefined with no context', () => {
    expect(getUpgradeHint(free)).toBeUndefined();
    expect(getUpgradeHint(free, {})).toBeUndefined();
  });
});

describe('getQuotaExhaustedMessage', () => {
  it('renders the referral-prominent + upgrade-retained limit copy (REFERRAL-INPRODUCT-NUDGE-W1)', () => {
    // Same shared builder the TIER_LIMIT_REACHED envelope renders. No referralCode
    // arg → keyless (get-your-link path leads); upgrade retained beneath. No "unlimited".
    const msg = getQuotaExhaustedMessage(100, 100);
    expect(msg).toContain("You've hit your 100 free calls this month");
    expect(msg.toLowerCase()).toContain('refer a friend');
    expect(msg).toContain('create a free account'); // keyless get-your-link path
    expect(msg).toContain('Or Upgrade → Starter, 3,000 calls/mo, $9.99');
    expect(msg).toContain('signup?plan=starter&upgrade_from=limit');
    expect(msg).not.toContain('unlimited');
  });

  it('KEYED → renders the user\'s own give-get link', () => {
    const msg = getQuotaExhaustedMessage(100, 100, 'ABCD1234');
    expect(msg).toContain('Your link: algovault.com/join?ref=ABCD1234');
    expect(msg).not.toContain('create a free account');
  });
});
