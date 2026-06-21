/**
 * REFERRAL-PAYOUT-OPS-W1 / C3 — CDP server-wallet USDC-on-Base payout sender.
 *
 * Revenue-out: Mr.1 signed off 2026-06-21. GATED — getPayoutSender() (referral-payout.ts)
 * only constructs this when cdpPayoutConfigured() (all three CDP creds present, incl.
 * the signing CDP_WALLET_SECRET) AND every send is operator-triggered (the Approve-all
 * click; never auto-fires). The funded-wallet balance is the primary risk bound; the
 * per-tx cap here + the batch cap in the orchestration are the secondary bound.
 *
 * @coinbase/cdp-sdk is a payment rail (revenue path, like x402 USDC) — NOT an
 * onchain-notarization lib, so it is not in the Data-Integrity onchain blocklist.
 */
import { CdpClient } from '@coinbase/cdp-sdk';
import type { PayoutSender, PayoutResult } from './referral-payout.js';
import { normalizePayoutAddress } from './evm-address.js';
import { PAYOUT_ACCOUNT_NAME, PAYOUT_SMART_ACCOUNT_NAME, PAYOUT_NETWORK, perTxCapE2, payoutPaymasterUrl } from './payout-config.js';

// USDC has 6 decimals. amountUsdE2 is integer cents ($1 = 100 e2 = 1 USDC = 1e6 base
// units), so base units = e2-cents × 10_000.
const USDC_E2_TO_BASE_UNITS = 10_000n;

export class CdpPayoutSender implements PayoutSender {
  readonly kind = 'cdp';

  async send(toAddress: string, amountUsdE2: number): Promise<PayoutResult> {
    // Defense-in-depth re-validation at the irreversible send boundary.
    const addr = normalizePayoutAddress(toAddress);
    if (!addr) throw new Error('invalid_payout_address');
    if (!Number.isFinite(amountUsdE2) || amountUsdE2 <= 0) throw new Error('invalid_amount');
    // Per-tx cap (default-deny). Over-cap rows are left pending for manual handling.
    if (amountUsdE2 > perTxCapE2()) throw new Error('per_tx_cap_exceeded');

    const amount = BigInt(Math.round(amountUsdE2)) * USDC_E2_TO_BASE_UNITS;
    // CdpClient reads CDP_API_KEY_ID / CDP_API_KEY_SECRET / CDP_WALLET_SECRET from env.
    const cdp = new CdpClient();
    // Gasless (OPS-PAYOUT-GASLESS-W1): a CDP Smart Account HOLDS + SENDS the USDC; the
    // EOA only owns/signs it. On Base, CDP sponsors the user-operation gas (zero-fee),
    // so the smart account needs NO ETH — the spec's "zero-fee Base" design.
    const owner = await cdp.evm.getOrCreateAccount({ name: PAYOUT_ACCOUNT_NAME });
    const smart = await cdp.evm.getOrCreateSmartAccount({ name: PAYOUT_SMART_ACCOUNT_NAME, owner });
    const base = await smart.useNetwork(PAYOUT_NETWORK);
    const paymasterUrl = payoutPaymasterUrl();
    const { userOpHash } = await base.transfer({
      to: addr as `0x${string}`,
      amount,
      token: 'usdc',
      ...(paymasterUrl ? { paymasterUrl } : {}),
    });
    // transfer() broadcasts a user-operation; wait for on-chain completion to get the tx hash.
    const op = await base.waitForUserOperation({ userOpHash });
    if (!('transactionHash' in op)) throw new Error(`userop_${op.status} (${userOpHash})`);
    return { txRef: op.transactionHash };
  }
}
