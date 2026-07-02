/**
 * calibration-audit.ts — EQUITY-CALIBRATION-AUDIT-W1.
 *
 * A REUSABLE, asset-class-parameterised adversarial audit of a PFE win-rate:
 * is a headline "~90% win-rate" a real directional EDGE, or a metric artifact
 * (peak-favorable-excursion base rate on an oscillating tape)? Ships PURE,
 * unit-tested computation (PFE-win predicate, benchmark edge, confidence
 * calibration + ECE, realized-hit, sign-agreement, robustness splits) so crypto
 * can be re-audited with the identical harness and options/futures/intraday
 * inherit it (Pillar 2 — generator-level fix, not a one-off equity check).
 *
 * READ-ONLY: the CLI fetcher issues only SELECTs. No writes, ever.
 *
 * SINGLE-DERIVATION: `isPfeWin` is the SHIPPED predicate, byte-identical to
 * src/lib/equities/equity-outcomes.ts + src/resources/signal-performance.ts
 * (BUY tracks the highest high → win = pfe>0; SELL the lowest low → win = pfe<0).
 * Re-inventing it here would let the audit "pass" a definition the product
 * doesn't use — forbidden.
 *
 * INTERNAL — numeric findings live in the private vault, never a response path.
 * `outcome_return_pct` may be READ for the R5 sign-agreement RATE only; its
 * values are never emitted.
 */

// ── Row shape (asset-agnostic) ───────────────────────────────────────────────
export interface AuditRow {
  call: 'BUY' | 'SELL';
  pfePct: number; // signed favorable-excursion %, entry-anchored (the SHIPPED metric)
  confidence: number; // engine conviction score, [0,1]
  entry: number; // close on the decision session (anchor)
  winHighMax: number; // max high over the forward window (for the always-BUY benchmark)
  winLowMin: number; // min low over the forward window (for the always-SELL benchmark)
  outcomeReturnPct: number; // INTERNAL close-to-close return %; used only for the sign-agreement RATE
  regime: string | null;
  bucket?: string | null;
}

// ── The SHIPPED PFE-win predicate (single-derivation; do not re-invent) ──────
export function isPfeWin(call: 'BUY' | 'SELL', pfePct: number): boolean {
  return (call === 'BUY' && pfePct > 0) || (call === 'SELL' && pfePct < 0);
}

/** Realized close-to-close directional hit: did the call's direction actually pay? */
export function isRealizedFavorable(call: 'BUY' | 'SELL', outcomeReturnPct: number): boolean {
  return (call === 'BUY' && outcomeReturnPct > 0) || (call === 'SELL' && outcomeReturnPct < 0);
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (preds: boolean[]): number => mean(preds.map((b) => (b ? 1 : 0)));

// Deterministic seeded call for the random-benchmark (index-hashed — no
// Math.random, so unit tests are reproducible and workflow-safe).
export function seededCall(index: number, seed = 1337): 'BUY' | 'SELL' {
  let h = (index + 1) * 2654435761 + seed * 40503;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return (h & 1) === 0 ? 'BUY' : 'SELL';
}

// ── R2 — base rate & benchmark edge (the centerpiece) ────────────────────────
export interface BenchmarkEdge {
  n: number;
  actualWr: number; // engine's own directional calls
  alwaysBuyWr: number; // treat every verdict as BUY → win iff any high>entry
  alwaysSellWr: number; // treat every verdict as SELL → win iff any low<entry
  randomWr: number; // seeded coin-flip direction
  anyDirectionFavorable: number; // mechanical ease: a favorable move existed in EITHER direction
  bestBenchmark: number;
  edge: number; // actualWr − bestBenchmark  (≤ ~0 ⇒ artifact)
  buyWr: number;
  sellWr: number;
  nBuy: number;
  nSell: number;
}

export function benchmarkEdge(rows: AuditRow[]): BenchmarkEdge {
  const buyRows = rows.filter((r) => r.call === 'BUY');
  const sellRows = rows.filter((r) => r.call === 'SELL');
  const alwaysBuyWr = rate(rows.map((r) => r.winHighMax > r.entry));
  const alwaysSellWr = rate(rows.map((r) => r.winLowMin < r.entry));
  const randomWr = rate(
    rows.map((r, i) =>
      seededCall(i) === 'BUY' ? r.winHighMax > r.entry : r.winLowMin < r.entry,
    ),
  );
  const actualWr = rate(rows.map((r) => isPfeWin(r.call, r.pfePct)));
  const bestBenchmark = Math.max(alwaysBuyWr, alwaysSellWr, randomWr);
  return {
    n: rows.length,
    actualWr,
    alwaysBuyWr,
    alwaysSellWr,
    randomWr,
    anyDirectionFavorable: rate(rows.map((r) => r.winHighMax > r.entry || r.winLowMin < r.entry)),
    bestBenchmark,
    edge: actualWr - bestBenchmark,
    buyWr: rate(buyRows.map((r) => isPfeWin('BUY', r.pfePct))),
    sellWr: rate(sellRows.map((r) => isPfeWin('SELL', r.pfePct))),
    nBuy: buyRows.length,
    nSell: sellRows.length,
  };
}

/** Realized directional hit-rate vs the same always-long/short/random benchmarks. */
export interface RealizedHit {
  actual: number;
  alwaysBuy: number;
  alwaysSell: number;
  edge: number;
}
export function realizedHitRate(rows: AuditRow[]): RealizedHit {
  const actual = rate(rows.map((r) => isRealizedFavorable(r.call, r.outcomeReturnPct)));
  const alwaysBuy = rate(rows.map((r) => r.outcomeReturnPct > 0));
  const alwaysSell = rate(rows.map((r) => r.outcomeReturnPct < 0));
  return { actual, alwaysBuy, alwaysSell, edge: actual - Math.max(alwaysBuy, alwaysSell) };
}

// ── R3 — confidence calibration + ECE ────────────────────────────────────────
export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  wr: number;
  meanConf: number;
}
export function calibrationBins(rows: AuditRow[], nBins = 10): CalibrationBin[] {
  const bins: AuditRow[][] = Array.from({ length: nBins }, () => []);
  for (const r of rows) {
    const c = Math.min(Math.max(r.confidence, 0), 1);
    const idx = Math.min(nBins - 1, Math.floor(c * nBins)); // conf==1 → last bin
    bins[idx].push(r);
  }
  return bins
    .map((b, i) => ({
      lo: i / nBins,
      hi: (i + 1) / nBins,
      n: b.length,
      wr: rate(b.map((r) => isPfeWin(r.call, r.pfePct))),
      meanConf: mean(b.map((r) => r.confidence)),
    }))
    .filter((b) => b.n > 0);
}

