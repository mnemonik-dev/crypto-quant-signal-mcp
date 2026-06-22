/**
 * Activation upgrade-nudge copy builders (ACTIVATION-NUDGE-W1, 2026-06-18).
 *
 * The SINGLE source of the three free→paid nudge messages so every surface
 * (MCP `_algovault.upgrade_hint`, the 100% `TIER_LIMIT_REACHED` envelope, and
 * `scan_trade_calls`' quota-exhausted message) renders byte-identical copy.
 *
 * Copy is the architect-APPROVED CTA copy (Mr.1 2026-06-18) applied VERBATIM;
 * the only substitutions are live values — `{used}`/`{total}` (per-request quota)
 * and `{pfeWr}`/`{callCount}` (the track-record SoT, injected by the caller from
 * `getTrackRecord()`, never hardcoded here). Each closes on an action-verb CTA +
 * outcome + link per the `feedback_cta_not_feature_description` LAW. PFE-only
 * (no `outcome_return_pct`); no "unlimited" (Starter = 3,000, "30× the free
 * tier"); ≤20 words/sentence.
 *
 * `upgrade_from` is the PRIMARY funnel-attribution param — the `/signup` handler
 * (index.ts) records `upgrade_cta_clicked` keyed on ANY `upgrade_from` value, so
 * `soft`/`aha`/`limit` each attribute their surface. These three human-facing
 * strings carry the BARE `?plan=starter&upgrade_from=<x>` URL verbatim (A2); the
 * utm_* secondary chain stays only on the structured machine fields.
 */

// REFERRAL-INPRODUCT-NUDGE-W1 (2026-06-22): the referral arm pulls the bonus
// number + the keyed give-get link from the referral SoT (pure module — no cycle).
import { shareLink, bonusCallsLabel, REFERRAL_TERMS } from './referral-constants.js';

/** Canonical signup base. `{signup_url}` in the approved copy resolves to this. */
export const SIGNUP_BASE = 'https://api.algovault.com/signup';

/** Public track-record page (verified live 200, 2026-06-18). Visible in copy. */
export const TRACK_RECORD_URL = 'algovault.com/track-record';

export type UpgradeFrom = 'soft' | 'aha' | 'limit';

/** Bare signup URL with the surface attribution param (no utm on human copy). */
export function nudgeSignupUrl(from: UpgradeFrom): string {
  return `${SIGNUP_BASE}?plan=starter&upgrade_from=${from}`;
}

/** Live track-record values injected into the copy (from `getTrackRecord()`). */
export interface NudgeStats {
  /** PFE win rate %, 1 dp display string, e.g. "91.6". */
  pfeWr: string;
  /** On-chain call count, locale-grouped, e.g. "246,331". */
  callCount: string;
}

/**
 * 80% soft nudge — fires on a free `_algovault.upgrade_hint` at ≥ SOFT_THRESHOLD.
 * `used`/`total` are the live per-request quota counters (factual, not the
 * illustrative "80 of 100").
 */
export function buildSoftNudge(ctx: { used: number; total: number } & NudgeStats): string {
  return (
    `You've used ${ctx.used} of your ${ctx.total} free calls this month. ` +
    `Verify the proof first: ${ctx.pfeWr}% PFE win rate across ${ctx.callCount}+ on-chain calls at ${TRACK_RECORD_URL}. ` +
    `Upgrade to keep scanning → Starter, 3,000 calls/mo (30× the free tier), $9.99: ${nudgeSignupUrl('soft')}`
  );
}

/**
 * Celebrate-the-aha — one-time on a free session's FIRST non-HOLD (BUY/SELL)
 * verdict. The value-moment message (precedence: aha > soft).
 */
export function buildAhaHint(stats: NudgeStats): string {
  return (
    `That's a live BUY/SELL call — one of ${stats.callCount}+ on AlgoVault's on-chain-verified track record (${stats.pfeWr}% PFE win rate). ` +
    `See every call before you commit: ${TRACK_RECORD_URL}. ` +
    `Keep scanning all month → Starter, 3,000 calls/mo, $9.99: ${nudgeSignupUrl('aha')}`
  );
}

/**
 * 100% limit message — referral-PROMINENT + upgrade-RETAINED (REFERRAL-INPRODUCT-
 * NUDGE-W1, Mr.1-approved 2026-06-22). The free path (refer a friend) LEADS; the
 * paid path (upgrade) is retained beneath it — never removed (North Star:
 * acquisition > revenue until 1K paying). Rendered by BOTH the
 * `TierLimitReachedError` envelope and `getQuotaExhaustedMessage` (single source).
 *
 * State-adaptive: a KEYED user (has a referral code) sees their OWN give-get link;
 * a KEYLESS user sees the free-account get-your-link path (sign up free → key +
 * link) — NEVER a fake link. Line breaks are intentional (Mr.1 readability).
 * `{BONUS_CALLS}` from the REFERRAL_TERMS SoT; `3,000/mo·$9.99` = the live upgrade
 * copy. No proof line here (Mr.1's approved limit copy — proof rides the aha lines).
 */
