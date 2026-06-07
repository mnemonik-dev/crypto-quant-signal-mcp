/**
 * X402-01 (HIGH) + X402-03 (MED) regression — per-route price binding.
 * (SECURITY-FIX-X402-WEBHOOK-W1, Stream A)
 *
 * Encodes the audit findings as failing-then-green unit tests over the pure
 * binding helpers in src/lib/x402.ts:
 *   - X402-01: a valid $0.01 scan_funding_arb proof must NOT satisfy the $0.02
 *     get_trade_signal / get_market_regime routes (cross-tool downgrade).
 *   - X402-03: a base $0.02 proof must NOT satisfy a premium-timeframe (1m=$0.05)
 *     get_trade_signal call.
 * Also asserts `isPaymentSufficient` (was DEAD CODE — the gap) is now live and
 * correct in atomic units, and that `effectivePrice` applies the premium.
 *
 * These build the real per-tool requirements through the actual `initX402`
 * pipeline (with a stub facilitator) so the matched-requirement shapes are the
 * SAME ones production deep-equals against.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const WALLET = '0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NETWORK = 'eip155:8453';
const atomic = (usd: number) => Math.round(usd * 1_000_000).toString();

/** Build a production-shaped matched requirement (SDK baseRequirements shape). */
function req(amountUsd: number) {
  return {
    scheme: 'exact',
    network: NETWORK,
    amount: atomic(amountUsd),
    asset: USDC,
    payTo: WALLET,
    maxTimeoutSeconds: 300,
    extra: { name: 'USD Coin', version: '2' },
  };
}

// We stub the facilitator + resource-server SDK so initX402 builds real per-tool
// requirements deterministically (no network, no CDP). The stub's
// buildPaymentRequirements returns the same {amount,asset,network,payTo,...} shape
// the real SDK builds for each tool's $price.
function installX402Env() {
  process.env.X402_WALLET_ADDRESS = WALLET;
  process.env.X402_NETWORK = 'base-mainnet';
  process.env.X402_FACILITATOR = 'legacy';
  delete process.env.DATABASE_URL;
}

let x402: typeof import('../src/lib/x402.js');

beforeAll(async () => {
  installX402Env();
  // Stub the facilitator module so createFacilitatorClient/resolveFacilitatorFromEnv
  // don't need real CDP keys or a sidecar.
  vi.doMock('../src/lib/x402-facilitator.js', () => ({
    resolveFacilitatorFromEnv: () => ({ effectiveChoice: 'legacy', discoveryEnabled: false }),
    createFacilitatorClient: () => ({ /* opaque; the stubbed resource server ignores it */ }),
  }));
  // Stub the @x402/core resource server: it only needs to build requirements that
  // match the real SDK's amount-bearing shape for each tool price.
  vi.doMock('@x402/core/server', () => ({
    x402ResourceServer: class {
      register() {}
      registerExtension() {}
      async initialize() {}
      getSupportedKind() { return true; }
      async buildPaymentRequirements(cfg: { price: string }) {
        const usd = parseFloat(String(cfg.price).replace('$', ''));
        return [req(usd)];
      }
      findMatchingRequirements() { return null; }
      async verifyPayment() { return { isValid: true }; }
      settlePayment() { return Promise.resolve({ success: true }); }
    },
  }));
  vi.doMock('@x402/extensions/bazaar', () => ({ bazaarResourceServerExtension: {} }));

  x402 = await import('../src/lib/x402.js');
  await x402.initX402();
});

afterAll(() => {
  vi.doUnmock('../src/lib/x402-facilitator.js');
  vi.doUnmock('@x402/core/server');
  vi.doUnmock('@x402/extensions/bazaar');
  vi.resetModules();
});

describe('effectivePrice — X402-03 premium timeframe pricing', () => {
  it('get_trade_signal base timeframe → base $0.02', () => {
    expect(x402.effectivePrice('get_trade_signal', '4h')).toBe(0.02);
    expect(x402.effectivePrice('get_trade_signal', undefined)).toBe(0.02);
  });
  it('get_trade_signal premium timeframes → premium price', () => {
    expect(x402.effectivePrice('get_trade_signal', '1m')).toBe(0.05);
    expect(x402.effectivePrice('get_trade_signal', '3m')).toBe(0.04);
    expect(x402.effectivePrice('get_trade_signal', '5m')).toBe(0.03);
  });
  it('premium only applies to get_trade_signal, not other tools', () => {
    // get_market_regime never has a premium even on a short tf.
    expect(x402.effectivePrice('get_market_regime', '1h')).toBe(0.02);
    expect(x402.effectivePrice('scan_funding_arb', undefined)).toBe(0.01);
  });
  it('unknown tool → undefined', () => {
    expect(x402.effectivePrice('get_trade_call', '4h')).toBeUndefined();
  });
});