/** Expected Calibration Error: Σ (n_b/N)·|WR_b − meanConf_b|. */
export function expectedCalibrationError(bins: CalibrationBin[]): number {
  const total = bins.reduce((a, b) => a + b.n, 0);
  if (total === 0) return 0;
  return bins.reduce((acc, b) => acc + (b.n / total) * Math.abs(b.wr - b.meanConf), 0);
}

/** Monotonic iff WR is non-decreasing across bins with n ≥ minN. */
export function isMonotonic(bins: CalibrationBin[], minN = 20): boolean {
  const wrs = bins.filter((b) => b.n >= minN).map((b) => b.wr);
  for (let i = 1; i < wrs.length; i++) if (wrs[i] < wrs[i - 1] - 1e-9) return false;
  return wrs.length > 1;
}

// ── R5 — magnitude + PFE↔realized sign agreement ─────────────────────────────
/** percentile_cont-equivalent (linear interpolation on the sorted sample). */
export function percentileCont(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const frac = rank - lo;
  if (lo + 1 >= n) return sortedAsc[n - 1];
  return sortedAsc[lo] + frac * (sortedAsc[lo + 1] - sortedAsc[lo]);
}

export interface MagnitudeQuartiles {
  nWins: number;
  p25: number;
  median: number;
  p75: number;
}
export function winMagnitudeQuartiles(rows: AuditRow[]): MagnitudeQuartiles {
  const mags = rows
    .filter((r) => isPfeWin(r.call, r.pfePct))
    .map((r) => Math.abs(r.pfePct))
    .sort((a, b) => a - b);
  return {
    nWins: mags.length,
    p25: percentileCont(mags, 0.25),
    median: percentileCont(mags, 0.5),
    p75: percentileCont(mags, 0.75),
  };
}

export interface SignAgreement {
  nPfeWins: number;
  pfeWinAlsoRealizedFav: number; // of PFE-wins, fraction that also ended net-favorable
  overallAgreement: number; // fraction where PFE-win flag == realized-favorable flag
}
export function signAgreement(rows: AuditRow[]): SignAgreement {
  const wins = rows.filter((r) => isPfeWin(r.call, r.pfePct));
  return {
    nPfeWins: wins.length,
    pfeWinAlsoRealizedFav: rate(wins.map((r) => isRealizedFavorable(r.call, r.outcomeReturnPct))),
    overallAgreement: rate(
      rows.map((r) => isPfeWin(r.call, r.pfePct) === isRealizedFavorable(r.call, r.outcomeReturnPct)),
    ),
  };
}

// ── R6 — robustness splits ───────────────────────────────────────────────────
export interface SplitCell {
  key: string;
  n: number;
  wr: number;
}
export function splitWr(rows: AuditRow[], keyFn: (r: AuditRow) => string | null): SplitCell[] {
  const groups = new Map<string, AuditRow[]>();
  for (const r of rows) {
    const k = keyFn(r) ?? '(null)';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.entries()]
    .map(([key, rs]) => ({ key, n: rs.length, wr: rate(rs.map((r) => isPfeWin(r.call, r.pfePct))) }))
    .sort((a, b) => b.n - a.n);
}

// ── Report orchestration (pure) ──────────────────────────────────────────────
export interface AuditReport {
  assetClass: string;
  n: number;
  headlineWr: number;
  edge: BenchmarkEdge;
  realized: RealizedHit;
  calibration: { bins: CalibrationBin[]; ece: number; monotonic: boolean };
  magnitude: MagnitudeQuartiles;
  sign: SignAgreement;
  byRegime: SplitCell[];
  byBucket: SplitCell[];
  edgeFloorPts: number;
  verdict: 'GO' | 'GO-WITH-REFRAME' | 'NO-GO';
}

