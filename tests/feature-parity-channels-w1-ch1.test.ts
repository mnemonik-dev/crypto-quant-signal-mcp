/**
 * FEATURE-PARITY-CHANNELS-W1 CH1 — channels derive from the registry SoT.
 *
 * (a) the webhook event set is a PROJECTION of the registry — NOT a 2nd hardcoded
 *     list (adding a future webhook tool needs only a registry row);
 * (b) scan_trade_calls now reaches the webhook + bot channels;
 * (c) the scan_digest delivery payload renders the allow-listed digest shape;
 * (d) the trade_call / regime_shift payload is byte-unchanged (firewall).
 */
import { describe, it, expect } from 'vitest';
import {
  FEATURE_REGISTRY,
  getFeature,
  projectCapabilities,
  webhookEventTypes,
} from '../src/lib/feature-registry.js';
import { VALID_EVENTS } from '../src/lib/webhook-api.js';
import { buildPayload } from '../src/lib/webhook-delivery.js';
import type { WebhookEventData } from '../src/lib/webhooks-store.js';

describe('CH1 — webhook event set DERIVES from the registry (no 2nd hardcoded list)', () => {
  it('webhookEventTypes() == the webhook-flagged features\' webhookEvent, in registry order', () => {
    expect(webhookEventTypes()).toEqual(['trade_call', 'regime_shift', 'scan_digest']);
  });

  it('VALID_EVENTS (webhook-api) deep-equals webhookEventTypes() — one source', () => {
    expect(VALID_EVENTS).toEqual(webhookEventTypes());
  });

  it('every webhook-flagged feature has a webhookEvent (flagged-but-unmapped == bug)', () => {
    for (const f of FEATURE_REGISTRY) {
      if (f.channels.webhook) {
        expect(f.webhookEvent, `${f.name} is webhook-flagged but has no webhookEvent`).toBeTruthy();
      }
    }
  });
});

describe('CH1 — scan_trade_calls reaches webhook + bot', () => {
  it('registry: scan_trade_calls webhook=true, bot=true, webhookEvent=scan_digest', () => {
    const scan = getFeature('scan_trade_calls');
    expect(scan).toBeTruthy();
    expect(scan!.channels.webhook).toBe(true);
    expect(scan!.channels.bot).toBe(true);
    expect(scan!.webhookEvent).toBe('scan_digest');
  });

  it('projection: scan_trade_calls.channels.{webhook,bot} == true', () => {
    const scan = projectCapabilities().tools.find((t) => t.name === 'scan_trade_calls');
    expect(scan).toBeTruthy();
    expect(scan!.channels.webhook).toBe(true);
    expect(scan!.channels.bot).toBe(true);
  });
});

describe('CH1 — scan_digest delivery payload (allow-listed digest shape)', () => {
  it('renders cadence/timeframe/exchange/calls; no Phase-E leak', () => {
    const ev = {
      type: 'scan_digest',
      cadence: '1h',
      timeframe: '15m',
      exchange: 'BINANCE',
      calls: [
        { coin: 'BTC', timeframe: '15m', exchange: 'BINANCE', call: 'BUY', confidence: 71, regime: 'TRENDING_UP' },
        { coin: 'ETH', timeframe: '15m', exchange: 'BINANCE', call: 'SELL', confidence: 64, regime: 'TRENDING_DOWN' },
      ],
      generated_at: 1700000000,
    } as unknown as WebhookEventData;
    const payload = buildPayload(ev, 42);
    expect(payload.event).toBe('scan_digest');
    expect(payload.created_at).toBe(1700000000);
    expect(payload.data).toMatchObject({ type: 'scan_digest', cadence: '1h', timeframe: '15m', exchange: 'BINANCE' });
    const calls = (payload.data as unknown as { calls: unknown[] }).calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ coin: 'BTC', timeframe: '15m', exchange: 'BINANCE', call: 'BUY', confidence: 71, regime: 'TRENDING_UP' });
    const json = JSON.stringify(payload);
    for (const forbidden of ['outcome_', 'pfe_', 'mae_', 'return_pct', 'price_after']) {
      expect(json, `forbidden key ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('CH1 — trade_call / regime_shift payload byte-unchanged (firewall)', () => {
  it('trade_call data has exactly the existing keys (no prior_regime)', () => {
    const ev = {
      type: 'trade_call', coin: 'BTC', timeframe: '1h', exchange: 'HL',
      call: 'BUY', confidence: 72, regime: 'TRENDING_UP', price_at_call: 50000,
      signal_hash: '0xabc', created_at: 1700000000,
    } as WebhookEventData;
    const payload = buildPayload(ev, 7);
    expect(payload.event).toBe('trade_call');
    expect(payload.data).toEqual({
      type: 'trade_call', coin: 'BTC', timeframe: '1h', exchange: 'HL',
      call: 'BUY', confidence: 72, regime: 'TRENDING_UP',
      price_at_call: 50000, signal_hash: '0xabc',
      verify_url: 'https://algovault.com/verify?hash=0xabc',
    });
  });

  it('regime_shift data includes prior_regime', () => {
    const ev = {
      type: 'regime_shift', coin: 'ETH', timeframe: '4h', exchange: 'BINANCE',
      call: 'SELL', confidence: 60, regime: 'RANGING', prior_regime: 'TRENDING_UP',
      price_at_call: 3000, signal_hash: '0xdef', created_at: 1700000001,
    } as WebhookEventData;
    const payload = buildPayload(ev, 8);
    expect((payload.data as { prior_regime?: string }).prior_regime).toBe('TRENDING_UP');
  });
});
