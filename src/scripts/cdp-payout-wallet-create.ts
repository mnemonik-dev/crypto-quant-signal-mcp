/**
 * REFERRAL-PAYOUT-OPS-W1 / C3 — provision (idempotently) the CDP server-wallet
 * payout account and print its address for Mr.1 to fund.
 *
 * Run ONCE on the host after CDP_WALLET_SECRET is set in the container env:
 *   docker exec <ctr> node dist/scripts/cdp-payout-wallet-create.js
 *
 * getOrCreateAccount is idempotent — re-runs return the SAME account/address, so this
 * is safe to run repeatedly. It creates an empty account; it never moves money. Fund
 * the printed address with ~one month's batch of USDC on Base (the primary risk bound).
 */
import { cdpPayoutConfigured, PAYOUT_ACCOUNT_NAME, PAYOUT_NETWORK } from '../lib/payout-config.js';

export async function main(): Promise<void> {
  if (!cdpPayoutConfigured()) {
    console.error('CDP not configured — set CDP_API_KEY_ID + CDP_API_KEY_SECRET + CDP_WALLET_SECRET in the container env first.');
    process.exitCode = 1;
    return;
  }
  const { CdpClient } = await import('@coinbase/cdp-sdk');
  const cdp = new CdpClient();
  const account = await cdp.evm.getOrCreateAccount({ name: PAYOUT_ACCOUNT_NAME });
  console.log(`CDP payout account "${PAYOUT_ACCOUNT_NAME}" ready.`);
  console.log(`FUND THIS ADDRESS with USDC on ${PAYOUT_NETWORK}:`);
  console.log(account.address);
}

const argv1 = process.argv[1] ?? '';
if (argv1.endsWith('cdp-payout-wallet-create.js') || argv1.endsWith('cdp-payout-wallet-create.ts')) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
