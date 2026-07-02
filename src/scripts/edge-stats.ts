// edge-stats.ts — EDGE-DWR-METRIC-SOT-W1
// The ONE canonical implementation of the edge/directional statistics primitives.
// Leaf module: imports NOTHING from the project (no cycle) so E3' (meta-model) and a
// future AOE promotion-gate retrofit can import it without pulling in the audit harness.
// `calibration-audit.ts` re-exports the shared primitives from here (interface-preserved
// per CRYPTO-EDGE-METRIC-W1; its shipped tests stay green).
//
// Provenance: wilsonInterval / excessZP / benjaminiHochberg / bonferroni / normalCdf were
// authored in calibration-audit.ts (CRYPTO-EDGE-METRIC-W1) and MOVED here verbatim.
// pesaranTimmermann + dwrFromLabels are new to this wave.

/** erf via Abramowitz-Stegun 7.1.26. */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Wilson score interval for a binomial proportion k/n. */
export function wilsonInterval(k: number, n: number, z = 1.96): { lo: number; hi: number; pHat: number } {
  if (n === 0) return { lo: 0, hi: 1, pHat: NaN };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half), pHat: p };
}

/** One-sided z-test that the observed rate exceeds a benchmark rate p0. */
export function excessZP(hits: number, n: number, p0: number): { z: number; p: number } {
  if (n === 0 || p0 <= 0 || p0 >= 1) return { z: 0, p: 1 };
  const pHat = hits / n;
  const se = Math.sqrt((p0 * (1 - p0)) / n);
  const z = (pHat - p0) / se;
  return { z, p: 1 - normalCdf(z) };
}

/** Benjamini-Hochberg FDR at level q. Returns per-index rejection + the cut p. */
export function benjaminiHochberg(pvals: number[], q = 0.05): { rejected: boolean[]; threshold: number } {
  const m = pvals.length;
  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let kMax = -1;
  for (let r = 0; r < m; r++) if (order[r].p <= ((r + 1) / m) * q) kMax = r;
  const rejected = new Array(m).fill(false);
  for (let r = 0; r <= kMax; r++) rejected[order[r].i] = true;
  return { rejected, threshold: kMax >= 0 ? order[kMax].p : 0 };
}

/** Bonferroni family-wise correction. */
export function bonferroni(pvals: number[], q = 0.05): boolean[] {
  const thr = q / Math.max(1, pvals.length);
  return pvals.map((p) => p <= thr);
}

// ── New this wave ────────────────────────────────────────────────────────────

export interface DwrSummary {
  wins: number; // label === +1  (target/side-favorable barrier first)
  losses: number; // label === -1 (adverse barrier first; incl. same-candle conservative)
  timeouts: number; // label === 0 (neither barrier inside the vertical window)
  nDecided: number; // wins + losses (timeouts excluded from the denominator)
  dwr: number; // wins / nDecided; NaN when nDecided === 0
}

/** Directional Win Rate from ternary triple-barrier labels (+1/-1/0). */
export function dwrFromLabels(labels: number[]): DwrSummary {
  let wins = 0;
  let losses = 0;
  let timeouts = 0;
  for (const l of labels) {
    if (l === 1) wins++;
    else if (l === -1) losses++;
    else if (l === 0) timeouts++;
    // any other value is not a valid ternary label → ignored
  }
  const nDecided = wins + losses;
  return { wins, losses, timeouts, nDecided, dwr: nDecided > 0 ? wins / nDecided : NaN };
}

export type PtNa = 'CONSTANT_SIDE' | 'INSUFFICIENT_N';
export interface PtResult {
  z: number | null;
  p: number | null; // one-sided upper: P(Z > z) = 1 - Φ(z); certifies directional skill
  na: PtNa | null; // set iff the test is undefined for this sample
  pHat: number; // realized correct-direction rate (diagnostic)
  pStar: number; // expected correct rate under independence (diagnostic)
}

/**
 * Pesaran-Timmermann (1992) test of directional/sign predictability.
 * `predicted[i]` and `actual[i]` carry direction in their sign (>0 up, <0 down).
 * Undefined when either series is one-sided (all-up or all-down) → na='CONSTANT_SIDE'
 * (an all-BUY cell can never certify skill), matching the report's PT_NA_CONSTANT_SIDE.
 */
export function pesaranTimmermann(predicted: number[], actual: number[]): PtResult {
  if (predicted.length !== actual.length) {
    throw new Error(`pesaranTimmermann: length mismatch ${predicted.length} vs ${actual.length}`);
  }
  const n = predicted.length;
  if (n < 2) return { z: null, p: null, na: 'INSUFFICIENT_N', pHat: NaN, pStar: NaN };

  let correct = 0;
  let predUp = 0;
  let actUp = 0;
  for (let i = 0; i < n; i++) {
    const x = predicted[i] > 0 ? 1 : 0;
    const y = actual[i] > 0 ? 1 : 0;
    if (x === y) correct++;
    predUp += x;
    actUp += y;
  }
  const pHat = correct / n;
  const px = predUp / n; // P(predicted up)
  const py = actUp / n; // P(actual up)
  const pStar = py * px + (1 - py) * (1 - px);

  // Test is undefined when either series is one-sided: var(P̂) − var(P̂*) → 0.
  if (px === 0 || px === 1 || py === 0 || py === 1) {
    return { z: null, p: null, na: 'CONSTANT_SIDE', pHat, pStar };
  }

  const varPhat = (pStar * (1 - pStar)) / n;
  const varPstar =
    ((2 * py - 1) ** 2 * px * (1 - px)) / n +
    ((2 * px - 1) ** 2 * py * (1 - py)) / n +
    (4 * py * px * (1 - py) * (1 - px)) / (n * n);
  const denom = varPhat - varPstar;
  if (denom <= 0) return { z: null, p: null, na: 'CONSTANT_SIDE', pHat, pStar };

  const z = (pHat - pStar) / Math.sqrt(denom);
  return { z, p: 1 - normalCdf(z), na: null, pHat, pStar };
}
