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

  it('persists the structured fields', () => {
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
    expect(err.suggested_upgrade_url).toBe('https://example.com/upgrade');
    expect(err.retry_after_days).toBe(12);
  });

  it('builds a human-readable .message', () => {
    const err = new TierLimitReachedError({
      currentUsage: 100,
      monthlyLimit: 100,
      tier: 'free',
      suggestedUpgradeUrl: 'https://api.algovault.com/signup?plan=starter',
      retryAfterDays: 5,
    });
    expect(err.message).toMatch(/Free-tier monthly limit reached/i);
    expect(err.message).toContain('100/100');
    expect(err.message).toContain('https://api.algovault.com/signup');
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
