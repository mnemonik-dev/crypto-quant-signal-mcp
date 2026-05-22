/**
 * tests/seed-signals-parse-args.test.ts — OPS-3M-EXPAND-W2-PART-A regression
 * suite for the new `--exchange-list` CLI flag in `src/scripts/seed-signals.ts`.
 *
 * Coverage (≥5 cases):
 *   1. `--exchange-list BINANCE,BYBIT` parses to `['BINANCE', 'BYBIT']`.
 *   2. `--exchange-list HL,BINANCE,FOO` errors with `Invalid exchange in
 *      --exchange-list: FOO` + `process.exit(1)`.
 *   3. `--exchange BINANCE --exchange-list HL,BYBIT` errors with mutual-
 *      exclusion message + `process.exit(1)`.
 *   4. `--exchange-list ALL` errors (ALL is --exchange shorthand only, not
 *      a valid ExchangeId).
 *   5. `--exchange-list ASTER,EDGEX` parses fine (shadow venues are valid
 *      ExchangeId entries; gate handles them at per-venue level via
 *      SHADOW_VENUE_PERMISSIVE_PASS).
 *
 * Bonus:
 *   6. Backward-compat: `--exchange BINANCE` (existing flag) still parses
 *      to `['BINANCE']` unchanged.
 *   7. Whitespace tolerance: `--exchange-list  BINANCE , BYBIT ` (spaces)
 *      parses to `['BINANCE', 'BYBIT']`.
 *   8. Empty `--exchange-list` value errors gracefully.
 *
 * Audit reference: audits/OPS-3M-EXPAND-W2-endpoint-truth.md
 * (Path D approved; this wave's revised R2-R4 scope).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseArgs, ALL_EXCHANGE_IDS } from '../src/scripts/seed-signals.js';

describe('seed-signals parseArgs — --exchange-list flag (OPS-3M-EXPAND-W2-PART-A)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Intercept process.exit so an error path doesn't kill the test runner.
    // Throw a tagged Error instead, which the test catches + asserts on.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__process_exit__:${code ?? 0}`);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('case 1 — --exchange-list BINANCE,BYBIT parses to ["BINANCE", "BYBIT"]', () => {
    const result = parseArgs(['--exchange-list', 'BINANCE,BYBIT', '--timeframe', '3m']);
    expect(result.exchanges).toEqual(['BINANCE', 'BYBIT']);
    expect(result.timeframe).toBe('3m');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('case 2 — --exchange-list HL,BINANCE,FOO errors with invalid-id + exit(1)', () => {
    expect(() =>
      parseArgs(['--exchange-list', 'HL,BINANCE,FOO', '--timeframe', '3m']),
    ).toThrow(/__process_exit__:1/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid exchange in --exchange-list: FOO'),
    );
  });

  it('case 3 — --exchange BINANCE --exchange-list HL,BYBIT errors with mutual-exclusion + exit(1)', () => {
    expect(() =>
      parseArgs(['--exchange', 'BINANCE', '--exchange-list', 'HL,BYBIT', '--timeframe', '3m']),
    ).toThrow(/__process_exit__:1/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--exchange and --exchange-list are mutually exclusive'),
    );
  });

  it('case 4 — --exchange-list ALL errors (ALL is --exchange shorthand only)', () => {
    expect(() =>
      parseArgs(['--exchange-list', 'ALL', '--timeframe', '3m']),
    ).toThrow(/__process_exit__:1/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid exchange in --exchange-list: ALL'),
    );
  });

  it('case 5 — --exchange-list ASTER,EDGEX parses fine (shadow venues accepted)', () => {
    const result = parseArgs(['--exchange-list', 'ASTER,EDGEX', '--timeframe', '3m']);
    expect(result.exchanges).toEqual(['ASTER', 'EDGEX']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('case 6 — backward-compat: --exchange BINANCE still parses to ["BINANCE"]', () => {
    const result = parseArgs(['--exchange', 'BINANCE', '--timeframe', '3m']);
    expect(result.exchanges).toEqual(['BINANCE']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('case 7 — whitespace tolerance: "  BINANCE , BYBIT  " trims to ["BINANCE", "BYBIT"]', () => {
    const result = parseArgs(['--exchange-list', '  BINANCE , BYBIT  ', '--timeframe', '3m']);
    expect(result.exchanges).toEqual(['BINANCE', 'BYBIT']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('case 8 — empty --exchange-list value errors (e.g. "BINANCE,,BYBIT")', () => {
    expect(() =>
      parseArgs(['--exchange-list', 'BINANCE,,BYBIT', '--timeframe', '3m']),
    ).toThrow(/__process_exit__:1/);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid --exchange-list value'),
    );
  });

  it('case 9 — ALL_EXCHANGE_IDS const exports 17 values', () => {
    // Sanity-pin the canonical set; future ExchangeId widening MUST update both
    // the type union (src/types.ts) AND this const + this test count.
    expect(ALL_EXCHANGE_IDS).toHaveLength(17);
    expect(ALL_EXCHANGE_IDS).toContain('HL');
    expect(ALL_EXCHANGE_IDS).toContain('BINANCE');
    expect(ALL_EXCHANGE_IDS).toContain('ASTER');
    expect(ALL_EXCHANGE_IDS).toContain('WHITEBIT');
  });

  it('case 10 — backward-compat: no --exchange or --exchange-list defaults to 5 PROMOTED venues', () => {
    const result = parseArgs(['--timeframe', '3m']);
    expect(result.exchanges).toEqual(['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET']);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
