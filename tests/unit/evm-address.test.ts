/**
 * REFERRAL-PAYOUT-OPS-W1 / C1 — payout-address validation invariants.
 * Sends are irreversible, so the validator MUST reject anything but a real EIP-55
 * address and MUST normalize to the canonical checksummed form (so the C3 send path
 * and the /account display agree). The expected checksum is derived from viem's
 * getAddress (not hardcoded) so the test can't drift from the implementation.
 */
import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { normalizePayoutAddress, shortenAddress } from '../../src/lib/evm-address.js';

const LOWER = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
const CHECKSUMMED = getAddress(LOWER); // canonical EIP-55 mixed-case form

describe('normalizePayoutAddress', () => {
  it('accepts a lowercase address → returns the EIP-55 checksummed form', () => {
    expect(normalizePayoutAddress(LOWER)).toBe(CHECKSUMMED);
  });
  it('accepts an already-checksummed address unchanged (idempotent)', () => {
    expect(normalizePayoutAddress(CHECKSUMMED)).toBe(CHECKSUMMED);
    expect(normalizePayoutAddress(normalizePayoutAddress(LOWER)!)).toBe(CHECKSUMMED);
  });
  it('trims surrounding whitespace', () => {
    expect(normalizePayoutAddress(`  ${CHECKSUMMED}  `)).toBe(CHECKSUMMED);
  });
  it('rejects a mixed-case address that fails its own checksum', () => {
    // Flip the case of the first alpha hex char → breaks the EIP-55 checksum.
    const i = [...CHECKSUMMED].findIndex((c, idx) => idx > 1 && /[a-fA-F]/.test(c));
    const ch = CHECKSUMMED[i];
    const flipped = CHECKSUMMED.slice(0, i)
      + (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())
      + CHECKSUMMED.slice(i + 1);
    expect(flipped).not.toBe(CHECKSUMMED);
    expect(normalizePayoutAddress(flipped)).toBeNull();
  });
  it('rejects wrong length / non-hex / missing 0x / empty', () => {
    expect(normalizePayoutAddress('0x1234')).toBeNull();
    expect(normalizePayoutAddress(LOWER.slice(0, -1))).toBeNull(); // 39 hex
    expect(normalizePayoutAddress(LOWER + 'ab')).toBeNull();       // 42 hex
    expect(normalizePayoutAddress('0x' + 'Z'.repeat(40))).toBeNull();
    expect(normalizePayoutAddress(LOWER.replace('0x', ''))).toBeNull(); // no 0x prefix
    expect(normalizePayoutAddress('')).toBeNull();
  });
  it('rejects non-string input', () => {
    expect(normalizePayoutAddress(null)).toBeNull();
    expect(normalizePayoutAddress(undefined)).toBeNull();
    expect(normalizePayoutAddress(123)).toBeNull();
    expect(normalizePayoutAddress({})).toBeNull();
  });
});

describe('shortenAddress', () => {
  it('renders 0x1234…cdef', () => {
    expect(shortenAddress(CHECKSUMMED)).toBe(`${CHECKSUMMED.slice(0, 6)}…${CHECKSUMMED.slice(-4)}`);
  });
});
