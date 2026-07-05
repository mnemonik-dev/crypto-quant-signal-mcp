/**
 * EDGE-CARRY-RANKER-W1 CH2 — permanent nightly label-freshness cadence (in-container, cron 02:23 UTC).
 *
 * Sequences the three label streams; each step reuses the SHIPPED script verbatim as a child process
 * (identical to manual invocation; isolated memory/crash):
 *   1. raw-incremental       backfill-funding-episodes.js raw --since-checkpoint
 *   2. episodes-close        backfill-funding-episodes.js episodes --reclose-censored
 *   3. directional-labels    backfill-directional-labels.js        (DB-state resume)
 *
 * Silent-recovery contract (CLAUDE.md): failures LOG ONLY (no TG), non-zero exit, cron retries next
 * night. Steps 2–3 depend on step 1's data, so the run aborts at the first failure. Every step emits a
 * success-path log line (load-bearing-logging rule).
 *
 * Pass-through for bounded gate fires: --check (all steps), --venue=X (all steps; step 3 space-style),
 * --limit=N (steps 1–2), --limit-groups=N (step 3).
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

export interface Step { name: string; args: string[] }

export interface SpawnResult { status: number | null; error?: Error }
export type Spawner = (cmd: string, args: string[], opts: { stdio: 'inherit' }) => SpawnResult;

const dist = (f: string): string => path.resolve(__dirname, f);

export function buildSteps(argv: string[]): Step[] {
  const check = argv.includes('--check');
  const venue = argv.find((a) => a.startsWith('--venue='))?.split('=')[1];
  const limit = argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limitGroups = argv.find((a) => a.startsWith('--limit-groups='))?.split('=')[1];

  const fundingFlags = [
    ...(venue ? [`--venue=${venue}`] : []),
    ...(limit ? [`--limit=${limit}`] : []),
    ...(check ? ['--check'] : []),
  ];
  // backfill-directional-labels.ts parses space-separated flag values.
  const labelFlags = [
    ...(venue ? ['--venue', venue] : []),
    ...(limitGroups ? ['--limit-groups', limitGroups] : []),
    ...(check ? ['--check'] : []),
  ];

  return [
    { name: 'raw-incremental', args: [dist('backfill-funding-episodes.js'), 'raw', '--since-checkpoint', ...fundingFlags] },
    { name: 'episodes-close', args: [dist('backfill-funding-episodes.js'), 'episodes', '--reclose-censored', ...fundingFlags] },
    { name: 'directional-labels', args: [dist('backfill-directional-labels.js'), ...labelFlags] },
  ];
}

export function runSteps(argv: string[], spawn: Spawner = spawnSync as unknown as Spawner): number {
  const t0 = Date.now();
  for (const step of buildSteps(argv)) {
    const s = Date.now();
    console.log(`[nightly-carry-labeler] STEP ${step.name} START`);
    const res = spawn(process.execPath, step.args, { stdio: 'inherit' });
    if (res.error || res.status !== 0) {
      console.error(
        `[nightly-carry-labeler] STEP ${step.name} FAILED (exit ${res.status ?? 'spawn-error'}${res.error ? `: ${res.error.message}` : ''}) — aborting run; cron retries next night`,
      );
      return 1;
    }
    console.log(`[nightly-carry-labeler] STEP ${step.name} OK (${Math.round((Date.now() - s) / 1000)}s)`);
  }
  console.log(`[nightly-carry-labeler] ALL 3 LABEL STREAMS OK (${Math.round((Date.now() - t0) / 1000)}s)`);
  return 0;
}

if (require.main === module) {
  process.exit(runSteps(process.argv.slice(2)));
}
