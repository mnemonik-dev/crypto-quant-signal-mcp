# OPS-STRIPE-WEBHOOK-EVENT-SUBSCRIPTION-W1 — Plan-Mode endpoint-truth (Step 0)

**Wave:** subscribe the live Stripe webhook endpoint to `checkout.session.completed` (config-only) + ship a drift canary.
**Mutation class:** **WRITE to a live revenue-critical Stripe config** (+ host-side canary cron). NOT a container deploy (zero `src/` change).
**Canonical clone:** `/Users/tank/code/crypto-quant-signal-mcp` @ `origin/main 0870214`.
**Risk markers:** external first-use (live Stripe config write) + cited identifier. Plan-Mode required.
**Outcome:** 0 fictional; Step-0 clean (exactly 1 endpoint, expected events, key present); **PROCEED with a gated read→union→write + auto-rollback.**

## ⚠️ Load-bearing constraint
Stripe's `POST /v1/webhook_endpoints/{id}` **replaces the entire `enabled_events` array** (verified). Posting only `checkout.session.completed` would DROP `customer.subscription.created`/`.deleted` → break API-key provisioning (entitlement). The write MUST be **read → union → write**, and verified to retain the entitlement events, with rollback to the captured original on any gate failure.

## Step-0 probes — `claim | reality | resolution`

| # | Claim | Reality (probe) | Resolution |
|---|---|---|---|
| **P1** | One enabled livemode endpoint at `https://api.algovault.com/webhooks/stripe`; 0 or >1 = HALT. | `GET /v1/webhook_endpoints?limit=100` → **total 1**, the single endpoint `we_1TKJVZKGleoEgU2HdSvmIUIl` at the canonical URL, `status=enabled`, `livemode=true`. No others. | Resolved by URL (not truncated id). No HALT. |
| **P2** | Current `enabled_events == [subscription.created, subscription.deleted]`. | **Exactly that.** `checkout.session.completed` absent. No extra events. | Write needed (not a no-op). Union = those 2 + `checkout.session.completed`. |
| **P3** | Handler processes 3 events. | `git show origin/main:src/index.ts` switch cases (code-derived): `customer.subscription.created`, `customer.subscription.deleted`, `checkout.session.completed` — exactly 3. | Union/canary target = these 3. Do NOT add `checkout.session.created` (no handler case). |
| **P4** | `STRIPE_SECRET_KEY` on host; bounded GET 200. | `sk_live_…` (len 107); GET 200. | Proceed. |

## The write (R1)
- **Rollback capture (original):** `["customer.subscription.created","customer.subscription.deleted"]`.
- **Union to POST:** `["checkout.session.completed","customer.subscription.created","customer.subscription.deleted"]` (entitlement events included by construction).
- **Verification gate (R2):** re-GET must contain ALL 3; if any of the 2 entitlement events is missing post-write → auto-POST the captured original (rollback) + HALT.

## Canary (R3)
- `scripts/check-stripe-webhook-events.mjs` — GETs the live endpoint, asserts `enabled_events ⊇ EXPECTED` (the 3 handler events, kept in sync with the `src/index.ts` switch). Exit 0 clean / 1 drift / 2 canary-error. `--simulate-live "<csv>"` for the dry-run gate (proves non-zero exit on a simulated miss without touching Stripe).
- Alert path: on drift, the host wrapper feeds the body to `/opt/algovault-monitoring/send_telegram.sh` (the gate SoT — severity `CRITICAL_PERSISTENT`, 24h cooldown, fail-open, `DRY_RUN_TG`); recommended-wave in **template form** `OPS-STRIPE-WEBHOOK-EVENT-SUBSCRIPTION-W{NEXT}`. Installed as a **monthly host cron** (off-:00). Tooling confirmed: host node v20, jq 1.7, send_telegram.sh present.

## Tooling / e2e honesty
Stripe CLI **absent** on host → no `stripe trigger` e2e. Per spec, the **config-level proof** (re-GET shows `checkout.session.completed` subscribed) is the primary AC; the next real completion + the canary provide ongoing assurance. Not faking an e2e gate.

## system-map impact
**Y** — the canary cron is a NEW host-side monitoring consumer (Stripe webhook-config drift); also the Stripe `checkout.session.completed` → `/webhooks/stripe` handler → `processed_stripe_events`/`request_log` measurement edge becomes LIVE (was config-dormant). Enumerate both.

## Persistence
No container deploy. Canary script committed (per-file add → local commit → push) + scp'd host-side + cron. Stripe write is live API (independent of the GitHub flag).
