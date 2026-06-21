/**
 * REFERRAL-PAYOUT-OPS-W1 / C1 — EVM (Base) payout-address validation.
 *
 * USDC payouts are IRREVERSIBLE, so a referrer's Base address is checksum-validated
 * (EIP-55) before it is ever stored or paid to. viem's `getAddress` is the single
 * authority: it rejects bad length / non-hex / failed-checksum input by throwing,
 * and returns the canonical EIP-55 mixed-case form for valid input (accepting an
 * all-lowercase or all-uppercase address as "no checksum intended" and checksumming
 * it). We store ONLY the checksummed form so the C3 send path and the /account
 * display agree byte-for-byte. Base uses the standard 20-byte EVM address space —
 * no chain-specific address format — so a plain EIP-55 check is correct.
 */
import { getAddress } from 'viem';

/**
 * Validate + normalize a user-supplied EVM address to its EIP-55 checksummed form.
 * Returns the checksummed `0x…` (40 hex) string, or `null` for ANYTHING invalid
 * (wrong type, wrong length, non-hex, or a mixed-case address that fails its own
 * checksum). Callers default-deny on `null` — never store/pay an unvalidated value.
 */
export function normalizePayoutAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  // Shape gate: exactly 0x + 40 hex. (viem's getAddress uses strict:false internally
  // — it would re-checksum ANY well-formed hex without rejecting a bad checksum — so
  // the typo guard below, NOT getAddress, is what makes a mistyped address fail.)
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return null;
  let checksummed: string;
  try {
    checksummed = getAddress(s);
  } catch {
    return null;
  }
  const hex = s.slice(2);
  const noChecksumIntended = hex === hex.toLowerCase() || hex === hex.toUpperCase();
  // Mixed-case input IS an EIP-55 checksum and must match exactly — a single mistyped
  // nibble flips the case map, so this catches paste/transcription typos. All-lowercase
  // or all-uppercase carries no checksum claim, so we accept + normalize it.
  if (!noChecksumIntended && s !== checksummed) return null;
  return checksummed;
}

/** "0x1234…abcd" — short display form for an already-validated checksummed address. */
export function shortenAddress(address: string): string {
  return address.length >= 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
