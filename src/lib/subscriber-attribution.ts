/**
 * SUBSCRIBER-ATTRIBUTION-SPINE-W1 — durable acquisition-attribution spine.
 *
 * The reusable, channel-agnostic artifact: capture (C1), conversion-time
 * profiler (C2), admin read (C3). New producers (TG bot / MCP upgrade / raw
 * API) plug in by emitting a `<channel>:<ts>:<rand>` client_reference_id at
 * click time — no schema change.
 *
 * Privacy: stores ip_hash (sha256→16hex via analytics.hashIp), NEVER a raw IP.
 * PII (name/email/country) lives ONLY in subscriber_profiles (C2) behind the
 * ADMIN_API_KEY-gated route (C3); it never touches the MCP surface or any
 * public/un-gated route.
 *
 * Fail-open is LAW for this wave: capture/profiler are fire-and-forget +
 * try-caught so a DB error can never block, slow, or fail the /signup redirect,
 * the payment, or the entitlement grant.
 */
import { dbExec, dbRun, dbQuery } from './performance-db.js';

const PG = !!process.env.DATABASE_URL;
const TS = PG ? 'TIMESTAMPTZ' : 'TIMESTAMP';
const NOW = PG ? 'now()' : "(datetime('now'))";

// ── C1: signup attribution capture ──────────────────────────────────────────

const CREATE_SIGNUP_ATTRIBUTION_SQL = `
  CREATE TABLE IF NOT EXISTS signup_attribution (
    client_reference_id TEXT PRIMARY KEY,
    created_at ${TS} NOT NULL DEFAULT ${NOW},
    channel TEXT NOT NULL DEFAULT 'unknown',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    landing_path TEXT,
    tier_requested TEXT,
    ip_hash TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_signup_attribution_created_at ON signup_attribution (created_at);
`;

let _signupAttributionInit = false;
export function ensureSignupAttributionSchema(): void {
  if (_signupAttributionInit) return;
  dbExec(CREATE_SIGNUP_ATTRIBUTION_SQL);
  _signupAttributionInit = true;
}

/**
 * Channel-agnostic derivation from the synthetic client_reference_id prefix
 * (`<channel>:<ts>:<rand>`), with a utm_source fallback. Pure + unit-tested so
 * future producers (TG / MCP / API) are a one-line prefix, no schema change.
 */
export function deriveChannel(clientRefId: string, utmSource?: string | null): string {
  const id = (clientRefId || '').toLowerCase();
  if (id.startsWith('tg_bot:') || id.startsWith('tg:')) return 'tg_bot';
  if (id.startsWith('mcp:')) return 'mcp';
  if (id.startsWith('api:')) return 'api';
  if (id.startsWith('direct:')) return 'direct';
  const u = (utmSource || '').toLowerCase();
  if (u) {
    if (u.includes('telegram') || u.includes('tg')) return 'tg_bot';
    if (u.includes('mcp')) return 'mcp';
    if (u.includes('api')) return 'api';
  }
  return 'unknown';
}

export interface SignupAttributionInput {
  clientReferenceId: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
  tierRequested?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}

/** DI seam — tests inject a throwing/recording writer to prove fail-open. */
export interface AttributionWriter {
  ensure: () => void;
  run: (sql: string, ...params: unknown[]) => void;
}
const defaultWriter: AttributionWriter = { ensure: ensureSignupAttributionSchema, run: dbRun };

/**
 * Fail-open, fire-and-forget capture of a /signup click. `ON CONFLICT
 * (client_reference_id) DO NOTHING` makes a re-click idempotent. NEVER throws —
 * any capture error is swallowed + logged so the 303 redirect is byte- and
 * latency-unaffected (revenue path is LAW for this wave).
 */
