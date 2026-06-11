/**
 * OPS-MCP-DEFENSE-IN-DEPTH-W1 R1 — signed-value floor (permanent canary).
 *
 * `paymentMatchesToolRoute` step (2) reads the amount from the SERVER's matched
 * requirement (`got.amount`), which by construction equals the route's own price —
 * safe only while the facilitator verifies the signature against that requirement
 * first. R1 adds step (3): re-assert the effective-price floor against what the
 * buyer actually SIGNED (`payload.authorization.value` EIP-3009 /
 * `payload.permit2Authorization.value` Permit2). A requirement/signature divergence
 * (SDK or facilitator drift) can then never under-charge: BOTH floors must pass.
 *
 * Lockstep: `classifyToolRouteMismatch === 'ok'` iff `paymentMatchesToolRoute === true`
 * must survive the new gate (signed-underpay classifies as 'insufficient').
 *
 * Bootstrap mirrors tests/x402-mcp-classify.test.ts (real initX402, stub facilitator).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const WALLET = '0x778A05280Fd8dB980E920fE9f31d0A8eAbD17d59';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NETWORK = 'eip155:8453';
const atomic = (usd: number) => Math.round(usd * 1_000_000).toString();

function req(amountUsd: number, over: Partial<Record<string, string>> = {}) {
  return {
    scheme: 'exact', network: NETWORK, amount: atomic(amountUsd), asset: USDC,
    payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' },
    ...over,
  };
}

/** EIP-3009 payment envelope carrying the buyer's SIGNED value (atomic). */
function pp3009(valueAtomic: string) {
  return {
    x402Version: 2,
    payload: {
      signature: '0xsig',
      authorization: {
        from: '0xPAYER', to: WALLET, value: valueAtomic,
        validAfter: '0', validBefore: '9999999999', nonce: '0xNONCE',
      },
    },
  };
}

/** Permit2 envelope shape (`payload.permit2Authorization.value`). */
function ppPermit2(valueAtomic: string) {
  return {
    x402Version: 2,
    payload: { signature: '0xsig', permit2Authorization: { value: valueAtomic, nonce: '0xNONCE' } },
  };
}

let x402: typeof import('../src/lib/x402.js');

