/**
 * REFERRAL-PAYOUT-OPS-W1 / C3 — payout caps + CDP cred gate. Caps default-deny on
 * invalid env (never widen on a bad value); cdpPayoutConfigured requires all THREE
 * creds (the signing CDP_WALLET_SECRET is the gate that keeps the Stub in place).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { perTxCapE2, batchCapE2, cdpPayoutConfigured } from '../../src/lib/payout-config.js';

const KEYS = ['PAYOUT_MAX_PER_TX_USD', 'PAYOUT_MAX_BATCH_USD', 'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('payout caps (default-deny)', () => {
  it('defaults to $500/tx and $2000/batch (e2 cents)', () => {
    expect(perTxCapE2()).toBe(50000);
    expect(batchCapE2()).toBe(200000);
  });
  it('honors integer + decimal env overrides', () => {
    process.env.PAYOUT_MAX_PER_TX_USD = '100';
    process.env.PAYOUT_MAX_BATCH_USD = '12.50';
    expect(perTxCapE2()).toBe(10000);
    expect(batchCapE2()).toBe(1250);
  });
  it('default-denies invalid env (0x / scientific / negative / NaN / empty) → fallback', () => {
    for (const bad of ['0x1', '1e3', '-5', 'abc', '', '   ', '50abc']) {
      process.env.PAYOUT_MAX_PER_TX_USD = bad;
      expect(perTxCapE2()).toBe(50000); // never widens on a bad value
    }
  });
});

describe('cdpPayoutConfigured', () => {
  it('true only when ALL three CDP creds are present', () => {
    process.env.CDP_API_KEY_ID = 'id';
    process.env.CDP_API_KEY_SECRET = 'sec';
    expect(cdpPayoutConfigured()).toBe(false); // missing the signing wallet secret
    process.env.CDP_WALLET_SECRET = 'wsec';
    expect(cdpPayoutConfigured()).toBe(true);
  });
  it('false when any single cred is missing', () => {
    process.env.CDP_API_KEY_SECRET = 'sec';
    process.env.CDP_WALLET_SECRET = 'wsec';
    expect(cdpPayoutConfigured()).toBe(false); // missing CDP_API_KEY_ID
  });
});
