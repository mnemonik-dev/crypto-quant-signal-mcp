/**
 * rate-limit-events.ts — OPS-RATELIMIT-TELEMETRY-DIGEST-W1 R2
 *
 * Thin, CYCLE-SAFE entry point for the fail-open rate-limit recorder. The transport
 * modules (`_upstream-fetch.ts`, `upstream-weight-budget.ts`) import THIS — never
 * `performance-db.ts` directly — because a static transport→performance-db import
 * closes a module-init cycle:
 *   performance-db → asset-tiers → exchange-universe → _upstream-fetch
 *                  → venue-budget-registry → upstream-weight-budget → (back here)
 * The lazy `import()` resolves the (already-loaded) performance-db module at CALL
 * time, after the init order is settled — the same trick `recordSignal` uses for its
 * webhook hook. This module has ZERO static imports, so it can never be in a cycle.
 *
 * Fire-and-forget + fail-open: returns void synchronously; the DB write happens in a
 * microtask whose rejection is swallowed (impl also has its own try/catch). NEVER
 * delays or breaks the caller's fetch/acquire path.
 */
export type RateLimitKind = 'throw' | 'wait' | 'skip';
export type RateLimitClass = 'interactive' | 'batch';

export function recordRateLimitEvent(
  venue: string,
  kind: RateLimitKind,
  code: string | null,
  cls: RateLimitClass,
  waitMs?: number | null,
  caller: string = 'unknown',
): void {
  // Offline under vitest by default so a throw/skip/wait in a budget/adapter test
  // never spins up the SQLite backend. `RATE_LIMIT_EVENTS_TEST=1` re-enables the real
  // path for the fail-open recorder test (R4).
  if (process.env.VITEST && process.env.RATE_LIMIT_EVENTS_TEST !== '1') return;
  void import('./performance-db.js')
    .then((m) => m.recordRateLimitEventImpl(venue, kind, code, cls, waitMs ?? null, caller))
    .catch((e) => console.warn(`[rate-limit-events] record failed (fail-open): ${e instanceof Error ? e.message : e}`));
}
