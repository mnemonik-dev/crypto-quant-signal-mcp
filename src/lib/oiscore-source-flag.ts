/**
 * oiscore-source-flag.ts — SCAN-RANKBY-REFINEMENTS-W1 CH4
 *
 * The `OISCORE_SOURCE` firewall for the verdict's internal oiScore. Default 'price' =
 * the current live behaviour (priceChange-derived oiScore) → call/confidence
 * BYTE-IDENTICAL. CH4 only INSTRUMENTS the real-OI re-base (shadow); the FLIP wave
 * (SCAN-OISCORE-FLIP-W1) sets OISCORE_SOURCE='oi' ONCE matured-outcome WR non-regression
 * is proven, and flips back instantly by unsetting the env.
 *
 * DEFAULT-DENY: only the exact value 'oi' enables the OI source; anything else (unset,
 * typo, empty) resolves to 'price' (the safe, byte-identical default).
 */
export type OiScoreSource = 'price' | 'oi';

export function getOiScoreSource(): OiScoreSource {
  return process.env.OISCORE_SOURCE === 'oi' ? 'oi' : 'price';
}