describe('isPaymentSufficient — now LIVE (was dead code; the X402-01 gap)', () => {
  it('exact / over base price (atomic units) → true', () => {
    expect(x402.isPaymentSufficient('get_trade_signal', atomic(0.02), '4h')).toBe(true);
    expect(x402.isPaymentSufficient('get_trade_signal', atomic(0.03), '4h')).toBe(true);
  });
  it('underpay base price → false', () => {
    expect(x402.isPaymentSufficient('get_trade_signal', atomic(0.01), '4h')).toBe(false);
  });
  it('premium timeframe: base $0.02 underpays the $0.05 1m price → false', () => {
    expect(x402.isPaymentSufficient('get_trade_signal', atomic(0.02), '1m')).toBe(false);
    expect(x402.isPaymentSufficient('get_trade_signal', atomic(0.05), '1m')).toBe(true);
  });
  it('undefined / non-numeric amount → false (default-deny)', () => {
    expect(x402.isPaymentSufficient('get_trade_signal', undefined, '4h')).toBe(false);
    expect(x402.isPaymentSufficient('get_trade_signal', 'NaN', '4h')).toBe(false);
  });
});

describe('paymentMatchesToolRoute — X402-01 cross-tool downgrade rejection', () => {
  it('the per-tool requirements were built (sanity)', () => {
    const reqs = x402._getToolRequirementsForTest();
    expect((reqs.get('scan_funding_arb')?.[0] as { amount: string }).amount).toBe(atomic(0.01));
    expect((reqs.get('get_trade_signal')?.[0] as { amount: string }).amount).toBe(atomic(0.02));
    expect((reqs.get('get_market_regime')?.[0] as { amount: string }).amount).toBe(atomic(0.02));
  });

  it('a $0.01 scan_funding_arb proof is REJECTED on the $0.02 get_trade_signal route', () => {
    const cheapSettlement = { paymentPayload: {}, requirements: req(0.01) };
    // The ATTACK: this is exactly what the flattened-pool match produced — a valid
    // $0.01 requirement — POSTed to the $0.02 route. Must be rejected now.
    expect(x402.paymentMatchesToolRoute(cheapSettlement, 'get_trade_signal', '4h')).toBe(false);
    expect(x402.paymentMatchesToolRoute(cheapSettlement, 'get_market_regime', '4h')).toBe(false);
  });

  it('a $0.01 scan_funding_arb proof is ACCEPTED on its own scan_funding_arb route', () => {
    const settlement = { paymentPayload: {}, requirements: req(0.01) };
    expect(x402.paymentMatchesToolRoute(settlement, 'scan_funding_arb')).toBe(true);
  });

  it('a correct $0.02 get_trade_signal proof is ACCEPTED on its own route (base tf)', () => {
    const settlement = { paymentPayload: {}, requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(settlement, 'get_trade_signal', '4h')).toBe(true);
  });

  it('over-payment is ACCEPTED (amount is a floor, not an exact match)', () => {
    // A $0.03 proof on the $0.02 route over-pays — harmless to us, must serve.
    const settlement = { paymentPayload: {}, requirements: req(0.03) };
    expect(x402.paymentMatchesToolRoute(settlement, 'get_trade_signal', '4h')).toBe(true);
  });

  it('a $0.05 proof covers a premium 1m get_trade_signal call', () => {
    const settlement = { paymentPayload: {}, requirements: req(0.05) };
    expect(x402.paymentMatchesToolRoute(settlement, 'get_trade_signal', '1m')).toBe(true);
  });

  it('X402-03: a $0.02 proof is REJECTED on a premium 1m get_trade_signal call', () => {
    const settlement = { paymentPayload: {}, requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(settlement, 'get_trade_signal', '1m')).toBe(false);
  });

  it('wrong network / asset / payTo are rejected even at the right amount', () => {
    const wrongNet = { paymentPayload: {}, requirements: { ...req(0.02), network: 'eip155:84532' } };
    const wrongAsset = { paymentPayload: {}, requirements: { ...req(0.02), asset: '0x0000000000000000000000000000000000000000' } };
    const wrongPayTo = { paymentPayload: {}, requirements: { ...req(0.02), payTo: '0x000000000000000000000000000000000000dead' } };
    expect(x402.paymentMatchesToolRoute(wrongNet, 'get_trade_signal', '4h')).toBe(false);
    expect(x402.paymentMatchesToolRoute(wrongAsset, 'get_trade_signal', '4h')).toBe(false);
    expect(x402.paymentMatchesToolRoute(wrongPayTo, 'get_trade_signal', '4h')).toBe(false);
  });

  it('accepts a 1-element array requirement (as the SDK match returns)', () => {
    const settlement = { paymentPayload: {}, requirements: [req(0.02)] };
    expect(x402.paymentMatchesToolRoute(settlement, 'get_trade_signal', '4h')).toBe(true);
  });

  it('null / malformed settlement / unknown tool → reject (default-deny)', () => {
    expect(x402.paymentMatchesToolRoute(null, 'get_trade_signal')).toBe(false);
    expect(x402.paymentMatchesToolRoute({ requirements: undefined }, 'get_trade_signal')).toBe(false);
    expect(x402.paymentMatchesToolRoute({ paymentPayload: {}, requirements: req(0.02) }, 'get_trade_call')).toBe(false);
  });
});
