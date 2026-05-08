/**
 * Unit tests for the leaderboard-cell trim helper.
 *
 * Asserts the trim:
 *   - keeps `coin`, `timeframe`, `confidence`, `exchange`
 *     (exchange re-added 2026-05-08 / BOT-ALERT-IMAGE-W1 so the bot's
 *     "See Also" surface can suggest same-TF + SAME-EXCHANGE trades —
 *     users want to act on the same venue they already trade on)
 *   - strips `signal` (BUY/SELL/HOLD direction) — preserves the
 *     actionability seam that drives a follow-up get_trade_call
 *   - strips `regime` (TRENDING_UP/TRENDING_DOWN/RANGING/VOLATILE)
 *
 * The trim is the leak-prevention surface for `also_see` /
 * `closest_tradeable`: agents see "go look here" pointers but must issue
 * another get_trade_call to get direction.
 */
import { describe, it, expect } from 'vitest';
import { trimToLeaderboardCell } from '../../src/lib/leaderboard-cell.js';
import type { GridCell } from '../../src/types.js';

describe('trimToLeaderboardCell', () => {
  it('keeps {coin, timeframe, confidence, exchange} only', () => {
    const cell: GridCell = {
      coin: 'ETH',
      timeframe: '1h',
      signal: 'BUY',
      confidence: 80,
      exchange: 'HL',
      regime: 'TRENDING_UP',
    };
    const out = trimToLeaderboardCell(cell);
    expect(out).toEqual({ coin: 'ETH', timeframe: '1h', confidence: 80, exchange: 'HL' });
  });

  it('output has exactly 4 keys', () => {
    const cell: GridCell = { coin: 'BTC', timeframe: '4h', signal: 'SELL', confidence: 75, exchange: 'BINANCE', regime: 'TRENDING_DOWN' };
    const keys = Object.keys(trimToLeaderboardCell(cell));
    expect(keys).toHaveLength(4);
    expect(keys.sort()).toEqual(['coin', 'confidence', 'exchange', 'timeframe']);
  });

  it('output does NOT include signal', () => {
    const cell: GridCell = { coin: 'SOL', timeframe: '15m', signal: 'BUY', confidence: 60, exchange: 'BYBIT', regime: 'TRENDING_UP' };
    const out = trimToLeaderboardCell(cell);
    expect((out as unknown as { signal?: unknown }).signal).toBeUndefined();
  });

  it('output INCLUDES exchange (BOT-ALERT-IMAGE-W1)', () => {
    const cell: GridCell = { coin: 'DOGE', timeframe: '5m', signal: 'BUY', confidence: 65, exchange: 'OKX', regime: 'TRENDING_UP' };
    const out = trimToLeaderboardCell(cell);
    expect(out.exchange).toBe('OKX');
  });

  it('output does NOT include regime', () => {
    const cell: GridCell = { coin: 'XRP', timeframe: '4h', signal: 'BUY', confidence: 60, exchange: 'BITGET', regime: 'RANGING' };
    const out = trimToLeaderboardCell(cell);
    expect((out as unknown as { regime?: unknown }).regime).toBeUndefined();
  });

  it('preserves confidence as-is (no rounding)', () => {
    const cell: GridCell = { coin: 'BNB', timeframe: '1d', signal: 'SELL', confidence: 73.5 as unknown as number, exchange: 'HL', regime: 'TRENDING_DOWN' };
    expect(trimToLeaderboardCell(cell).confidence).toBe(73.5);
  });

  it('preserves exchange across all 5 supported venues', () => {
    for (const ex of ['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET'] as const) {
      const cell: GridCell = { coin: 'BTC', timeframe: '1h', signal: 'BUY', confidence: 70, exchange: ex, regime: 'TRENDING_UP' };
      expect(trimToLeaderboardCell(cell).exchange).toBe(ex);
    }
  });

  it('returns a NEW object (does not mutate input)', () => {
    const cell: GridCell = { coin: 'ETH', timeframe: '1h', signal: 'BUY', confidence: 80, exchange: 'HL', regime: 'TRENDING_UP' };
    const out = trimToLeaderboardCell(cell);
    expect(out).not.toBe(cell);
    expect(cell.signal).toBe('BUY'); // input unchanged
    expect(cell.exchange).toBe('HL');
    expect(cell.regime).toBe('TRENDING_UP');
  });
});
