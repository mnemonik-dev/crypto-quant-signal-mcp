/**
 * REFERRAL-PAYOUT-OPS-W1 / C3 — payout config + cred gate (NO heavy imports).
 *
 * Kept separate from cdp-payout.ts (which imports @coinbase/cdp-sdk) so the factory,
 * the admin route, and the cron can read the caps + the configured-flag WITHOUT
 * loading the CDP SDK on the Stub / detection paths.
 *
 * Caps are the SECONDARY risk bound — the PRIMARY bound is the funded-wallet balance
 * (keep ~one month's batch in the CDP wallet). Both are env-tunable; defaults are
 * the Mr.1-ratified $500/tx + $2000/batch. Default-deny on NaN/invalid (never widen
 * a cap on a bad value).
 */
// The EOA server account — used ONLY as the smart account's owner/signer (it never
// holds the payout funds in the gasless design).
export const PAYOUT_ACCOUNT_NAME = 'algovault-referral-payout';
// OPS-PAYOUT-GASLESS-W1: the CDP Smart Account that HOLDS + SENDS the USDC. On Base,
// CDP sponsors its user-operation gas (zero-fee) — so it needs NO ETH. This is the
// address operators fund. (The legacy EOA above needs ETH for gas; we don't use it
// to send — it only owns the smart account.)
export const PAYOUT_SMART_ACCOUNT_NAME = 'algovault-referral-payout-sa';
export const PAYOUT_NETWORK = 'base' as const; // Base mainnet (KnownEvmNetworks)

const DEFAULT_MAX_PER_TX_USD = 500;
const DEFAULT_MAX_BATCH_USD = 2000;

function capE2(raw: string | undefined, fallbackUsd: number): number {
  if (raw == null || raw.trim() === '') return fallbackUsd * 100;
  // Strict decimal/integer only — reject 0x.., scientific, NaN (both parseFloat and
  // Number mis-parse those). Default-deny to the fallback on anything invalid.
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) return fallbackUsd * 100;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return fallbackUsd * 100;
  return Math.round(n * 100);
}

/** Per-payout cap in integer cents (env PAYOUT_MAX_PER_TX_USD; default $500). */
export function perTxCapE2(): number {
  return capE2(process.env.PAYOUT_MAX_PER_TX_USD, DEFAULT_MAX_PER_TX_USD);
}

/** Whole-batch cap in integer cents (env PAYOUT_MAX_BATCH_USD; default $2000). */
export function batchCapE2(): number {
  return capE2(process.env.PAYOUT_MAX_BATCH_USD, DEFAULT_MAX_BATCH_USD);
}

/**
 * Optional ERC-7677 paymaster URL for the smart-account send (env PAYOUT_PAYMASTER_URL).
 * Undefined (the default) → CDP's built-in Base sponsorship covers the gas (zero-fee).
 * Only set this to override with a custom/third-party paymaster.
 */
export function payoutPaymasterUrl(): string | undefined {
  const v = process.env.PAYOUT_PAYMASTER_URL;
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * True iff all THREE CDP server-wallet creds are present. The x402 facilitator only
 * needs CDP_API_KEY_ID + CDP_API_KEY_SECRET; SIGNING a server-wallet send additionally
 * requires CDP_WALLET_SECRET — so until Mr.1 provisions it, the factory uses the Stub.
 */
export function cdpPayoutConfigured(): boolean {
  return !!(
    process.env.CDP_API_KEY_ID &&
    process.env.CDP_API_KEY_SECRET &&
    process.env.CDP_WALLET_SECRET
  );
}
