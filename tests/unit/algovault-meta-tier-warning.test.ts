/**
 * Unit test for src/lib/tier-warning.ts (ACTIVATION-PAYWALL-W1 / R2).
 *
 * Asserts the structured tier_warning semantics:
 *   - below soft threshold (0.75)     → no field emitted
 *   - 0.75 ≤ ratio < 0.90              → level: 'soft'
 *   - 0.90 ≤ ratio < 1.00              → level: 'hard'
 *   - ratio ≥ 1.00                     → no field (TIER_LIMIT_REACHED path)
 *   - paid tier                        → no field
 *   - bot-internal                     → no field
 *   - meta shape is immutable          → returns NEW object
 *   - allow-list of keys preserved     → no unknown fields injected
 */
import { describe, expect, it } from 'vitest';
import { withTierWarning, computeTierWarning, SOFT_THRESHOLD, HARD_THRESHOLD, DEFAULT_UPGRADE_URL } from '../../src/lib/tier-warning.js';
import type { AlgoVaultMeta } from '../../src/types.js';

const BASE_META: AlgoVaultMeta = {
  version: '1.16.0',
  tool: 'get_trade_call',
  compatible_with: ['claude-opus-4-7', 'claude-sonnet-4-6'],
  session_id: 'sess_test_001',
  exchange: 'BINANCE',
  venue_status: 'promoted',
};

describe('withTierWarning', () => {
  it('emits NO field below soft threshold (0.74 = 74/100)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 74,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeUndefined();
    // Allow-list preserved
    expect(Object.keys(out).sort()).toEqual(Object.keys(BASE_META).sort());
  });

  it('emits soft warning at exactly the soft threshold (75/100)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 75,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeDefined();
    expect(out.tier_warning!.level).toBe('soft');
    expect(out.tier_warning!.current_usage).toBe(75);
    expect(out.tier_warning!.monthly_limit).toBe(100);
    expect(out.tier_warning!.tier).toBe('free');
    expect(out.tier_warning!.suggested_upgrade_url).toContain('utm_source=mcp_tool');
  });

  it('emits soft warning at 75-89% range', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 85,
      monthlyLimit: 100,
    });
    expect(out.tier_warning!.level).toBe('soft');
  });

  it('emits hard warning at exactly the hard threshold (90/100)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 90,
      monthlyLimit: 100,
    });
    expect(out.tier_warning!.level).toBe('hard');
  });

  it('emits hard warning at 90-99% range', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 99,
      monthlyLimit: 100,
    });
    expect(out.tier_warning!.level).toBe('hard');
  });

  it('emits NO field at 100% (TIER_LIMIT_REACHED path takes over)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 100,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field at >100% overage (still TIER_LIMIT_REACHED)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 150,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field for starter tier', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'starter',
      currentUsage: 2500,
      monthlyLimit: 3000,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field for pro tier', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'pro',
      currentUsage: 12000,
      monthlyLimit: 15000,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field for enterprise tier', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'enterprise',
      currentUsage: 80000,
      monthlyLimit: 100000,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field for x402 tier (Infinity quota)', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'x402',
      currentUsage: 1000,
      monthlyLimit: 100000,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('emits NO field when is_bot_internal=true', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 80,
      monthlyLimit: 100,
      isBotInternal: true,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('returns a NEW object (immutability) — original meta unchanged', () => {
    const original = { ...BASE_META };
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 90,
      monthlyLimit: 100,
    });
    expect(out).not.toBe(BASE_META);
    expect(BASE_META).toEqual(original); // input unchanged
  });

  it('honors custom upgradeUrl override', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 80,
      monthlyLimit: 100,
      upgradeUrl: 'https://example.com/upgrade?test=1',
    });
    expect(out.tier_warning!.suggested_upgrade_url).toBe('https://example.com/upgrade?test=1');
  });

  it('handles defensive cases: zero monthlyLimit → no field', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: 10,
      monthlyLimit: 0,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('handles defensive cases: NaN currentUsage → no field', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: NaN,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeUndefined();
  });

  it('handles defensive cases: negative currentUsage → no field', () => {
    const out = withTierWarning(BASE_META, {
      tier: 'free',
      currentUsage: -5,
      monthlyLimit: 100,
    });
    expect(out.tier_warning).toBeUndefined();
  });
});

describe('computeTierWarning (exposed for unit testing)', () => {
  it('SOFT_THRESHOLD constant is 0.75', () => {
    expect(SOFT_THRESHOLD).toBe(0.75);
  });

  it('HARD_THRESHOLD constant is 0.90', () => {
    expect(HARD_THRESHOLD).toBe(0.90);
  });

  it('DEFAULT_UPGRADE_URL has UTM tags for attribution', () => {
    expect(DEFAULT_UPGRADE_URL).toContain('utm_source=mcp_tool');
    expect(DEFAULT_UPGRADE_URL).toContain('utm_campaign=tier_warning');
    expect(DEFAULT_UPGRADE_URL).toContain('plan=starter');
  });

  it('returns undefined for paid tier even at 100%+', () => {
    expect(computeTierWarning({ tier: 'starter', currentUsage: 3500, monthlyLimit: 3000 })).toBeUndefined();
  });
});
