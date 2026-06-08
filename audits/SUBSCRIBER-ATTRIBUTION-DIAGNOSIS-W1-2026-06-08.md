# SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 — new paid subscriber profile

**Wave:** SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 — read-only forensic, **zero production mutation**.
**Run:** 2026-06-08 ~06:26 UTC. **Subject:** the Starter subscriber created 2026-06-07.
**Sources:** Stripe live API (in MCP container; `sk_live_` never left host) + Postgres `signal_performance` (read-only). **Step-0:** `SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1-endpoint-truth.md` (0 fictional, 2 inline drifts, no HALT).

> 🔒 **PII redaction notice (Data-Integrity LAW).** `AlgoVaultLabs/crypto-quant-signal-mcp` is a **PUBLIC** repo. The customer's full email, legal name, and billing ZIP/city are **deliberately withheld** from this committed doc and delivered to the operator in-session only. Country/state (the requested geo deliverable) and Stripe object ids (already non-PII without the secret key) are retained. No customer-identifying contact detail is published here.

---

## VERDICT (one line)

**Channel = (B) DIRECT LANDING `/signup` (anonymous web Stripe Checkout, untagged) · Country = UNITED STATES (Florida) · Pre-conversion free-tier usage = UNMEASURABLE (no first-party identity bridge) → COLD SUBSCRIBE, not a quota-exhaustion conversion · Starter $9.99/mo `active`, API key provisioned, healthy.**

## Subscriber Profile

| Field | Value | Source |
|---|---|---|
| Customer | `cus_UepU…` (resolved **by email**, 1 exact match — not assumed) | `customers.list({email})` |
| Name / email | *[withheld — public repo; operator session]* | Stripe customer |
| **Acquisition channel** | **(B) direct landing `/signup`** — anonymous web checkout, untagged | `client_reference_id="direct:…"`, checkout `metadata={tier}` (no `utm_source`), `cancel_url=…/signup?cancelled=true` |
| **Country (geo)** | **United States** (billing + payment-instrument both `US`); state = **Florida** | `Customer.address.country`=US, `Charge.billing_details.address.country`=US, Stripe **Link** instrument `country`=US |
| **Pre-conv free usage** | **Unmeasurable — no bridge** (cold subscribe; see §5) | `signup_emails`=0, `funnel_events`=0 for this click, `request_log` has no per-user identity |
| Tier / price | **AlgoVault Starter** `prod_UJVx…` / `price_1TKsvJ…`, **$9.99/mo** (`unit_amount=999 usd`, interval month) | subscription item |
| Subscription | `sub_1TfVpg…` **`active`**, `cancel_at_period_end=false`, `collection_method=charge_automatically` | `subscriptions` |
| API key provisioned | **YES** (`has_api_key=true`, `metadata.tier=starter`) — entitlement intact | customer metadata (value never printed) |
| Payment rail | **Stripe** (card network via **Stripe Link**), **NOT x402/USDC** | `charges`, `payment_methods` |
| Signup→pay latency | **~46 s** (checkout-start 01:48:16 → paid/charge 01:48:59 UTC) | session vs charge `created` |
| Risk | `outcome.risk_level=normal`, `approved_by_network`, `delinquent=false` | charge outcome |
| Outbound webhooks | **None** (`webhook_subscriptions`=0 rows system-wide) | DB |

---

## Timeline (UTC) — single tight transaction

| Time (UTC) | Event | Object |
|---|---|---|
| 2026-06-07 **01:48:16** | Checkout session created (mode=subscription, `direct`) | `cs_live_a1hvV1…` |
| 2026-06-07 **01:48:56** | Customer + subscription + first invoice created | `cus_UepU…` / `sub_1TfVpg…` / inv `…-0001` |
| 2026-06-07 **01:48:59** | Charge succeeded, $9.99, paid via **Link** | `py_3TfVpd…` |
| 2026-06-07 **01:49:01** | `customer.subscription.created` event (→ key provisioned, delivered) | `evt_…20M2TDXO` |
| 2026-06-07 **01:49:02** | `checkout.session.completed` event (`pending_webhooks=0` — not subscribed at the time) | `evt_…LGUIBGBk` |