/**
 * Verdict rule: NO-GO when the PFE-win edge over the best naive benchmark is
 * below the floor (metric artifact) OR realized directional edge ≤ 0 (the calls
 * don't beat a coin flip on realized return). GO-WITH-REFRAME when there is a
 * real (≥floor) PFE edge but PFE↔realized agreement is weak (needs caveats).
 * GO only when both edges clear their floors.
 */
export function computeAuditReport(
  rows: AuditRow[],
  assetClass: string,
  edgeFloorPts = 0.08,
): AuditReport {
  const edge = benchmarkEdge(rows);
  const realized = realizedHitRate(rows);
  const bins = calibrationBins(rows);
  let verdict: AuditReport['verdict'];
  if (edge.edge < edgeFloorPts || realized.edge <= 0) verdict = 'NO-GO';
  else if (signAgreement(rows).pfeWinAlsoRealizedFav < 0.6) verdict = 'GO-WITH-REFRAME';
  else verdict = 'GO';
  return {
    assetClass,
    n: rows.length,
    headlineWr: edge.actualWr,
    edge,
    realized,
    calibration: { bins, ece: expectedCalibrationError(bins), monotonic: isMonotonic(bins) },
    magnitude: winMagnitudeQuartiles(rows),
    sign: signAgreement(rows),
    byRegime: splitWr(rows, (r) => r.regime),
    byBucket: splitWr(rows, (r) => r.bucket ?? null),
    edgeFloorPts,
    verdict,
  };
}

// ── CLI (read-only fetch → report). Runs in-container: node dist/scripts/calibration-audit.js ──
/* c8 ignore start */
const EQUITY_AUDIT_SQL = `
WITH v AS (
  SELECT id, symbol, session_date, call, pfe_pct, confidence, regime, outcome_return_pct
  FROM equity_verdicts
  WHERE call IN ('BUY','SELL') AND outcome_filled_at IS NOT NULL AND engine_version=$1
)
SELECT v.call, v.pfe_pct::float8 AS pfe_pct, v.confidence::float8 AS confidence,
       v.outcome_return_pct::float8 AS outcome_return_pct, v.regime,
       e.close::float8 AS entry, w.hi::float8 AS win_high_max, w.lo::float8 AS win_low_min,
       CASE WHEN u.is_etf THEN 'etf' WHEN u.rank_adv BETWEEN 1 AND 50 THEN '1-50'
            WHEN u.rank_adv BETWEEN 51 AND 100 THEN '51-100'
            WHEN u.rank_adv BETWEEN 101 AND 500 THEN '101-500' ELSE 'other' END AS bucket
FROM v
JOIN equity_bars_daily e ON e.symbol=v.symbol AND e.session_date=v.session_date
LEFT JOIN equity_universe u ON u.symbol=v.symbol
JOIN LATERAL (
  SELECT max(high) AS hi, min(low) AS lo, count(*) AS n
  FROM (SELECT high, low FROM equity_bars_daily b
        WHERE b.symbol=v.symbol AND b.session_date > v.session_date
        ORDER BY b.session_date ASC LIMIT 5) win
) w ON true
WHERE w.n = 5;`;

async function fetchEquityRows(engineVersion: string): Promise<AuditRow[]> {
  const { dbQuery } = await import('../lib/performance-db.js');
  const raw = await dbQuery<{
    call: 'BUY' | 'SELL';
    pfe_pct: number;
    confidence: number;
    outcome_return_pct: number;
    regime: string | null;
    entry: number;
    win_high_max: number;
    win_low_min: number;
    bucket: string | null;
  }>(EQUITY_AUDIT_SQL, [engineVersion]);
  return raw.map((r) => ({
    call: r.call,
    pfePct: r.pfe_pct,
    confidence: r.confidence,
    entry: r.entry,
    winHighMax: r.win_high_max,
    winLowMin: r.win_low_min,
    outcomeReturnPct: r.outcome_return_pct,
    regime: r.regime,
    bucket: r.bucket,
  }));
}

async function main(): Promise<void> {
  const asset = process.argv.includes('--asset')
    ? process.argv[process.argv.indexOf('--asset') + 1]
    : 'equities';
  if (asset !== 'equities') {
    // Crypto/options/futures re-use the SAME pure functions; only the fetcher
    // (own-bars window) differs — not yet wired (see CRYPTO-PFE-BENCHMARK-AUDIT-W1).
    console.error(`[calibration-audit] asset '${asset}' fetcher not wired; only 'equities' is implemented.`);
    process.exit(2);
  }
  const rows = await fetchEquityRows('equities-v1');
  const rep = computeAuditReport(rows, asset);
  console.log(JSON.stringify(rep, null, 2));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`[calibration-audit] FATAL ${e?.message ?? e}`);
      process.exit(1);
    });
}
/* c8 ignore stop */
