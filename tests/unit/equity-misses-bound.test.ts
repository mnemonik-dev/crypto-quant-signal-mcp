/**
 * OPS-AUDIT-REMEDIATION-MED-W1 — miss-DoS (EQ-02): bound the
 * equity_symbol_misses write so symbol-spam can't bloat the table, while the
 * record path NEVER throws into the tool response (fail-open).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordSymbolMiss, _resetMissBoundForTest } from '../../src/lib/equities/equity-misses.js';
import type { Pool } from 'pg';

function fakePool(impl?: () => Promise<unknown>): Pool {
  return { query: vi.fn(impl ?? (() => Promise.resolve({ rowCount: 1 }))) } as unknown as Pool;
}

describe('miss-DoS — bounded equity_symbol_misses write', () => {
  beforeEach(() => _resetMissBoundForTest());

  it('per-symbol cooldown: the same symbol inserts once; an immediate repeat is skipped', async () => {
    const pool = fakePool();
    await recordSymbolMiss(pool, 'FAKE1', 'FAKE1');
    await recordSymbolMiss(pool, 'FAKE1', 'FAKE1'); // within cooldown → skipped
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('global window cap: distinct-symbol spam is capped at WINDOW_CAP (100) inserts', async () => {
    const pool = fakePool();
    for (let i = 0; i < 250; i++) await recordSymbolMiss(pool, `BOGUS${i}`, `BOGUS${i}`);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(100);
  });

  it('never throws into the caller even when the DB write rejects (fail-open)', async () => {
    const pool = fakePool(() => Promise.reject(new Error('db down')));
    await expect(recordSymbolMiss(pool, 'X', 'X')).resolves.toBeUndefined();
  });

  it('distinct symbols within the window each insert (until the cap)', async () => {
    const pool = fakePool();
    await recordSymbolMiss(pool, 'AAA', 'AAA');
    await recordSymbolMiss(pool, 'BBB', 'BBB');
    await recordSymbolMiss(pool, 'CCC', 'CCC');
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
  });
});
