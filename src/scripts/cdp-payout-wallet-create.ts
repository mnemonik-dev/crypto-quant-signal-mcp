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
import { cdpPayoutConfigured, PAYOUT_ACCOUNT_NAME, PAYOUT_SMART_ACCOUNT_NAME, PAYOUT_NETWORK } from '../lib/payout-config.js';

export async function main(): Promise<void> {
  if (!cdpPayoutConfigured()) {
    console.error('CDP not configured — set CDP_API_KEY_ID + CDP_API_KEY_SECRET + CDP_WALLET_SECRET in the container env first.');
    process.exitCode = 1;
    return;
  }
  const { CdpClient } = await import('@coinbase/cdp-sdk');
  const cdp = new CdpClient();
  // Gasless design: a Smart Account (owned by the EOA) holds + sends the USDC; CDP
  // sponsors its gas on Base, so it needs NO ETH. Fund the SMART account address.
  const owner = await cdp.evm.getOrCreateAccount({ name: PAYOUT_ACCOUNT_NAME });
  const smart = await cdp.evm.getOrCreateSmartAccount({ name: PAYOUT_SMART_ACCOUNT_NAME, owner });
  console.log(`CDP gasless payout smart account "${PAYOUT_SMART_ACCOUNT_NAME}" ready (owner EOA "${PAYOUT_ACCOUNT_NAME}").`);
  console.log(`FUND THIS ADDRESS with USDC on ${PAYOUT_NETWORK} (gasless — no ETH needed):`);
  console.log(smart.address);
  console.log(`(owner EOA — reference only, do NOT fund: ${owner.address})`);
}

const argv1 = process.argv[1] ?? '';
if (argv1.endsWith('cdp-payout-wallet-create.js') || argv1.endsWith('cdp-payout-wallet-create.ts')) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
