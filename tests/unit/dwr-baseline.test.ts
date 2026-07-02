import { describe, it, expect } from 'vitest';
import {
  deriveRaceOutcome,
  benchmarks,
  computeCellStats,
  firstPerCoin,
  type LabelRow,
} from '../../src/scripts/dwr-baseline.js';

describe('deriveRaceOutcome', () => {
  it('BUY: +1→upper, -1→lower', () => {
    expect(deriveRaceOutcome('BUY', 1, false)).toBe('upper');
    expect(deriveRaceOutcome('BUY', -1, false)).toBe('lower');
  });
  it('SELL mirror: +1→lower, -1→upper', () => {
    expect(deriveRaceOutcome('SELL', 1, false)).toBe('lower');
    expect(deriveRaceOutcome('SELL', -1, false)).toBe('upper');
  });
  it('timeout and ambiguous take precedence', () => {
    expect(deriveRaceOutcome('BUY', 0, false)).toBe('timeout');
    expect(deriveRaceOutcome('SELL', -1, true)).toBe('ambiguous');
  });
});

describe('benchmarks — computed, not complements', () => {
  it('ambiguous is a loss for BOTH sides → alwaysBuy + alwaysSell < 1', () => {
    const rows: LabelRow[] = [
      { side: 'BUY', label: 1, ambiguous: false, coin: 'BTC', createdAt: 1 }, // upper
      { side: 'BUY', label: 1, ambiguous: false, coin: 'ETH', createdAt: 2 }, // upper
      { side: 'BUY', label: 1, ambiguous: false, coin: 'SOL', createdAt: 3 }, // upper
      { side: 'BUY', label: -1, ambiguous: false, coin: 'XRP', createdAt: 4 }, // lower
      { side: 'BUY', label: -1, ambiguous: true, coin: 'ADA', createdAt: 5 }, // ambiguous
      { side: 'BUY', label: 0, ambiguous: false, coin: 'DOT', createdAt: 6 }, // timeout (excluded)
    ];
    const b = benchmarks(rows);
    expect(b.uppers).toBe(3);
    expect(b.lowers).toBe(1);
    expect(b.ambiguous).toBe(1);
    expect(b.alwaysBuyDwr).toBeCloseTo(3 / 5, 12); // 0.6
    expect(b.alwaysSellDwr).toBeCloseTo(1 / 5, 12); // 0.2
    expect(b.alwaysBuyDwr + b.alwaysSellDwr).toBeLessThan(1); // not complements (ambiguous)
  });
});

describe('computeCellStats', () => {
  it('all-BUY cell: engine DWR == alwaysBUY, edge 0, constant-side (PT undefined)', () => {
    const rows: LabelRow[] = [
      { side: 'BUY', label: 1, ambiguous: false, coin: 'BTC', createdAt: 1 },
      { side: 'BUY', label: 1, ambiguous: false, coin: 'ETH', createdAt: 2 },
      { side: 'BUY', label: 1, ambiguous: false, coin: 'SOL', createdAt: 3 },
      { side: 'BUY', label: -1, ambiguous: false, coin: 'XRP', createdAt: 4 },
      { side: 'BUY', label: -1, ambiguous: true, coin: 'ADA', createdAt: 5 },
      { side: 'BUY', label: 0, ambiguous: false, coin: 'DOT', createdAt: 6 },
    ];
    const s = computeCellStats(rows);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.timeouts).toBe(1);
    expect(s.dwr).toBeCloseTo(0.6, 12);
    expect(s.dwr).toBeCloseTo(s.alwaysBuyDwr, 12); // an all-BUY cell can't beat always-BUY
    expect(s.edge).toBeCloseTo(0, 12);
    expect(s.constantSide).toBe(true);
    expect(s.ptAll.na).toBe('CONSTANT_SIDE');
  });

  it('mixed cell: benchmarks 0.5/0.5, edge 0, PT defined', () => {
    const rows: LabelRow[] = [
      { side: 'BUY', label: 1, ambiguous: false, coin: 'BTC', createdAt: 1 }, // upper, correct
      { side: 'SELL', label: 1, ambiguous: false, coin: 'ETH', createdAt: 2 }, // lower, correct
      { side: 'BUY', label: -1, ambiguous: false, coin: 'SOL', createdAt: 3 }, // lower, wrong
      { side: 'SELL', label: -1, ambiguous: false, coin: 'XRP', createdAt: 4 }, // upper, wrong
    ];
    const s = computeCellStats(rows);
    expect(s.dwr).toBeCloseTo(0.5, 12);
    expect(s.alwaysBuyDwr).toBeCloseTo(0.5, 12);
    expect(s.alwaysSellDwr).toBeCloseTo(0.5, 12);
    expect(s.edge).toBeCloseTo(0, 12);
    expect(s.constantSide).toBe(false);
    expect(s.ptAll.na).toBeNull();
    expect(Math.abs(s.ptAll.z as number)).toBeLessThan(1); // independent → ~0
  });
});

describe('firstPerCoin', () => {
  it('keeps the earliest call per symbol', () => {
    const rows: LabelRow[] = [
      { side: 'BUY', label: 1, ambiguous: false, coin: 'BTC', createdAt: 30 },
      { side: 'SELL', label: -1, ambiguous: false, coin: 'BTC', createdAt: 10 }, // earliest BTC
      { side: 'BUY', label: 1, ambiguous: false, coin: 'ETH', createdAt: 20 },
    ];
    const out = firstPerCoin(rows).sort((a, b) => a.coin.localeCompare(b.coin));
    expect(out).toHaveLength(2);
    expect(out[0].coin).toBe('BTC');
    expect(out[0].createdAt).toBe(10);
    expect(out[1].coin).toBe('ETH');
  });
});
