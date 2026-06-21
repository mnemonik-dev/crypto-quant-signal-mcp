/**
 * REFERRAL-PAYOUT-OPS-W1 / C3 — CdpPayoutSender pre-send guard rails. These checks
 * (address re-validation, amount sanity, per-tx cap) run BEFORE any CdpClient call,
 * so they're unit-testable without CDP creds. The actual on-chain send is verified
 * by a gated live smoke (a small test send to a Mr.1-controlled address).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CdpPayoutSender } from '../../src/lib/cdp-payout.js';

const VALID = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const savedCap = process.env.PAYOUT_MAX_PER_TX_USD;
beforeEach(() => { delete process.env.PAYOUT_MAX_PER_TX_USD; }); // default $500 = 50000 e2
afterEach(() => { if (savedCap === undefined) delete process.env.PAYOUT_MAX_PER_TX_USD; else process.env.PAYOUT_MAX_PER_TX_USD = savedCap; });

describe('CdpPayoutSender guard rails (fail before the irreversible send)', () => {
  const sender = new CdpPayoutSender();
  it('kind is "cdp"', () => {
    expect(sender.kind).toBe('cdp');
  });
  it('rejects an invalid / typo address', async () => {
    await expect(sender.send('0xnope', 6000)).rejects.toThrow('invalid_payout_address');
  });
  it('rejects a non-positive or NaN amount', async () => {
    await expect(sender.send(VALID, 0)).rejects.toThrow('invalid_amount');
    await expect(sender.send(VALID, -100)).rejects.toThrow('invalid_amount');
    await expect(sender.send(VALID, Number.NaN)).rejects.toThrow('invalid_amount');
  });
  it('rejects an amount over the per-tx cap (default $500 = 50000 e2)', async () => {
    await expect(sender.send(VALID, 50001)).rejects.toThrow('per_tx_cap_exceeded');
  });
});
