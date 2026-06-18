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
 * 100% limit message — replaces the legacy "Upgrade for unlimited access" copy
 * (a no-"unlimited" copy-rule violation that was LIVE) across BOTH the
 * `TierLimitReachedError` envelope and `getQuotaExhaustedMessage`.
 */
export function buildLimitMessage(ctx: { total: number } & NudgeStats): string {
  return (
    `You've hit your ${ctx.total} free calls this month. ` +
    `Check the proof: ${ctx.pfeWr}% PFE win rate across ${ctx.callCount}+ on-chain-verified calls at ${TRACK_RECORD_URL}. ` +
    `Upgrade now to keep scanning → Starter, 3,000 calls/mo, $9.99: ${nudgeSignupUrl('limit')}`
  );
}
