import { describe, expect, it } from 'vitest';
import { buildSteps, runSteps, type SpawnResult, type Step } from '../../src/scripts/nightly-carry-labeler.js';

const names = (steps: Step[]): string[] => steps.map((s) => s.name);

describe('buildSteps', () => {
  it('sequences the three label streams in dependency order', () => {
    const steps = buildSteps([]);
    expect(names(steps)).toEqual(['raw-incremental', 'episodes-close', 'directional-labels']);
    expect(steps[0].args.join(' ')).toContain('backfill-funding-episodes.js raw --since-checkpoint');
    expect(steps[1].args.join(' ')).toContain('backfill-funding-episodes.js episodes --reclose-censored');
    expect(steps[2].args.join(' ')).toContain('backfill-directional-labels.js');
  });

  it('forwards --check to every step (idempotency proof mode)', () => {
    for (const step of buildSteps(['--check'])) expect(step.args).toContain('--check');
  });

  it('maps bounded-fire flags per script convention (= style vs space style)', () => {
    const steps = buildSteps(['--venue=BINANCE', '--limit=3', '--limit-groups=5']);
    expect(steps[0].args).toContain('--venue=BINANCE');
    expect(steps[0].args).toContain('--limit=3');
    expect(steps[1].args).toContain('--venue=BINANCE');
    const label = steps[2].args;
    expect(label.slice(label.indexOf('--venue'), label.indexOf('--venue') + 2)).toEqual(['--venue', 'BINANCE']);
    expect(label.slice(label.indexOf('--limit-groups'), label.indexOf('--limit-groups') + 2)).toEqual(['--limit-groups', '5']);
    expect(label).not.toContain('--limit=3');
  });
});

describe('runSteps', () => {
  it('runs all steps sequentially and returns 0 when green', () => {
    const calls: string[][] = [];
    const spawn = (_cmd: string, args: string[]): SpawnResult => { calls.push(args); return { status: 0 }; };
    expect(runSteps([], spawn)).toBe(0);
    expect(calls).toHaveLength(3);
  });

  it('aborts at the first failing step with non-zero exit (silent recovery — cron retries next night)', () => {
    const calls: string[][] = [];
    const spawn = (_cmd: string, args: string[]): SpawnResult => { calls.push(args); return { status: 1 }; };
    expect(runSteps([], spawn)).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('treats a spawn error like a failure', () => {
    const spawn = (): SpawnResult => ({ status: null, error: new Error('ENOENT') });
    expect(runSteps([], spawn)).toBe(1);
  });
});
