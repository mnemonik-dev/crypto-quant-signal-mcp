/**
 * funding-episode-builder — PURE funding-carry episode construction (EDGE-CARRY-BACKFILL-W1 CH2).
 *
 * Materialises the Step-0 episode SoT (`audits/EDGE-CARRY-STEP0-W1-2026-07-04.md` §R2) as a pure,
 * interval-aware function so it is unit-testable and re-runnable across floors without refetch.
 * No I/O, no network, no DB — the orchestrator (`backfill-funding-episodes.ts`) feeds it the raw
 * `funding_rates_hist` series and persists the results.
 *
 * Annualization REUSES the deployed `annualizeFunding` (single-derivation with the live
 * `scan_funding_arb` the ranker re-ranks). NOTE: that helper uses a 365-day year (1095@8h); the
 * Step-0 SoT pinned 1095.75 (365.25). The 0.068% difference is immaterial to episode construction
 * (entry/decay thresholds shift < 1e-7 in rate space) and the worked-example gross/net/net-APR round
 * identically — consistency with the engine wins. Documented deviation from Build Rule 3's literal 1095.75.
 */
import { annualizeFunding } from '../lib/rank-constants.js';

/** One funding settlement: `time` = ms epoch, `fundingRate` = signed fraction for ONE interval (0.0001 = 0.01%). */
export interface FundingPoint {
  time: number;
  fundingRate: number;
}

export interface EpisodeConfig {
  /** Venue settlement interval in hours (8 for most, 1 for Hyperliquid). */
  intervalHours: number;
  /** Entry threshold on |annualized funding| (e.g. 0.08 = 8% APR). */
  floorApr: number;
  /** Per-fill taker fee fraction (e.g. 0.0005 = 0.05%). */
  takerFee: number;
  /** Per-fill half-spread fraction (e.g. 0.00005 = 0.5bp). */
  halfSpread: number;
  /** Cost multiplier: 1 = perp round-trip (2 fills, base); 2 = fully-hedged delta-neutral (4 fills). Default 1. */
  costMult?: number;
  /** Max episode horizon in days. Default 14. */
  horizonDays?: number;
  /** Re-entry debounce in intervals after any exit. Default 2. */
  cooldownIntervals?: number;
}

export type ExitReason = 'sign_flip' | 'decay' | 'horizon' | 'data_end';

export interface Episode {
  entryMs: number;
  exitMs: number;
  entrySign: 1 | -1;
  heldIntervals: number;
  durDays: number;
  /** Σ|f_i| over accrued intervals (fraction of notional). */
  gross: number;
  /** Modeled round-trip cost = costMult·(2·taker + 2·halfSpread). */
  rtCost: number;
  /** gross − rtCost. INTERNAL (outcome-class — never exposed publicly). */
  net: number;
  grossApr: number;
  /** INTERNAL. */
  netApr: number;
  netPositive: boolean;
  exitReason: ExitReason;
}

const DAYS_PER_YEAR = 365; // matches annualizeFunding (single-derivation)

/**
 * Construct debounced funding-carry episodes from a single (symbol, venue) funding series.
 *
 * Entry: `flat ∧ cooldown==0 ∧ |APR_i| > floor`. entrySign = sign(f) at entry (+1 ⇒ funding positive ⇒
 * short-perp/long-hedge to RECEIVE). Accrue |f_i| each interval while same-sign as entry.
 * Exit (first to fire): sign_flip (before accruing the flipped interval) · decay (|APR| < floor/2 for
 * 2 consecutive) · horizon (14d). Then cooldown ≥2 intervals before a new entry. One episode per call
 * cursor; the function returns them in chronological order.
 */
export function buildEpisodes(points: FundingPoint[], cfg: EpisodeConfig): Episode[] {
  const ih = cfg.intervalHours;
  if (!Number.isFinite(ih) || ih <= 0) return [];
  const horizonIntervals = Math.round(((cfg.horizonDays ?? 14) * 24) / ih);
  const cooldown = cfg.cooldownIntervals ?? 2;
  const rtCost = (cfg.costMult ?? 1) * (2 * cfg.takerFee + 2 * cfg.halfSpread);

  // Sort ascending + drop non-finite rates (default-deny on corrupt data — never accrue NaN).
  const rows = points
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.fundingRate))
    .sort((a, b) => a.time - b.time);
  const N = rows.length;

  const absApr = (r: number): number => Math.abs(annualizeFunding(r, ih) ?? 0);

  const episodes: Episode[] = [];
  let i = 0;
  let cd = 0;

  while (i < N) {
    const r = rows[i].fundingRate;
    if (cd > 0) {
      cd--;
      i++;
      continue;
    }
    if (absApr(r) <= cfg.floorApr) {
      i++;
      continue;
    }

    // ── ENTER at i ──
    const entrySign: 1 | -1 = r > 0 ? 1 : -1;
    let gross = 0;
    let held = 0;
    let decay = 0;
    let j = i;
    let exitReason: ExitReason = 'data_end';

    while (j < N) {
      const rj = rows[j].fundingRate;
      // sign flip → unwind BEFORE accruing the flipped interval
      if (rj !== 0 && (rj > 0 ? 1 : -1) !== entrySign) {
        exitReason = 'sign_flip';
        break;
      }
      gross += Math.abs(rj);
      held++;
      decay = absApr(rj) < cfg.floorApr / 2 ? decay + 1 : 0;
      if (decay >= 2) {
        j++;
        exitReason = 'decay';
        break;
      }
      if (held >= horizonIntervals) {
        j++;
        exitReason = 'horizon';
        break;
      }
      j++;
    }

    const lastAccruedIdx = Math.min(j, N) - 1;
    const durDays = (held * ih) / 24;
    const net = gross - rtCost;
    episodes.push({
      entryMs: rows[i].time,
      exitMs: rows[lastAccruedIdx].time,
      entrySign,
      heldIntervals: held,
      durDays,
      gross,
      rtCost,
      net,
      grossApr: durDays > 0 ? (gross / durDays) * DAYS_PER_YEAR : 0,
      netApr: durDays > 0 ? (net / durDays) * DAYS_PER_YEAR : 0,
      netPositive: net > 0,
      exitReason,
    });

    i = j; // resume after the exit interval
    cd = cooldown;
  }

  return episodes;
}