export function recordSignupAttribution(
  input: SignupAttributionInput,
  writer: AttributionWriter = defaultWriter,
): void {
  try {
    writer.ensure();
    const channel = deriveChannel(input.clientReferenceId, input.utmSource ?? null);
    writer.run(
      `INSERT INTO signup_attribution
        (client_reference_id, channel, utm_source, utm_medium, utm_campaign, referrer, landing_path, tier_requested, ip_hash, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_reference_id) DO NOTHING`,
      input.clientReferenceId,
      channel,
      input.utmSource ?? null,
      input.utmMedium ?? null,
      input.utmCampaign ?? null,
      input.referrer ?? null,
      input.landingPath ?? null,
      input.tierRequested ?? null,
      input.ipHash ?? null,
      input.userAgent ?? null,
    );
  } catch (err) {
    console.warn('[recordSignupAttribution] capture failed (fail-open):', err instanceof Error ? err.message : err);
  }
}

// ── C2: conversion-time auto-profiler (the productized diagnosis) ────────────

const CREATE_SUBSCRIBER_PROFILES_SQL = `
  CREATE TABLE IF NOT EXISTS subscriber_profiles (
    customer_id TEXT PRIMARY KEY,
    created_at ${TS} DEFAULT ${NOW},
    email TEXT,
    name TEXT,
    subscription_id TEXT,
    tier TEXT,
    status TEXT,
    amount_usd ${PG ? 'NUMERIC(10,2)' : 'REAL'},
    currency TEXT,
    channel TEXT,
    country TEXT,
    country_source TEXT,
    client_reference_id TEXT,
    signup_at ${TS},
    converted_at ${TS},
    latency_seconds INTEGER,
    cold_subscribe BOOLEAN,
    attribution_captured BOOLEAN,
    risk_level TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_subscriber_profiles_converted_at ON subscriber_profiles (converted_at DESC);
`;

let _subscriberProfilesInit = false;
export function ensureSubscriberProfilesSchema(): void {
  if (_subscriberProfilesInit) return;
  dbExec(CREATE_SUBSCRIBER_PROFILES_SQL);
  _subscriberProfilesInit = true;
}

export interface SubscriberProfile {
  customerId: string;
  email: string | null;
  name: string | null;
  subscriptionId: string | null;
  tier: string | null;
  status: string | null;
  amountUsd: number | null;
  currency: string | null;
  channel: string;
  country: string | null;
  countrySource: string | null;
  clientReferenceId: string | null;
  signupAt: string | null;
  convertedAt: string;
  latencySeconds: number | null;
  coldSubscribe: boolean | null;
  attributionCaptured: boolean;
  riskLevel: string | null;
}

export interface ProfileSignals {
  attribution?: { channel: string; created_at: string } | null;
  hasOptin?: boolean;
  hasUpgradeCta?: boolean;
  /** Geo tier-1 (card-issuing / Link country) when resolvable; else billing-address is used. */
  cardCountry?: string | null;
  riskLevel?: string | null;
  /** Conversion epoch (sec) — injected so assembleProfile stays pure/testable. */
  convertedAtEpoch: number;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Pure assembly of a subscriber profile from the Stripe checkout session +
 * resolved first-party signals. No I/O, no Date.now (convertedAtEpoch injected)
 * — so channel-resolution order / geo source / cold logic / latency are unit-
 * testable. NEVER fabricates an IP or geo: country comes ONLY from the supplied
 * cardCountry (tier-1) or the session's billing-address country (tier-2).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assembleProfile(session: any, signals: ProfileSignals): SubscriberProfile {
  const customerId = typeof session?.customer === 'string'
    ? session.customer
    : asString(session?.customer?.id) ?? '';
  const cd = session?.customer_details ?? {};
  const email = asString(cd.email) ?? asString(session?.customer_email);
  const clientReferenceId = asString(session?.client_reference_id);
  const utmSource = asString(session?.metadata?.utm_source);

