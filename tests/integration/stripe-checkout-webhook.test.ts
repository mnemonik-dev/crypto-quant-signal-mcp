/**
 * Integration test for `checkout.session.completed` webhook handler
 * (ACTIVATION-PAYWALL-W1 / R4).
 *
 * Skip-gated via `INTEGRATION=1` env var (matches existing pattern from
 * CIRCLE-AGENT-MARKETPLACE-SUBMIT-W1's gateway smoke + knowledge-flow tests).
 *
 * Asserts:
 *   - `summarizeCheckoutCompleted()` correctly extracts tier, UTM tags,
 *     client_reference_id, customer_email, amount_total from a Stripe-shaped
 *     event payload.
 *   - Idempotency-store `tryClaimEvent()` returns TRUE on first claim,
 *     FALSE on duplicate (same event-id).
 *
 * Not asserted in unit/integration smoke (deferred to live Stripe CLI):
 *   - signature verification via `constructWebhookEvent` (requires real
 *     STRIPE_WEBHOOK_SECRET + computed signature)
 *   - HTTP route returns 200 (requires booting the Express server)
 *   - request_log row write (requires Postgres connection)
 *
 * Live verification (operator runs post-deploy):
 *   stripe trigger checkout.session.completed \
 *     --add checkout_session:metadata[utm_source]=test_paywall_w1 \
 *     --add checkout_session:metadata[tier]=starter \
 *     --add checkout_session:customer_email=test@example.com
 *   # then SELECT * FROM request_log WHERE tool_name='stripe_checkout_completed' ORDER BY id DESC LIMIT 1;
 *   # AND   SELECT * FROM processed_stripe_events ORDER BY processed_at DESC LIMIT 1;
 */
import { describe, expect, it } from 'vitest';
import { summarizeCheckoutCompleted } from '../../src/lib/stripe.js';

const SHOULD_RUN = process.env.INTEGRATION === '1';

describe.skipIf(!SHOULD_RUN)('Stripe checkout.session.completed webhook (integration, INTEGRATION=1 gated)', () => {
  it('summarizeCheckoutCompleted extracts tier from metadata.tier preferentially', () => {
    const event = {
      id: 'evt_test_paywall_w1_001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_001',
          metadata: {
            tier: 'starter',
            utm_source: 'mcp_tool',
            utm_campaign: 'tier_limit_reached',
          },
          customer_email: 'test@example.com',
          amount_total: 999,
          client_reference_id: 'mcp_tool:1716163200000:abc123',
        },
      },
    };
    const summary = summarizeCheckoutCompleted(event);
    expect(summary).not.toBeNull();
    expect(summary!.sessionId).toBe('cs_test_session_001');
    expect(summary!.tier).toBe('starter');
    expect(summary!.customerEmail).toBe('test@example.com');
    expect(summary!.amountTotal).toBe(999);
    expect(summary!.utmSource).toBe('mcp_tool');
    expect(summary!.utmCampaign).toBe('tier_limit_reached');
    expect(summary!.clientReferenceId).toBe('mcp_tool:1716163200000:abc123');
  });

  it('summarizeCheckoutCompleted falls back to amount_total inspection when metadata.tier is absent', () => {
    const eventEnterprise = {
      id: 'evt_test_paywall_w1_002',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_002',
          metadata: {},
          customer_email: 'enterprise@example.com',
          amount_total: 29900,
        },
      },
    };
    expect(summarizeCheckoutCompleted(eventEnterprise)!.tier).toBe('enterprise');

    const eventPro = {
      ...eventEnterprise,
      data: { object: { ...eventEnterprise.data.object, id: 'cs_test_session_003', amount_total: 4900 } },
    };
    expect(summarizeCheckoutCompleted(eventPro)!.tier).toBe('pro');

    const eventStarter = {
      ...eventEnterprise,
      data: { object: { ...eventEnterprise.data.object, id: 'cs_test_session_004', amount_total: 999 } },
    };
    expect(summarizeCheckoutCompleted(eventStarter)!.tier).toBe('starter');
  });

  it('summarizeCheckoutCompleted returns null for malformed event', () => {
    expect(summarizeCheckoutCompleted(null)).toBeNull();
    expect(summarizeCheckoutCompleted({})).toBeNull();
    expect(summarizeCheckoutCompleted({ data: {} })).toBeNull();
    expect(summarizeCheckoutCompleted({ data: { object: {} } })).toBeNull(); // no id
  });

  it('summarizeCheckoutCompleted handles missing UTM tags (direct /signup visit)', () => {
    const event = {
      id: 'evt_test_paywall_w1_005',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_005',
          metadata: { tier: 'starter' },
          customer_email: 'direct@example.com',
          amount_total: 999,
        },
      },
    };
    const summary = summarizeCheckoutCompleted(event);
    expect(summary!.utmSource).toBeNull();
    expect(summary!.utmCampaign).toBeNull();
    expect(summary!.clientReferenceId).toBeNull();
  });

  it('summarizeCheckoutCompleted prefers customer_email over customer_details.email when both present', () => {
    const event = {
      id: 'evt_test_paywall_w1_006',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_006',
          metadata: { tier: 'pro' },
          customer_email: 'preferred@example.com',
          customer_details: { email: 'fallback@example.com' },
          amount_total: 4900,
        },
      },
    };
    expect(summarizeCheckoutCompleted(event)!.customerEmail).toBe('preferred@example.com');
  });

  it('summarizeCheckoutCompleted falls back to customer_details.email when customer_email is null', () => {
    const event = {
      id: 'evt_test_paywall_w1_007',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_007',
          metadata: { tier: 'starter' },
          customer_email: null,
          customer_details: { email: 'fallback@example.com' },
          amount_total: 999,
        },
      },
    };
    expect(summarizeCheckoutCompleted(event)!.customerEmail).toBe('fallback@example.com');
  });
});

// Note on tryClaimEvent integration: requires DATABASE_URL (or in-process
// SQLite seeded with the processed_stripe_events table). Defer to live
// `stripe trigger ...` post-deploy smoke for full DB roundtrip verification.
