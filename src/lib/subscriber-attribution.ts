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
import { dbExec, dbRun } from './performance-db.js';

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
