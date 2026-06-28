/**
 * oiscore-shadow.ts — SCAN-RANKBY-REFINEMENTS-W1 CH4
 *
 * SHADOW measurement store for the oiScore re-base. The verdict's internal OI-momentum
 * score is still priceChange-derived; CH4 instruments a real-OI (contracts-basis) re-base
 * WITHOUT changing the live verdict (OISCORE_SOURCE defaults to 'price' → byte-identical).
 * For each evaluated signal with a contracts-basis OI delta, `recordOiScoreShadow` persists
 * BOTH verdicts so a read-only harness can quantify the divergence; the FLIP is the
 * separate ratified SCAN-OISCORE-FLIP-W1 (gated on matured outcomes + WR non-regression).
 *
 * Data Integrity: the write is FIRE-AND-FORGET and FULLY try/catch-isolated here — a
 * shadow-write defect NEVER blocks or fails the live verdict (the caller also `void`s +
 * `.catch()`es it; this is defense-in-depth). Append-only; the harness is read-only.
 * Mirrors oi-snapshots.ts (firewalled performance-db via `dbQuery`; PG $N; SSH-preapplied
 * migrations/021 + lazily-ensured here for fresh-box repro; SQL contract mock-tested).
 */

import { dbQuery } from './performance-db.js';
import type { SignalVerdict } from '../types.js';

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS oiscore_shadow (
  id             BIGSERIAL        PRIMARY KEY,
  ts             BIGINT           NOT NULL,
  exchange       TEXT             NOT NULL,
  symbol         TEXT             NOT NULL,
  timeframe      TEXT             NOT NULL,
  oiscore_price  DOUBLE PRECISION NOT NULL,
  oiscore_oi     DOUBLE PRECISION NOT NULL,
  call_price     TEXT             NOT NULL,
  call_oi        TEXT             NOT NULL,
  conf_price     INTEGER          NOT NULL,
  conf_oi        INTEGER          NOT NULL
)`;
const CREATE_INDEX_SQL =
  `CREATE INDEX IF NOT EXISTS idx_oiscore_shadow_sym_ts ON oiscore_shadow (symbol, exchange, timeframe, ts)`;

let _ensured = false;

async function ensureTable(): Promise<void> {
  if (_ensured) return;
  await dbQuery(CREATE_TABLE_SQL);
  await dbQuery(CREATE_INDEX_SQL);
  _ensured = true;
}

/** Test-only reset of the once-per-process ensure flag. */
export function _resetOiScoreShadowEnsure(): void {
  _ensured = false;
}

export interface OiScoreShadowRow {
  coin: string;
  exchange: string;
  timeframe: string;
  oiScorePrice: number;
  oiScoreOi: number;
  callPrice: SignalVerdict;
  callOi: SignalVerdict;
  confPrice: number;
  confOi: number;
  /** Epoch ms; defaults to now. */
  ts?: number;
}

/**
 * Persist ONE shadow divergence row. FIRE-AND-FORGET safe: all errors are swallowed
 * here (the caller additionally `void`s + `.catch()`es) so a shadow-write failure can
 * NEVER affect the live verdict. Returns true on a successful insert, false on any error.
 */
export async function recordOiScoreShadow(row: OiScoreShadowRow): Promise<boolean> {
  try {
    await ensureTable();
    await dbQuery(
      `INSERT INTO oiscore_shadow
        (ts, exchange, symbol, timeframe, oiscore_price, oiscore_oi, call_price, call_oi, conf_price, conf_oi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        row.ts ?? Date.now(),
        row.exchange,
        row.coin.toUpperCase(),
        row.timeframe,
        row.oiScorePrice,
        row.oiScoreOi,
        row.callPrice,
        row.callOi,
        row.confPrice,
        row.confOi,
      ],
    );
    return true;
  } catch {
    // Shadow-only: never propagate. (Operator forensics live in the harness, not here.)
    return false;
  }
}

export interface OiScoreShadowSummary {
  total: number;
  /** Rows whose call would FLIP (call_price !== call_oi). */
  flips: number;
  /** Breakdown of flip transitions, e.g. "HOLD→BUY". */
  byTransition: Record<string, number>;
  /** Mean |conf_oi − conf_price| over all rows (0 when empty). */
  meanAbsConfDelta: number;
  sinceMs: number;
}

/**
 * READ-ONLY harness aggregate: divergence summary over the last `windowMs`. Does NOT
 * compute PFE-WR(old) vs PFE-WR(new) — that requires matured Phase-E outcomes and is
 * finalized in SCAN-OISCORE-FLIP-W1. This wave only instruments + reports divergence.
 */
export async function summarizeOiScoreShadow(
  windowMs: number = 30 * 24 * 60 * 60 * 1000,
  nowMs: number = Date.now(),
): Promise<OiScoreShadowSummary> {
  const since = nowMs - windowMs;
  const rows = await dbQuery<{
    call_price: string;
    call_oi: string;
    conf_price: number | string;
    conf_oi: number | string;
  }>(
    `SELECT call_price, call_oi, conf_price, conf_oi FROM oiscore_shadow WHERE ts >= $1`,
    [since],
  );
  const byTransition: Record<string, number> = {};
  let flips = 0;
  let confDeltaSum = 0;
  for (const r of rows) {
    confDeltaSum += Math.abs(Number(r.conf_oi) - Number(r.conf_price));
    if (r.call_price !== r.call_oi) {
      flips++;
      const key = `${r.call_price}→${r.call_oi}`;
      byTransition[key] = (byTransition[key] ?? 0) + 1;
    }
  }
  return {
    total: rows.length,
    flips,
    byTransition,
    meanAbsConfDelta: rows.length ? confDeltaSum / rows.length : 0,
    sinceMs: since,
  };
}