beforeAll(async () => {
  process.env.X402_WALLET_ADDRESS = WALLET;
  process.env.X402_NETWORK = 'base-mainnet';
  process.env.X402_FACILITATOR = 'legacy';
  delete process.env.DATABASE_URL;
  vi.doMock('../src/lib/x402-facilitator.js', () => ({
    resolveFacilitatorFromEnv: () => ({ effectiveChoice: 'legacy', discoveryEnabled: false }),
    createFacilitatorClient: () => ({}),
  }));
  vi.doMock('@x402/core/server', () => ({
    x402ResourceServer: class {
      register() {}
      registerExtension() {}
      async initialize() {}
      getSupportedKind() { return true; }
      async buildPaymentRequirements(cfg: { price: string }) {
        return [req(parseFloat(String(cfg.price).replace('$', '')))];
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

// get_trade_signal is the $0.02 route (effective 20000 atomic, base timeframe).
const TOOL = 'get_trade_signal';

describe('extractSignedAuthorizationValue — dual-shape signed-amount reader', () => {
  it('reads EIP-3009 payload.authorization.value', () => {
    expect(x402.extractSignedAuthorizationValue(pp3009('20000'))).toBe('20000');
  });

  it('reads Permit2 payload.permit2Authorization.value', () => {
    expect(x402.extractSignedAuthorizationValue(ppPermit2('20000'))).toBe('20000');
  });

  it('reads defensive un-nested authorization.value', () => {
    expect(x402.extractSignedAuthorizationValue({ authorization: { value: '20000' } })).toBe('20000');
  });

  it('default-denies absent/malformed: {} / non-object / empty-string / numeric → undefined', () => {
    expect(x402.extractSignedAuthorizationValue({})).toBeUndefined();
    expect(x402.extractSignedAuthorizationValue(null)).toBeUndefined();
    expect(x402.extractSignedAuthorizationValue('20000')).toBeUndefined();
    expect(x402.extractSignedAuthorizationValue({ payload: { authorization: { value: '' } } })).toBeUndefined();
    // strict mirror of extractPaymentNonce: non-string shapes default-deny
    expect(x402.extractSignedAuthorizationValue({ payload: { authorization: { value: 20000 } } })).toBeUndefined();
  });
});

describe('paymentMatchesToolRoute — signed-value floor (R1)', () => {
  it('REJECTS when the matched requirement meets the floor but the SIGNED value underpays', () => {
    // Requirement says 20000 (passes step 2); buyer actually signed 10000 ($0.01).
    const s = { paymentPayload: pp3009(atomic(0.01)), requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(s, TOOL)).toBe(false);
  });

  it('REJECTS when the signed value is missing entirely (default-deny)', () => {
    const s = { paymentPayload: {}, requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(s, TOOL)).toBe(false);
  });

  it('PASSES when BOTH the matched requirement and the signed value meet the floor', () => {
    const s = { paymentPayload: pp3009(atomic(0.02)), requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(s, TOOL)).toBe(true);
  });

  it('PASSES an over-paying signed value', () => {
    const s = { paymentPayload: pp3009(atomic(0.05)), requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(s, TOOL)).toBe(true);
  });

  it('honors the Permit2 shape (signed value via permit2Authorization)', () => {
    const s = { paymentPayload: ppPermit2(atomic(0.02)), requirements: req(0.02) };
    expect(x402.paymentMatchesToolRoute(s, TOOL)).toBe(true);
  });

  it('applies the timeframe-premium floor to the SIGNED value too (1m=$0.05)', () => {
    // get_trade_call has the timeframe premium; requirement at premium but signed at base.
    const sUnder = { paymentPayload: pp3009(atomic(0.02)), requirements: req(0.05) };
    expect(x402.paymentMatchesToolRoute(sUnder, 'get_trade_call', '1m')).toBe(false);
    const sOk = { paymentPayload: pp3009(atomic(0.05)), requirements: req(0.05) };
    expect(x402.paymentMatchesToolRoute(sOk, 'get_trade_call', '1m')).toBe(true);
  });
});

describe('classifyToolRouteMismatch — lockstep with the signed-value floor', () => {
  it("signed-underpay classifies as 'insufficient' (not 'ok')", () => {
    const s = { paymentPayload: pp3009(atomic(0.01)), requirements: req(0.02) };
    expect(x402.classifyToolRouteMismatch(s, TOOL)).toBe('insufficient');
  });

  it("missing signed value classifies as 'insufficient'", () => {
    const s = { paymentPayload: {}, requirements: req(0.02) };
    expect(x402.classifyToolRouteMismatch(s, TOOL)).toBe('insufficient');
  });

  it("lockstep invariant: classify === 'ok' iff paymentMatchesToolRoute === true", () => {
    const cases = [
      { paymentPayload: pp3009(atomic(0.02)), requirements: req(0.02) },          // ok
      { paymentPayload: pp3009(atomic(0.01)), requirements: req(0.02) },          // signed underpay
      { paymentPayload: {}, requirements: req(0.02) },                            // missing signed
      { paymentPayload: pp3009(atomic(0.02)), requirements: req(0.01) },          // requirement underpay
      { paymentPayload: pp3009(atomic(0.02)), requirements: { ...req(0.02), payTo: '0xdead' } }, // identity
    ];
    for (const s of cases) {
      const match = x402.paymentMatchesToolRoute(s, TOOL);
      const cls = x402.classifyToolRouteMismatch(s, TOOL);
      expect(cls === 'ok', `lockstep broke for ${JSON.stringify(s.requirements)} / ${JSON.stringify(s.paymentPayload)}`).toBe(match);
    }
  });
});
