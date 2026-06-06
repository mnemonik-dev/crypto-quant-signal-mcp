/**
 * runtime.ts — OPS-HL-CACHE-STAMPEDE-GENERATOR-W1 C3
 *
 * Tiny, DEPENDENCY-FREE process-identity predicate, shared by every module that
 * needs the process-boundary gate (performance-db pool sizing, the cross-asset-grid
 * warmer, the HL caches). Extracted out of performance-db.ts so consumers like
 * `asset-tiers.ts` can import it WITHOUT a module-init cycle (performance-db imports
 * asset-tiers). performance-db re-exports it for back-compat (cross-asset-grid imports
 * `isShortLivedScript` from performance-db). Pure (argv passed in) → unit-testable.
 * Codified by the `module-level-warmer-process-boundary-gate` skill.
 */

/** True when running from a short-lived script (`dist/scripts/*` — a cron / CLI /
 *  one-shot), NOT the long-lived server (`dist/index.js`). */
export function isShortLivedScript(scriptPath: string | undefined): boolean {
  return /[\\/]scripts[\\/]/.test(scriptPath ?? '');
}