export function buildLimitMessage(ctx: { total: number; referralCode: string | null }): string {
  const upgradeLine = `Or Upgrade → Starter, 3,000 calls/mo, $9.99: ${nudgeSignupUrl('limit')}`;
  if (ctx.referralCode) {
    return (
      `You've hit your ${ctx.total} free calls this month.\n` +
      `Keep going free: refer a friend — you both get ${bonusCallsLabel()} bonus calls.\n` +
      `Your link: ${shareLink(ctx.referralCode, 'algovault.com')}.\n` +
      upgradeLine
    );
  }
  return (
    `You've hit your ${ctx.total} free calls this month.\n` +
    `Keep going free: create a free account to get your referral link — refer a friend and you both get ${bonusCallsLabel()} bonus calls → ${referralSignupUrl('limit')}.\n` +
    upgradeLine
  );
}

// ── REFERRAL-INPRODUCT-NUDGE-W1 (2026-06-22): referral arm at the value moments ──
// Mr.1-approved copy applied VERBATIM (line breaks intentional). Numbers from the
// REFERRAL_TERMS SoT (BONUS_CALLS); the keyed link from shareLink(code) — never
// hardcoded. State-adaptive (keyed → own give-get link; keyless → free-account
// get-your-link path). The structured ReferralHint is allow-listed (no outcome_*).

/** Trigger (a) gate: the trade-call `confidence` (0-100) at/above which a first
 *  non-HOLD is "high-conviction" enough to ask for a referral — the anti-"random
 *  ask" guard (Mr.1 2026-06-22). Set well above the ~52 track-record record gate.
 *  Tunable; lives here as the referral arm's gate. */
export const AHA_HIGH_CONVICTION_CONFIDENCE = 70;

/** The 4 aha referral triggers (Mr.1 2026-06-22). `aha_verify` ships its copy +
 *  enum value here but is UNWIRED this wave — the `signal-performance` resource
 *  read carries no per-user attribution, so the trigger is deferred to
 *  `OPS-REFERRAL-VERIFY-NUDGE-W{NEXT}` (which adds the one call site). */
export type AhaReferralFrom = 'aha_call' | 'aha_scan' | 'aha_milestone' | 'aha_verify';

/** `referral_hint.from` — the limit wall + the aha triggers. */
export type ReferralFrom = 'limit' | AhaReferralFrom;

/** Free-account signup URL for a KEYLESS user to mint their own key + link. The
 *  paid path keeps `?plan=starter` (`nudgeSignupUrl`); the referral path omits it
 *  so the `/signup` start-free form is the landing. `<from>_referral` attributes
 *  the CTA in the existing `upgrade_from` funnel capture (keys on ANY value). */
export function referralSignupUrl(from: ReferralFrom): string {
  return `${SIGNUP_BASE}?upgrade_from=${from}_referral`;
}

/** Structured, allow-listed referral hint — rides `_algovault.referral_hint` (aha)
 *  + the TIER_LIMIT_REACHED envelope (limit). EXACTLY these 4 keys; NO outcome_*. */
export interface ReferralHint {
  cta: string;
  link_or_path: string;
  bonus_calls: number;
  from: ReferralFrom;
}

/** Build the allow-listed structured referral hint. keyed → full give-get URL
 *  (agent-relayable https link); keyless → free-account get-your-link URL. */
export function buildReferralHint(args: { from: ReferralFrom; code: string | null }): ReferralHint {
  const { from, code } = args;
  return {
    cta: code
      ? `Refer a friend — you both get ${bonusCallsLabel()} bonus calls`
      : `Create a free account to get your referral link — you both get ${bonusCallsLabel()} bonus calls`,
    link_or_path: code ? shareLink(code) : referralSignupUrl(from),
    bonus_calls: REFERRAL_TERMS.BONUS_CALLS,
    from,
  };
}

/** Aha referral hint (KEYED only — keyless aha keeps `buildAhaHint`). The caller
 *  caps it to ≤1 per session via `shouldShowAhaReferral`. Each line KEEPS the
 *  on-chain proof anchor (Q3). Copy Mr.1-approved 2026-06-22; numbers from SoT.
 *  The display link is scheme-less (`algovault.com/join?ref=`) to match the copy. */
export function buildAhaReferral(args: {
  from: AhaReferralFrom;
  code: string;
  stats: NudgeStats;
  verdict?: string;       // aha_call: 'BUY' | 'SELL'
  k?: number;             // aha_scan: # live calls surfaced
  callCountUser?: number; // aha_milestone: the milestone crossed
}): string {
  const { from, code, stats } = args;
  const link = shareLink(code, 'algovault.com');
  const bonus = bonusCallsLabel();
  switch (from) {
    case 'aha_call':
      return (
        `That's a high-conviction ${args.verdict ?? 'BUY/SELL'} call — ${stats.pfeWr}% PFE win rate across ${stats.callCount}+ on-chain-verified calls. ` +
        `Friends get ${bonus} bonus calls with your link → ${link}`
      );
    case 'aha_scan':
      return (
        `Your scan surfaced ${args.k ?? 0} live calls — all on-chain-verified, ${stats.pfeWr}% PFE win rate. ` +
        `Pass it on: friends get ${bonus} bonus calls → ${link}`
      );
    case 'aha_milestone':
      return (
        `You've pulled ${args.callCountUser ?? 0} calls with AlgoVault. Know a trader who'd use it? ` +
        `They get ${bonus} bonus calls with your link → ${link}`
      );
    case 'aha_verify':
      return (
        `Every call is on-chain-verified — ${stats.pfeWr}% PFE WR across ${stats.callCount}+. ` +
        `Share the proof: friends get ${bonus} bonus calls → ${link}`
      );
  }
}
