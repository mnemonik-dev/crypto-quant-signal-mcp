/** Unit tests — EQUITY-LAUNCH-READINESS-W1 R1 miss instrumentation. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSymbolMiss, _resetMissBoundForTest } from '../../src/lib/equities/equity-misses.js';
import type { Pool } from 'pg';

const poolWith = (q: ReturnType<typeof vi.fn>) => ({ query: q }) as unknown as Pool;

describe('recordSymbolMiss', () => {
  // OPS-AUDIT-REMEDIATION-MED-W1: reset the per-symbol cooldown / window-cap state
  // between cases (several reuse the symbol 'AAPL', which the new bound would skip).
  beforeEach(() => _resetMissBoundForTest());

  it('inserts the normalized symbol; raw_input null when input matches', async () => {
    const q = vi.fn(async () => ({ rowCount: 1 }));
    await recordSymbolMiss(poolWith(q), 'AAPL', 'aapl');
    expect(q).toHaveBeenCalledTimes(1);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO equity_symbol_misses/);
    expect(params).toEqual(['AAPL', null]); // 'aapl'.toUpperCase() === 'AAPL'
  });

  it('preserves raw_input when it differs from the normalized symbol', async () => {
    const q = vi.fn(async () => ({ rowCount: 1 }));
    await recordSymbolMiss(poolWith(q), 'BRK.B', 'brk-b');
    const [, params] = q.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('BRK.B');
    expect(params[1]).toBe('brk-b'); // BRK-B != BRK.B
  });

  it('falls back to a sanitized raw when normalized is empty', async () => {
    const q = vi.fn(async () => ({ rowCount: 1 }));
    await recordSymbolMiss(poolWith(q), '', 'aa$pl');
    const [, params] = q.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('AAPL'); // stripped to A-Z0-9.- → AAPL
  });

  it('NEVER throws when the DB write fails (fail-open — tool response stays clean)', async () => {
    const q = vi.fn(async () => { throw new Error('DB down'); });
    await expect(recordSymbolMiss(poolWith(q), 'AAPL', 'AAPL')).resolves.toBeUndefined();
  });
});