  // Channel: (1) the joined signup_attribution channel; (2) deriveChannel
  // fallback; (3) 'unknown'. attribution_captured records whether a click row
  // existed (the pre-spine cohort, e.g. cus_UepU…, has none → false).
  const attributionCaptured = !!signals.attribution;
  const channel = signals.attribution?.channel
    ?? deriveChannel(clientReferenceId ?? '', utmSource);

  // Geo: card-issuing (tier-1, when resolvable) → billing-address country.
  // Never an IP. country_source names the field used.
  const billingCountry = asString(cd.address?.country);
  let country: string | null = null;
  let countrySource: string | null = null;
  if (signals.cardCountry) { country = signals.cardCountry; countrySource = 'card_issuing'; }
  else if (billingCountry) { country = billingCountry; countrySource = 'billing_address'; }

  // Latency: signup→convert from the attribution row when present, else the
  // session create→complete delta. Clamp ≥ 0 (clock-skew safety).
  const signupAt = asString(signals.attribution?.created_at);
  let latencySeconds: number | null = null;
  if (signupAt) {
    const s = Math.floor(new Date(signupAt).getTime() / 1000);
    if (Number.isFinite(s)) latencySeconds = Math.max(0, signals.convertedAtEpoch - s);
  } else if (typeof session?.created === 'number') {
    latencySeconds = Math.max(0, signals.convertedAtEpoch - session.created);
  }

  // cold_subscribe = email present AND no free-tier opt-in AND no upgrade-CTA
  // bridge. Honest NULL when email is absent (indeterminable).
  const coldSubscribe = email ? (!signals.hasOptin && !signals.hasUpgradeCta) : null;

  const amountTotal = typeof session?.amount_total === 'number' ? session.amount_total : null;

  return {
    customerId,
    email,
    name: asString(cd.name),
    subscriptionId: typeof session?.subscription === 'string'
      ? session.subscription
      : asString(session?.subscription?.id),
    tier: asString(session?.metadata?.tier),
    status: 'active', // checkout.session.completed ⇒ the subscription is live
    amountUsd: amountTotal != null ? Math.round(amountTotal) / 100 : null,
    currency: asString(session?.currency),
    channel,
    country,
    countrySource,
    clientReferenceId,
    signupAt,
    convertedAt: new Date(signals.convertedAtEpoch * 1000).toISOString(),
    latencySeconds,
    coldSubscribe,
    attributionCaptured,
    riskLevel: signals.riskLevel ?? null,
  };
}

export interface ProfileDeps {
  ensure: () => void;
  query: <T = Record<string, unknown>>(sql: string, params: unknown[]) => Promise<T[]>;
  run: (sql: string, ...params: unknown[]) => void;
  /** Optional best-effort tier-1 geo + risk (card-issuing / Link country). */
  resolveCardGeo?: (customerId: string) => Promise<{ country: string | null; riskLevel: string | null } | null>;
  /** Conversion epoch override (sec) — for deterministic tests/backfill. */
  nowEpoch?: number;
}
const defaultProfileDeps: ProfileDeps = {
  ensure: () => { ensureSubscriberProfilesSchema(); ensureSignupAttributionSchema(); },
  query: dbQuery,
  run: dbRun,
};

