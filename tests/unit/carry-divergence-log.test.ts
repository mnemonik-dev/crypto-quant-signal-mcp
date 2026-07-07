import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/performance-db.js', () => ({ dbQuery: vi.fn() }));

import { writeDivergenceLog, _resetDivergenceLogStateForTest, _divergenceLogStateForTest } from '../../src/lib/carry-divergence-log.js';
import { dbQuery } from '../../src/lib/performance-db.js';

const row = () => ({
  venueScope: 'HL',
  n: 10,
  nScored: 9,
  tau: 0.0667,
  top5Overlap: '2/5',
  applied: false,
  payload: { n: 10, n_scored: 9, venue_scope: 'HL', applied: false },
});

describe('carry-divergence-log durable write (EDGE-CARRY-SERVING-W2, fail-open)', () => {
  beforeEach(() => {
    _resetDivergenceLogStateForTest();
    vi.mocked(dbQuery).mockReset();
  });

  it('success ⇒ one parameterized INSERT into carry_divergence_log; no warn', async () => {
    vi.mocked(dbQuery).mockResolvedValue([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await writeDivergenceLog(row());
    warn.mockRestore();
    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(dbQuery).mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO carry_divergence_log/);
    expect((params as unknown[])[0]).toBe('HL');   // venue_scope
    expect((params as unknown[])[1]).toBe(10);      // n
    expect(JSON.parse(String((params as unknown[])[6])).dropped_count).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(_divergenceLogStateForTest()).toEqual({ droppedCount: 0, warned: false });
  });

  it('write failure ⇒ swallowed (never throws), droppedCount++, warn ONCE per process', async () => {
    vi.mocked(dbQuery).mockRejectedValue(new Error('pg down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(writeDivergenceLog(row())).resolves.toBeUndefined(); // fire-and-forget: no throw
    await writeDivergenceLog(row());                                  // second failure
    expect(warn).toHaveBeenCalledTimes(1); // ONCE per process, not per scan (assert before restore)
    expect(_divergenceLogStateForTest()).toEqual({ droppedCount: 2, warned: true });
    warn.mockRestore();
  });

  it('monotonic dropped_count is carried into the NEXT successful row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(dbQuery).mockRejectedValueOnce(new Error('blip')).mockResolvedValue([]);
    await writeDivergenceLog(row()); // fails → dropped=1
    await writeDivergenceLog(row()); // succeeds → carries dropped_count=1
    warn.mockRestore();
    const successParams = vi.mocked(dbQuery).mock.calls[1][1] as unknown[];
    expect(JSON.parse(String(successParams[6])).dropped_count).toBe(1);
    expect(_divergenceLogStateForTest().droppedCount).toBe(1); // monotonic — not reset by success
  });
});
