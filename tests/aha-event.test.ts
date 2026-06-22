/**
 * CONVERSION-MEASUREMENT-W1 C1 — unit tests for the activation "aha" event
 * (`first_non_hold_verdict`). Pure: an injected recorder spy + module-state
 * reset between tests; no DB, no network. Covers the gating matrix (verdict /
 * tier / session), per-session dedup, and the fail-open contract.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  recordFirstNonHoldVerdict,
  shouldEmitFirstNonHold,
  shouldShowAhaReferral,
  ahaReferralAlreadyShown,
  _resetFirstNonHoldForTest,
} from '../src/lib/aha-event.js';

afterEach(() => {
  _resetFirstNonHoldForTest();
  vi.restoreAllMocks();
});

describe('aha-event — recordFirstNonHoldVerdict gating', () => {
  it('emits for a free session BUY (first time) with exact payload', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict(
      { verdict: 'BUY', tier: 'free', sessionId: 's1', tool: 'get_trade_call', asset: 'BTC' },
      rec,
    );
    expect(rec).toHaveBeenCalledTimes(1);
    expect(rec).toHaveBeenCalledWith({
      eventType: 'first_non_hold_verdict',
      sessionId: 's1',
      licenseTier: 'free',
      meta: { verdict: 'BUY', tool: 'get_trade_call', asset: 'BTC' },
    });
  });

  it('normalises verdict case (sell → SELL) and defaults asset to null', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: 'sell', tier: 'free', sessionId: 's2', tool: 'get_trade_signal' }, rec);
    expect(rec).toHaveBeenCalledTimes(1);
    const payload = rec.mock.calls[0][0];
    expect(payload.meta).toEqual({ verdict: 'SELL', tool: 'get_trade_signal', asset: null });
  });

  it('does NOT emit for HOLD', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: 'HOLD', tier: 'free', sessionId: 's3', tool: 'get_trade_call' }, rec);
    expect(rec).not.toHaveBeenCalled();
  });

  it('does NOT emit for undefined / null / empty verdict', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: undefined, tier: 'free', sessionId: 's4', tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: null, tier: 'free', sessionId: 's5', tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: '', tier: 'free', sessionId: 's6', tool: 'get_trade_call' }, rec);
    expect(rec).not.toHaveBeenCalled();
  });

  it('does NOT emit for non-free tiers (starter/pro/enterprise/internal/x402)', () => {
    const rec = vi.fn();
    for (const tier of ['starter', 'pro', 'enterprise', 'internal', 'x402']) {
      recordFirstNonHoldVerdict({ verdict: 'BUY', tier, sessionId: `s-${tier}`, tool: 'get_trade_call' }, rec);
    }
    expect(rec).not.toHaveBeenCalled();
  });

  it('does NOT emit when sessionId is missing (null / undefined / empty)', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: null, tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: undefined, tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: '', tool: 'get_trade_call' }, rec);
    expect(rec).not.toHaveBeenCalled();
  });
});

describe('aha-event — per-session dedup + fail-open', () => {
  it('dedups per session — a second non-HOLD for the same session does NOT emit', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'dup', tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: 'SELL', tier: 'free', sessionId: 'dup', tool: 'get_trade_signal' }, rec);
    expect(rec).toHaveBeenCalledTimes(1);
  });

  it('distinct sessions each emit once', () => {
    const rec = vi.fn();
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'a', tool: 'get_trade_call' }, rec);
    recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'b', tool: 'get_trade_call' }, rec);
    expect(rec).toHaveBeenCalledTimes(2);
  });

  it('fail-open — a throwing recorder never propagates', () => {
    const rec = vi.fn(() => {
      throw new Error('db down');
    });
    expect(() =>
      recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'z', tool: 'get_trade_call' }, rec),
    ).not.toThrow();
  });
});

describe('aha-event — shouldEmitFirstNonHold', () => {
  it('returns true once per session, false thereafter', () => {
    expect(shouldEmitFirstNonHold('x')).toBe(true);
    expect(shouldEmitFirstNonHold('x')).toBe(false);
    expect(shouldEmitFirstNonHold('y')).toBe(true);
  });
});

describe('aha-event — shouldShowAhaReferral (REFERRAL-INPRODUCT-NUDGE-W1 ≤1/session cap)', () => {
  it('returns true once per session, false thereafter (first aha trigger wins)', () => {
    expect(shouldShowAhaReferral('cap1')).toBe(true);
    expect(shouldShowAhaReferral('cap1')).toBe(false); // 2nd trigger same session → suppressed
    expect(shouldShowAhaReferral('cap2')).toBe(true);  // distinct session → independent slot
  });

  it('ahaReferralAlreadyShown peeks WITHOUT consuming the slot', () => {
    expect(ahaReferralAlreadyShown('peek1')).toBe(false); // peek does not consume
    expect(ahaReferralAlreadyShown('peek1')).toBe(false); // still free
    expect(shouldShowAhaReferral('peek1')).toBe(true);    // consume now
    expect(ahaReferralAlreadyShown('peek1')).toBe(true);  // peek reflects consumed
    expect(shouldShowAhaReferral('peek1')).toBe(false);   // already shown
  });

  it('is an INDEPENDENT store from the aha-emit dedup (separate concerns)', () => {
    // Consuming the referral slot must not affect the first-non-HOLD emit decision.
    expect(shouldShowAhaReferral('iso')).toBe(true);
    expect(shouldEmitFirstNonHold('iso')).toBe(true); // independent set — still emits
  });

  it('_resetFirstNonHoldForTest clears BOTH the emit + the referral session stores', () => {
    shouldShowAhaReferral('rst');
    expect(ahaReferralAlreadyShown('rst')).toBe(true);
    _resetFirstNonHoldForTest();
    expect(ahaReferralAlreadyShown('rst')).toBe(false);
  });
});

describe('aha-event — return value drives the aha render (ACTIVATION-NUDGE-W1 single source)', () => {
  // The boolean return is the SINGLE first-non-HOLD-per-session decision the
  // handler reuses to attach the one-time aha upgrade_hint (no re-derivation).
  it('returns true exactly when the aha fires (first free non-HOLD), false on the dup', () => {
    const rec = vi.fn();
    expect(recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'r1', tool: 'get_trade_call' }, rec)).toBe(true);
    // second non-HOLD same session → event deduped AND render suppressed
    expect(recordFirstNonHoldVerdict({ verdict: 'SELL', tier: 'free', sessionId: 'r1', tool: 'get_trade_signal' }, rec)).toBe(false);
    expect(rec).toHaveBeenCalledTimes(1);
  });

  it('returns false for HOLD, paid tier, and missing session (no aha render)', () => {
    const rec = vi.fn();
    expect(recordFirstNonHoldVerdict({ verdict: 'HOLD', tier: 'free', sessionId: 'r2', tool: 'get_trade_call' }, rec)).toBe(false);
    expect(recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'starter', sessionId: 'r3', tool: 'get_trade_call' }, rec)).toBe(false);
    expect(recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: null, tool: 'get_trade_call' }, rec)).toBe(false);
  });

  it('returns false fail-open when the recorder throws (render never fires on a write fault)', () => {
    const rec = vi.fn(() => { throw new Error('db down'); });
    expect(recordFirstNonHoldVerdict({ verdict: 'BUY', tier: 'free', sessionId: 'r4', tool: 'get_trade_call' }, rec)).toBe(false);
  });
});
