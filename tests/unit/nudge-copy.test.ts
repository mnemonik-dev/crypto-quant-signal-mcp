/**
 * ACTIVATION-NUDGE-W1 + REFERRAL-INPRODUCT-NUDGE-W1 — unit tests for the approved
 * CTA copy builders. Pure functions: stats injected, no network. Asserts the
 * architect-approved verbatim copy, surface-specific attribution, the
 * trust→conversion track-record link, and the copy-rule guards (no "unlimited",
 * PFE-only, CTA-ended). REFERRAL-INPRODUCT-NUDGE-W1 adds the referral arm: the
 * referral-prominent + upgrade-retained limit copy (state-adaptive), the 4 aha
 * referral lines, and the allow-listed structured ReferralHint. Numbers are
 * SoT-derived (bonusCallsLabel / shareLink) — never hardcoded.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSoftNudge,
  buildAhaHint,
  buildLimitMessage,
  buildAhaReferral,
  buildReferralHint,
  referralSignupUrl,
  nudgeSignupUrl,
  AHA_HIGH_CONVICTION_CONFIDENCE,
  SIGNUP_BASE,
  TRACK_RECORD_URL,
} from '../../src/lib/nudge-copy.js';
import { bonusCallsLabel, shareLink, REFERRAL_TERMS } from '../../src/lib/referral-constants.js';

const STATS = { pfeWr: '91.6', callCount: '246,331' };
const CODE = 'ABCD1234';
const BONUS = bonusCallsLabel();                      // SoT — '500'
const KEYED_LINK = shareLink(CODE, 'algovault.com');  // scheme-less display link

describe('nudgeSignupUrl', () => {
  it('builds the bare attribution URL per surface', () => {
    expect(nudgeSignupUrl('soft')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=soft');
    expect(nudgeSignupUrl('aha')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=aha');
    expect(nudgeSignupUrl('limit')).toBe('https://api.algovault.com/signup?plan=starter&upgrade_from=limit');
    expect(SIGNUP_BASE).toBe('https://api.algovault.com/signup');
    expect(TRACK_RECORD_URL).toBe('algovault.com/track-record');
  });
});

describe('referralSignupUrl (keyless get-your-link path)', () => {
  it('omits plan=starter (free path) + tags the referral CTA for funnel attribution', () => {
    expect(referralSignupUrl('limit')).toBe('https://api.algovault.com/signup?upgrade_from=limit_referral');
    expect(referralSignupUrl('aha_call')).toBe('https://api.algovault.com/signup?upgrade_from=aha_call_referral');
    expect(referralSignupUrl('limit')).not.toContain('plan=starter');
  });
});

describe('buildSoftNudge (80% soft nudge) — unchanged (upgrade-only)', () => {
  const msg = buildSoftNudge({ used: 80, total: 100, ...STATS });
  it('renders the approved copy verbatim with live values', () => {
    expect(msg).toBe(
      "You've used 80 of your 100 free calls this month. " +
      'Verify the proof first: 91.6% PFE win rate across 246,331+ on-chain calls at algovault.com/track-record. ' +
      'Upgrade to keep scanning → Starter, 3,000 calls/mo (30× the free tier), $9.99: ' +
      'https://api.algovault.com/signup?plan=starter&upgrade_from=soft',
    );
  });
  it('is CTA-ended (closes on the signup action URL) + carries upgrade_from=soft', () => {
    expect(msg.endsWith('upgrade_from=soft')).toBe(true);
  });
});

describe('buildAhaHint (celebrate-the-aha) — unchanged (keyless aha fallback)', () => {
  const msg = buildAhaHint(STATS);
  it('renders the approved aha copy verbatim with live values', () => {
    expect(msg).toBe(
      "That's a live BUY/SELL call — one of 246,331+ on AlgoVault's on-chain-verified track record (91.6% PFE win rate). " +
      'See every call before you commit: algovault.com/track-record. ' +
      'Keep scanning all month → Starter, 3,000 calls/mo, $9.99: ' +
      'https://api.algovault.com/signup?plan=starter&upgrade_from=aha',
    );
  });
});

describe('buildLimitMessage (100% limit) — referral-prominent + upgrade-retained', () => {
  const upgradeLine = 'Or Upgrade → Starter, 3,000 calls/mo, $9.99: https://api.algovault.com/signup?plan=starter&upgrade_from=limit';

  it('KEYED: leads with the user\'s own give-get link, upgrade retained beneath', () => {
    expect(buildLimitMessage({ total: 100, referralCode: CODE })).toBe(
      "You've hit your 100 free calls this month.\n" +
      `Keep going free: refer a friend — you both get ${BONUS} bonus calls.\n` +
      `Your link: ${KEYED_LINK}.\n` +
      upgradeLine,
    );
  });

  it('KEYLESS: leads with the get-your-link free-signup path (never a fake link)', () => {
    expect(buildLimitMessage({ total: 100, referralCode: null })).toBe(
      "You've hit your 100 free calls this month.\n" +
      `Keep going free: create a free account to get your referral link — refer a friend and you both get ${BONUS} bonus calls → ${referralSignupUrl('limit')}.\n` +
      upgradeLine,
    );
  });

  it('always retains the upgrade path (acquisition > revenue, never removed)', () => {
    for (const code of [CODE, null]) {
      const m = buildLimitMessage({ total: 100, referralCode: code });
      expect(m).toContain('Or Upgrade → Starter, 3,000 calls/mo, $9.99');
      expect(m).toContain('upgrade_from=limit');
      expect(m.toLowerCase()).toContain('refer a friend'); // referral leads
    }
  });
});

describe('buildAhaReferral (4 keyed aha lines — each keeps the proof anchor, Q3)', () => {
  it('(a) high-conviction call — renders the verdict + proof + link', () => {
    expect(buildAhaReferral({ from: 'aha_call', code: CODE, stats: STATS, verdict: 'BUY' })).toBe(
      'That\'s a high-conviction BUY call — 91.6% PFE win rate across 246,331+ on-chain-verified calls. ' +
      `Friends get ${BONUS} bonus calls with your link → ${KEYED_LINK}`,
    );
  });
  it('(b) multi-hit scan — renders k live calls + proof + link', () => {
    expect(buildAhaReferral({ from: 'aha_scan', code: CODE, stats: STATS, k: 4 })).toBe(
      'Your scan surfaced 4 live calls — all on-chain-verified, 91.6% PFE win rate. ' +
      `Pass it on: friends get ${BONUS} bonus calls → ${KEYED_LINK}`,
    );
  });
  it('(c) usage milestone — renders the milestone count + link', () => {
    expect(buildAhaReferral({ from: 'aha_milestone', code: CODE, stats: STATS, callCountUser: 25 })).toBe(
      'You\'ve pulled 25 calls with AlgoVault. Know a trader who\'d use it? ' +
      `They get ${BONUS} bonus calls with your link → ${KEYED_LINK}`,
    );
  });
  it('(d) verification peak — shipped-but-unwired copy renders (deferred trigger)', () => {
    expect(buildAhaReferral({ from: 'aha_verify', code: CODE, stats: STATS })).toBe(
      'Every call is on-chain-verified — 91.6% PFE WR across 246,331+. ' +
      `Share the proof: friends get ${BONUS} bonus calls → ${KEYED_LINK}`,
    );
  });
  it('every aha line carries the give-get link + bonus; a/b/d keep the PFE proof anchor', () => {
    for (const from of ['aha_call', 'aha_scan', 'aha_milestone', 'aha_verify'] as const) {
      const m = buildAhaReferral({ from, code: CODE, stats: STATS, verdict: 'SELL', k: 3, callCountUser: 50 });
      expect(m).toContain(KEYED_LINK);
      expect(m).toContain(BONUS);
      // a/b/d anchor on the on-chain PFE proof; the milestone (c) anchors on the
      // user's OWN engagement ("You've pulled N calls") — its credibility hook.
      if (from === 'aha_milestone') expect(m).toContain('pulled 50 calls with AlgoVault');
      else expect(m).toContain('91.6%');
    }
  });
});

describe('buildReferralHint (allow-listed structured field)', () => {
  it('KEYED → own give-get URL (https, agent-relayable); exactly 4 keys', () => {
    const h = buildReferralHint({ from: 'limit', code: CODE });
    expect(h).toEqual({
      cta: `Refer a friend — you both get ${BONUS} bonus calls`,
      link_or_path: shareLink(CODE),                // full https link
      bonus_calls: REFERRAL_TERMS.BONUS_CALLS,      // SoT number
      from: 'limit',
    });
    expect(Object.keys(h).sort()).toEqual(['bonus_calls', 'cta', 'from', 'link_or_path']);
  });
  it('KEYLESS → get-your-link free-signup path', () => {
    const h = buildReferralHint({ from: 'aha_call', code: null });
    expect(h.link_or_path).toBe(referralSignupUrl('aha_call'));
    expect(h.cta).toContain('Create a free account');
    expect(h.bonus_calls).toBe(REFERRAL_TERMS.BONUS_CALLS);
  });
  it('carries no outcome_* / profit (allow-list discipline)', () => {
    const blob = JSON.stringify(buildReferralHint({ from: 'limit', code: CODE })).toLowerCase();
    expect(blob).not.toContain('outcome_');
    expect(blob).not.toContain('profit');
  });
});

describe('AHA_HIGH_CONVICTION_CONFIDENCE (trigger-a gate)', () => {
  it('is set well above the ~52 track-record record gate (anti-random-ask)', () => {
    expect(AHA_HIGH_CONVICTION_CONFIDENCE).toBeGreaterThanOrEqual(60);
    expect(AHA_HIGH_CONVICTION_CONFIDENCE).toBeLessThanOrEqual(100);
  });
});

describe('copy-rule guards', () => {
  const upgradeNudges = [
    buildSoftNudge({ used: 80, total: 100, ...STATS }),
    buildAhaHint(STATS),
  ];
  const referralCopy = [
    buildLimitMessage({ total: 100, referralCode: CODE }),
    buildLimitMessage({ total: 100, referralCode: null }),
    buildAhaReferral({ from: 'aha_call', code: CODE, stats: STATS, verdict: 'BUY' }),
    buildAhaReferral({ from: 'aha_scan', code: CODE, stats: STATS, k: 3 }),
    buildAhaReferral({ from: 'aha_milestone', code: CODE, stats: STATS, callCountUser: 25 }),
    buildAhaReferral({ from: 'aha_verify', code: CODE, stats: STATS }),
  ];

  it('never says "unlimited" anywhere', () => {
    for (const m of [...upgradeNudges, ...referralCopy]) expect(m.toLowerCase()).not.toContain('unlimited');
  });

  it('is PFE-only — never leaks outcome_return_pct / outcome_price / "profit"', () => {
    for (const m of [...upgradeNudges, ...referralCopy]) {
      expect(m).not.toContain('outcome_return_pct');
      expect(m).not.toContain('outcome_price');
      expect(m.toLowerCase()).not.toContain('profit');
    }
  });

  it('upgrade nudges keep the track-record trust link + signup CTA', () => {
    for (const m of upgradeNudges) {
      expect(m).toContain('algovault.com/track-record');
      expect(m).toContain('signup?plan=starter&upgrade_from=');
      expect(m).toContain('$9.99');
    }
  });

  it('referral copy carries the bonus number from SoT + a give-get/get-your-link target', () => {
    for (const m of referralCopy) {
      expect(m).toContain(BONUS);
      expect(m).toMatch(/algovault\.com\/join\?ref=|signup\?upgrade_from=/);
    }
  });
});