/**
 * Conversion-time auto-profiler — the productized SUBSCRIBER-ATTRIBUTION-
 * DIAGNOSIS-W1. Called from the checkout.session.completed case AFTER
 * tryClaimEvent (so a webhook replay never re-profiles), and ALSO idempotent on
 * subscriber_profiles.customer_id (ON CONFLICT DO UPDATE). Fail-open: any error
 * is swallowed + logged so the webhook still 200s and the entitlement grant is
 * never affected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildSubscriberProfile(session: any, deps: ProfileDeps = defaultProfileDeps): Promise<void> {
  try {
    const customerId = typeof session?.customer === 'string'
      ? session.customer
      : asString(session?.customer?.id);
    if (!customerId) {
      console.warn('[buildSubscriberProfile] no customer id on session — skipping (fail-open)');
      return;
    }
    deps.ensure();

    const clientReferenceId = asString(session?.client_reference_id);
    const email = asString(session?.customer_details?.email) ?? asString(session?.customer_email);

    // (1) channel via JOIN signup_attribution by client_reference_id
    let attribution: { channel: string; created_at: string } | null = null;
    if (clientReferenceId) {
      const rows = await deps.query<{ channel: string; created_at: unknown }>(
        'SELECT channel, created_at FROM signup_attribution WHERE client_reference_id = ?',
        [clientReferenceId],
      );
      if (rows.length > 0) attribution = { channel: String(rows[0].channel), created_at: String(rows[0].created_at) };
    }
    // (2) cold-subscribe signals: free-tier opt-in + upgrade-CTA bridge
    let hasOptin = false;
    let hasUpgradeCta = false;
    if (email) {
      const optin = await deps.query('SELECT 1 AS one FROM signup_emails WHERE lower(email) = lower(?) LIMIT 1', [email]);
      hasOptin = optin.length > 0;
    }
    if (clientReferenceId) {
      const cta = await deps.query(
        "SELECT 1 AS one FROM funnel_events WHERE event_type = 'upgrade_cta_clicked' AND session_id = ? LIMIT 1",
        [clientReferenceId],
      );
      hasUpgradeCta = cta.length > 0;
    }
    // (3) optional tier-1 geo + risk (best-effort; never blocks/throws)
    let cardCountry: string | null = null;
    let riskLevel: string | null = null;
    if (deps.resolveCardGeo) {
      try {
        const g = await deps.resolveCardGeo(customerId);
        cardCountry = g?.country ?? null;
        riskLevel = g?.riskLevel ?? null;
      } catch (e) {
        console.warn('[buildSubscriberProfile] card-geo enrich failed (fall back to billing):', e instanceof Error ? e.message : e);
      }
    }

    const nowEpoch = deps.nowEpoch ?? Math.floor(Date.now() / 1000);
    const p = assembleProfile(session, { attribution, hasOptin, hasUpgradeCta, cardCountry, riskLevel, convertedAtEpoch: nowEpoch });

    deps.run(
      `INSERT INTO subscriber_profiles
        (customer_id, email, name, subscription_id, tier, status, amount_usd, currency, channel, country, country_source,
         client_reference_id, signup_at, converted_at, latency_seconds, cold_subscribe, attribution_captured, risk_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (customer_id) DO UPDATE SET
         email = EXCLUDED.email, name = EXCLUDED.name, subscription_id = EXCLUDED.subscription_id,
         tier = EXCLUDED.tier, status = EXCLUDED.status, amount_usd = EXCLUDED.amount_usd, currency = EXCLUDED.currency,
         channel = EXCLUDED.channel, country = EXCLUDED.country, country_source = EXCLUDED.country_source,
         client_reference_id = EXCLUDED.client_reference_id, signup_at = EXCLUDED.signup_at,
         converted_at = EXCLUDED.converted_at, latency_seconds = EXCLUDED.latency_seconds,
         cold_subscribe = EXCLUDED.cold_subscribe, attribution_captured = EXCLUDED.attribution_captured,
         risk_level = EXCLUDED.risk_level`,
      p.customerId, p.email, p.name, p.subscriptionId, p.tier, p.status, p.amountUsd, p.currency, p.channel,
      p.country, p.countrySource, p.clientReferenceId, p.signupAt, p.convertedAt, p.latencySeconds,
      p.coldSubscribe, p.attributionCaptured, p.riskLevel,
    );
    console.log(`[buildSubscriberProfile] profiled ${p.customerId} channel=${p.channel} country=${p.country ?? '?'}/${p.countrySource ?? '-'} cold=${p.coldSubscribe} captured=${p.attributionCaptured}`);
  } catch (err) {
    console.error('[buildSubscriberProfile] failed (fail-open):', err instanceof Error ? err.message : err);
  }
}
