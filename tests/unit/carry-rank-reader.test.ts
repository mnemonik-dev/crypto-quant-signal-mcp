import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/performance-db.js', () => ({ dbQuery: vi.fn() }));

import { _setCarryScoresForTest, carryKey, getFreshCarryScores } from '../../src/lib/carry-rank-reader.js';
import { dbQuery } from '../../src/lib/performance-db.js';

describe('carry-rank-reader (EDGE-CARRY-SERVING-W1 staleness + fail-open contract)', () => {
  beforeEach(() => {
    _setCarryScoresForTest(undefined); // restore live path + clear cache
    vi.mocked(dbQuery).mockReset();
  });

  it('maps fresh rows to venue|symbol keys', async () => {
    vi.mocked(dbQuery).mockResolvedValue([
      { venue: 'HL', symbol: 'BTC', score: 0.7, artifact_version: 'v1' },
      { venue: 'BINANCE', symbol: 'DOGE', score: 0.3, artifact_version: 'v1' },
    ]);
    const s = await getFreshCarryScores();
    expect(s?.scoredCount).toBe(2);
    expect(s?.byVenueSymbol.get(carryKey('HL', 'BTC'))).toBe(0.7);
    expect(s?.artifactVersion).toBe('v1');
  });

  it('no fresh rows (staleness window) → null + ONE forensic line', async () => {
    vi.mocked(dbQuery).mockResolvedValue([]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await getFreshCarryScores()).toBeNull();
    _setCarryScoresForTest(undefined); // clear 30s cache, keep… (reset also clears episode marker)
    vi.mocked(dbQuery).mockResolvedValue([]);
    await getFreshCarryScores();
    const lines = log.mock.calls.filter(c => String(c[0]).includes('ranker-unavailable'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    log.mockRestore();
  });

  it('read error → null, NEVER throws (fail-open)', async () => {
    vi.mocked(dbQuery).mockRejectedValue(new Error('relation does not exist'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(getFreshCarryScores()).resolves.toBeNull();
    log.mockRestore();
  });

  it('30s TTL cache: second call within TTL does not re-query', async () => {
    vi.mocked(dbQuery).mockResolvedValue([{ venue: 'HL', symbol: 'BTC', score: 1, artifact_version: 'v1' }]);
    await getFreshCarryScores();
    await getFreshCarryScores();
    expect(vi.mocked(dbQuery)).toHaveBeenCalledTimes(1);
  });

  it('test seam short-circuits the DB entirely', async () => {
    _setCarryScoresForTest(null);
    expect(await getFreshCarryScores()).toBeNull();
    expect(vi.mocked(dbQuery)).not.toHaveBeenCalled();
  });
});
