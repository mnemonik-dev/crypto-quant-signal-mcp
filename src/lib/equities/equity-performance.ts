/**
 * EQUITIES-ENGINE-W1 — PFE-only performance aggregates for the additive
 * `equities` key on the performance://signal-performance MCP resource.
 *
 * PFE Win Rate ONLY (whether price moved in the signal direction within the
 * evaluation window). outcome_return_pct is INTERNAL and is never SELECTed or
 * exposed here (Data Integrity LAW). Graceful empty-state before the nightly
 * outcomes backfill has run.
 */
import type { Pool } from 'pg';
import { PFE_HORIZON_SESSIONS, ENGINE_VERSION } from './equity-constants.js';

export interface EquityCallTypeStat {
  count: number;        // BUY/SELL verdicts emitted
  evaluated: number;    // those with a filled PFE outcome
  pfeWinRate: number | null;
}

export interface EquityPerformance {
  state: 'pre_data' | 'live';
  overall: { totalCalls: number; totalEvaluated: number; pfeWinRate: number | null };
  byCallType: { BUY: EquityCallTypeStat; SELL: EquityCallTypeStat };
  pfeHorizonSessions: number;
  engineVersion: string;
  asOfSession: string | null;
  methodology: string;
}

const METHODOLOGY =
  'PFE Win Rate = fraction of BUY/SELL daily-bar verdicts where price moved in the ' +
  `signal direction within the ${PFE_HORIZON_SESSIONS}-session evaluation window. ` +
  'AlgoVault emits directional entry signals; exit timing is the agent’s. ' +
  'Outcome/exit return is internal and never exposed.';

function emptyCallStat(): EquityCallTypeStat { return { count: 0, evaluated: 0, pfeWinRate: null }; }

export async function getEquityPerformance(pool: Pool): Promise<EquityPerformance> {
  const base: EquityPerformance = {
    state: 'pre_data',
    overall: { totalCalls: 0, totalEvaluated: 0, pfeWinRate: null },
    byCallType: { BUY: emptyCallStat(), SELL: emptyCallStat() },
    pfeHorizonSessions: PFE_HORIZON_SESSIONS,
    engineVersion: ENGINE_VERSION,
    asOfSession: null,
    methodology: METHODOLOGY,
  };

  // PFE-only aggregate — outcome_return_pct is intentionally NOT referenced.
  const res = await pool.query(`
    SELECT call,
           count(*)::int AS total,
           count(pfe_pct)::int AS evaluated,
           (count(*) FILTER (WHERE (call='BUY' AND pfe_pct > 0) OR (call='SELL' AND pfe_pct < 0)))::int AS wins
      FROM equity_verdicts
     WHERE call IN ('BUY','SELL')
     GROUP BY call`);
  const asof = await pool.query(`SELECT max(session_date)::text AS d FROM equity_verdicts`);
  base.asOfSession = asof.rows[0]?.d ?? null;

  let totalCalls = 0, totalEvaluated = 0, totalWins = 0;
  for (const r of res.rows as Array<{ call: 'BUY' | 'SELL'; total: number; evaluated: number; wins: number }>) {
    const stat: EquityCallTypeStat = {
      count: r.total,
      evaluated: r.evaluated,
      pfeWinRate: r.evaluated > 0 ? r.wins / r.evaluated : null,
    };
    base.byCallType[r.call] = stat;
    totalCalls += r.total;
    totalEvaluated += r.evaluated;
    totalWins += r.wins;
  }
  base.overall = {
    totalCalls,
    totalEvaluated,
    pfeWinRate: totalEvaluated > 0 ? totalWins / totalEvaluated : null,
  };
  base.state = totalCalls > 0 ? 'live' : 'pre_data';
  return base;
}
