/**
 * FEATURE-PARITY-CHANNELS-W1 CH2 — scan-digest pure helpers.
 *
 * Cadence math for the SCHEDULED whole-market scan digest (the scan_digest webhook
 * event + the bot's /scanwatch). Pure + dependency-light (a type-only import) so it
 * is trivially unit-tested and importable by both the webhook scheduler and the
 * webhook-api validation path with no cycle.
 *
 * `cadenceForTimeframe` is the timeframe-aware DEFAULT cadence. It is MIRRORED by
 * the bot's Python `cadence_for_timeframe` (CH4) — the two implementations are a
 * shared-logic candidate flagged for extraction-via-/capabilities at the 3rd
 * consumer (CLAUDE.md 3-example rule); until then the test suites on both sides pin
 * the identical map.
 */

export const VALID_CADENCES = ['1h', '4h', '1d'] as const;
export type Cadence = (typeof VALID_CADENCES)[number];

const CADENCE_SECONDS: Record<Cadence, number> = { '1h': 3600, '4h': 14_400, '1d': 86_400 };

/**
 * Seconds for the scanner's supported timeframes (the SCAN_TRADE_CALLS_SCHEMA enum).
 * Self-contained on purpose — importing performance-db's private TIMEFRAME_SECONDS
 * would couple this leaf helper to the DB core (cycle risk).
 */
const TF_SECONDS: Record<string, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '2h': 7200, '4h': 14_400, '8h': 28_800, '12h': 43_200, '1d': 86_400,
};

/**
 * The DEFAULT cadence for a scan timeframe: the nearest cadence ≥ the timeframe,
 * hard-floored at 1h (never push sub-hourly). 1m–1h → 1h · 2h–4h → 4h · 8h–1d → 1d.
 * An unknown/unsupported tf falls back to '1d' — the conservative default-deny
 * (slowest cadence = least quota draw + least delivery spam).
 */
export function cadenceForTimeframe(timeframe: string): Cadence {
  const sec = TF_SECONDS[timeframe];
  if (sec == null) return '1d';
  if (sec <= CADENCE_SECONDS['1h']) return '1h';
  if (sec <= CADENCE_SECONDS['4h']) return '4h';
  return '1d';
}

/** The scanner's supported timeframes (mirrors the SCAN_TRADE_CALLS_SCHEMA enum). */
export const SCAN_TIMEFRAMES: readonly string[] = Object.keys(TF_SECONDS);

/** Is `tf` a supported scan timeframe? */
export function isSupportedScanTimeframe(tf: unknown): tf is string {
  return typeof tf === 'string' && Object.prototype.hasOwnProperty.call(TF_SECONDS, tf);
}

/** Type guard: is `c` one of the three valid cadences? */
export function isValidCadence(c: unknown): c is Cadence {
  return typeof c === 'string' && (VALID_CADENCES as readonly string[]).includes(c);
}

/**
 * The cadence bucket epoch for `nowSec` — the bucket's start, i.e. `nowSec` floored
 * to the cadence period. Used in the idempotency key so at most one digest is
 * enqueued per (subscription, bucket): a 2nd scheduler tick in the same bucket
 * recomputes the SAME id and the delivery UNIQUE(subscription_id,event_id) no-ops it.
 */
export function cadenceBucketEpoch(cadence: Cadence, nowSec: number): number {
  const period = CADENCE_SECONDS[cadence];
  return Math.floor(nowSec / period) * period;
}

/**
 * True iff the chosen cadence is MORE frequent than the scan timeframe — i.e. the
 * digest fires faster than the scan refreshes, so it repeats the same calls and
 * charges each time. Drives the stronger heads-up in the create-response / bot copy.
 * (The timeframe-derived default is never faster, so it never triggers it.)
 */
export function cadenceFasterThanTimeframe(cadence: Cadence, timeframe: string): boolean {
  const tfSec = TF_SECONDS[timeframe];
  if (tfSec == null) return false;
  return CADENCE_SECONDS[cadence] < tfSec;
}

/** ~How many times a `cadence` digest repeats the same `timeframe` scan (for the heads-up). */
export function repeatsPerTimeframe(cadence: Cadence, timeframe: string): number {
  const tfSec = TF_SECONDS[timeframe];
  if (tfSec == null) return 1;
  return Math.max(1, Math.round(tfSec / CADENCE_SECONDS[cadence]));
}

/**
 * Deterministic idempotency key for a (subscription, cadence-bucket). Replay-safe:
 * the delivery ledger's UNIQUE(subscription_id, event_id) + enqueueDelivery's
 * ON CONFLICT DO NOTHING guarantee at-most-once delivery per bucket.
 */
export function scanDigestEventId(subscriptionId: number, cadence: Cadence, nowSec: number): string {
  return `scan_digest:${subscriptionId}:${cadenceBucketEpoch(cadence, nowSec)}`;
}
