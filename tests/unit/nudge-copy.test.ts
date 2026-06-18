/**
 * ACTIVATION-NUDGE-W1 — unit tests for the approved CTA copy builders.
 * Pure functions: stats injected, no network. Asserts the architect-approved
 * verbatim copy, the surface-specific upgrade_from attribution, the
 * trust→conversion track-record link, and the copy-rule guards (no "unlimited",
 * PFE-only, CTA-ended).
 */
import { describe, expect, it } from 'vitest';
import {
  buildSoftNudge,
  buildAhaHint,
  buildLimitMessage,
  nudgeSignupUrl,
  SIGNUP_BASE,
  TRACK_RECORD_URL,
} from '../../src/lib/nudge-copy.js';

const STATS = { pfeWr: '91.6', callCount: '246,331' };

describe('nudgeSignupUrl', () => {
  it('builds the bare attribution URL per surface', () => {
    expect(nudgeSignupUrl('soft')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=soft');
    expect(nudgeSignupUrl('aha')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=aha');
    expect(nudgeSignupUrl('limit')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=limit');
    expect(SIGNUP_BASE).toBe('https://api.algovault.com/signup');
    expect(TRACK_RECORD_URL).toBe('algovault.com/track-record');
  });
});

describe('buildSoftNudge (80% soft nudge)', () => {
  const msg = buildSoftNudge({ used: 80, total: 100, ...STATS });

  it('renders the approved copy verbatim with live values', () => {
    expect(msg).toBe(
      "You've used 80 of your 100 free calls this month. " +
      'Verify the proof first: 91.6% PFE win rate across 246,331+ on-chain calls at algovault.com/track-record. ' +
      'Upgrade to keep scanning → Starter, 3,000 calls/mo (30× the free tier), $9.99: ' +
      'https://api.algovault.com/signup?plan=starter&upgrade_from=soft',
    );
  });

  it('injects the live per-request usage (factual, not hardcoded)', () => {
    expect(buildSoftNudge({ used: 93, total: 100, ...STATS })).toContain("You've used 93 of your 100 free calls");
  });

  it('is CTA-ended (closes on the signup action URL) + carries upgrade_from=soft', () => {
    expect(msg.endsWith('upgrade_from=soft')).toBe(true);
  });
});

describe('buildAhaHint (celebrate-the-aha)', () => {
  const msg = buildAhaHint(STATS);

  it('renders the approved aha copy verbatim with live values', () => {
    expect(msg).toBe(
      "That's a live BUY/SELL call — one of 246,331+ on AlgoVault's on-chain-verified track record (91.6% PFE win rate). " +
      'See every call before you commit: algovault.com/track-record. ' +
      'Keep scanning all month → Starter, 3,000 calls/mo, $9.99: ' +
      'https://api.algovault.com/signup?plan=starter&upgrade_from=aha',
    );
  });

  it('carries upgrade_from=aha (distinct surface attribution)', () => {
    expect(msg).toContain('upgrade_from=aha');
    expect(msg).not.toContain('upgrade_from=soft');
  });
});

describe('buildLimitMessage (100% limit)', () => {
  const msg = buildLimitMessage({ total: 100, ...STATS });

  it('renders the approved limit copy verbatim with live values', () => {
    expect(msg).toBe(
      "You've hit your 100 free calls this month. " +
      'Check the proof: 91.6% PFE win rate across 246,331+ on-chain-verified calls at algovault.com/track-record. ' +
      'Upgrade now to keep scanning → Starter, 3,000 calls/mo, $9.99: ' +
      'https://api.algovault.com/signup?plan=starter&upgrade_from=limit',
    );
  });
});

describe('copy-rule guards (apply to all three nudges)', () => {
  const all = [
    buildSoftNudge({ used: 80, total: 100, ...STATS }),
    buildAhaHint(STATS),
    buildLimitMessage({ total: 100, ...STATS }),
  ];

  it('never says "unlimited" (Starter = 3,000, "30× the free tier")', () => {
    for (const m of all) expect(m.toLowerCase()).not.toContain('unlimited');
  });

  it('is PFE-only — never leaks outcome_return_pct / outcome_price / "profit"', () => {
    for (const m of all) {
      expect(m).not.toContain('outcome_return_pct');
      expect(m).not.toContain('outcome_price');
      expect(m.toLowerCase()).not.toContain('profit');
    }
  });

  it('every nudge carries the track-record trust link + a signup CTA', () => {
    for (const m of all) {
      expect(m).toContain('algovault.com/track-record');
      expect(m).toContain('signup?plan=starter&upgrade_from=');
      expect(m).toContain('$9.99');
    }
  });
});