**Dashboard-time reconciliation:** `created` = `2026-06-07T01:48:56Z` = **09:48:56 in UTC+8** (the operator's Dashboard view) ✓ matches the reported "~09:48 local". For the *customer's own* local time (Florida/EDT, UTC−4) this was **~21:48 on Sat 2026-06-06** — a Saturday-evening purchase.

---

## R4 — Acquisition channel: (A) TG / (B) landing / (C) MCP / (D) API — and why "Webhook" is none of them

**The Stripe webhook (`we_1TKJVZ…`, `…/webhooks/stripe`) is a MECHANISM, not an acquisition channel.** It is the backend notification Stripe POSTs to our server *after* payment; **every** Stripe subscriber rides it regardless of how they were acquired. Asking "TG / MCP / API / **Webhook**?" conflates the discovery source with the settlement plumbing. The real source is one of A–D below.

| Channel | Expected fingerprint | This customer | Verdict |
|---|---|---|---|
| **(A) Telegram bot** | `client_reference_id` `tg_bot:…`; a `funnel_events.chat_id`; tg-tagged metadata | `direct:…`, **no** `chat_id`, **no** tg metadata | ❌ ruled out |
| **(B) Landing `/signup`** | anonymous web 303-redirect → `direct`/untagged; `cancel_url=/signup` | `client_reference_id="direct:1780796896353:0n031n"`, `metadata={tier:starter}` only, `cancel_url=…/signup?cancelled=true`, `success_url=…/welcome` | ✅ **CONFIRMED** |
| **(C) MCP client paywall→upgrade** | `?upgrade_from=quota` / an `upgrade_cta_clicked` funnel row; mcp marker | `funnel_events.upgrade_cta_clicked` = **0 all-time**; no mcp marker; no quota pressure | ❌ ruled out |
| **(D) Raw API** | pre-existing api key / identity carried in | customer had **no** api key before subscribing | ❌ ruled out |

**Conclusion:** single most-likely channel = **(B) direct landing `/signup`**, HIGH confidence. The `direct:` prefix on the synthetic per-click `client_reference_id`, the absence of any `utm_source` in session metadata, and the `/signup` cancel-URL all converge. This confirms the SOAK-MEASURE prior ("1 paid completion, untagged") and the CHECKOUT-COMPLETION finding (the lone S2 PAID was `direct`).

---

## R5 — Pre-subscription free-tier usage ("did he burn his 100 free calls first?")

**Answer: NOT FIRST-PARTY MEASURABLE — and the corroborating signals say COLD SUBSCRIBE, not quota-exhaustion.**

Identity-bridge search (every candidate join, all read-only):

1. **`signup_emails` by email → 0 rows** (UNIQUE-keyed; case/space-insensitive `ilike` also 0). The customer **never opted into the free tier** via the landing/`/welcome` email capture. No email-bearing path existed pre-subscribe.
2. **`funnel_events` by the checkout `client_reference_id` (`session_id` col) → 0 rows**; by email/`cs_live_…` in `meta_json` → 0; the **entire table holds 3 rows all-time** (all `first_tool_call_with_track_token`) → no `upgrade_cta_clicked`, no checkout-click mirror. The anonymous `/signup` checkout does not emit a joinable funnel row (known instrumentation gap, CHECKOUT-COMPLETION).
3. **`processed_stripe_events` → 0 rows ever** (all types). The `checkout.session.completed` event for this customer was created 2026-06-07 but the endpoint was subscribed to that type only on **2026-06-08 05:45** (OPS-STRIPE-WEBHOOK-EVENT-SUBSCRIPTION-W1) — *after* this subscribe — so it was never delivered/recorded. Measurement-only gap; entitlement unaffected.
4. **`request_log` → no per-user identity column** (only `session_id` + `ip_hash`; no email/api_key/customer). Stripe does **not** expose the payer's raw IP for a Checkout/Link payment, so there is **no value to hash and match**. 1528 external rows (free 1512 / pro 15 / starter 1) across **188 distinct `ip_hash`** — none attributable to a specific Stripe customer. (The lone `starter` external row cannot be identity-bound to this person.)
5. **`quota_usage` (the free-100 counter)** → 253 `free:%` trackers all-time, keyed `free:<api_key>`. The customer had **no api key before subscribing** (provisioned only at `subscription.created`), so **zero** of those trackers can belong to their pre-subscription self.

**Structural conclusion (honest, not guessed):** there is **no first-party bridge** from this paid customer back to any pre-`created` free-usage record — quota consumption is **unmeasurable** for this user. The independent corroborating signals — untagged `direct` acquisition, `0` `upgrade_cta_clicked` all-time, `0` in-window callers near the 75/90/100 free ceiling (CHECKOUT-COMPLETION, same window), no `signup_emails` opt-in, and a ~46 s checkout-to-paid via Link — indicate a **cold, intentional subscribe**, **not** a quota-exhaustion conversion. No number is asserted because none is sourceable.

---

## R6 — Rail + extras

- **Rail = Stripe** (livemode), card-network payment via **Stripe Link**; **NOT x402/USDC-on-Base** (x402 is wallet-anonymous and would not carry an email — `processed_x402_payments` is irrelevant to an email-resolved customer).
- **Entitlement / welcome email:** `handleSubscriptionCreated` (`src/lib/stripe.ts:218`) → `generateApiKey()` (`:236`) → `customers.update` metadata `{api_key, tier}` (`:237`) → `sendWelcomeEmail()` inside try/catch (`:249`, never rethrows). `has_api_key=true` proves the provisioning block ran and the welcome-email branch (`email` non-null) was entered → **welcome email was attempted**. Its delivered-vs-Resend-catch outcome is **not** verifiable from current container logs (the container restarted 2026-06-08 06:09 UTC, post-dating the 2026-06-07 01:49 provisioning). No first-party send-status row exists; reported honestly as "attempted, outcome not log-verifiable now."
- **Outbound alert webhooks:** none (`webhook_subscriptions` = 0 rows system-wide).
- **Billing health:** first invoice `…-0001` `paid` $9.99, `amount_remaining=0`, `billing_reason=subscription_create`; `delinquent=false`; `cancel_at_period_end=false` → renews. (`current_period_start/end` are `null` at the subscription top-level under Stripe api `2026-03-25.dahlia`, which relocates period fields to the item level — an API-version artifact, not missing data; the monthly period runs from 2026-06-07.)
- **Merchant-side note:** `invoice.account_country=MY`, charge settles in **MYR** (`balance_transaction.exchange_rate≈4.029`) — this describes **AlgoVault's** Stripe account (Malaysia), **not** the payer; the payer is US.

---

## Unknowable / not first-party measurable (explicit)

- **Pre-subscription free-call count** — no identity bridge (anonymous `/signup`, no free api key, no `signup_emails` opt-in, no Stripe IP to hash). Unmeasurable by construction.
- **Exact device / browser / IP** — Stripe does not expose the Checkout payer's raw IP or user-agent on first-party objects; **no IP was fabricated**. Geo is reported as **card/Link-instrument + billing country = US**, never as a precise IP geolocation.
- **Welcome-email delivery outcome** — attempted (code path proven); delivered-vs-error not log-verifiable post container restart.
- **Whether the lone external `starter` `request_log` row is this customer** — not identity-bindable.

---

## Reproduction (read-only)

```bash
# Stripe (in MCP container; key never leaves host):
scp probe.mjs root@204.168.185.24:/tmp/ && \
ssh root@204.168.185.24 'docker cp /tmp/probe.mjs crypto-quant-signal-mcp-mcp-server-1:/tmp/p.mjs && \
  docker exec crypto-quant-signal-mcp-mcp-server-1 node /tmp/p.mjs <subscriber-email>'
#   probe.mjs: customers.list({email}) → subscriptions / charges(expand payment_method_details)
#   / checkout/sessions?customer / invoices / events; has_api_key emitted as BOOLEAN (key never printed);
#   payment_methods/<pm_id> for Link/card issuing country.
# Postgres (read-only, postgres container — mcp image has no psql):
ssh root@204.168.185.24 'docker exec crypto-quant-signal-mcp-postgres-1 \
  psql -U algovault -d signal_performance -f /tmp/q.sql'
#   q.sql: signup_emails by email; funnel_events by session_id/meta_json; processed_stripe_events
#   by customer_email/session_id; request_log + webhook_subscriptions + quota_usage schema/counts.
```
