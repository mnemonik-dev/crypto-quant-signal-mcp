# ACTIVATION-PAYWALL-W1-SOAK-MEASURE — 14-day organic paid-conversion soak (FINAL)

**Wave:** ACTIVATION-PAYWALL-W1-SOAK-MEASURE — read-only, zero production mutation.
**Run:** 2026-06-08 03:06 UTC (box clock); audit dated **2026-06-07** per AC.
**Measured by:** `scripts/measure-activation-soak.mjs` (R6), executed inside the live MCP container `crypto-quant-signal-mcp-mcp-server-1` on Hetzner (`STRIPE_SECRET_KEY` never left the container).
**Plan-Mode Step-0:** `audits/ACTIVATION-PAYWALL-W1-SOAK-MEASURE-endpoint-truth.md` — 0 fictional primitives; 2 inline-resolved drifts; no HALT.

---

## Verdict (AC4-organic — primary 14-day window)

> **🛑 AC4-ORGANIC FAIL — EXCHANGE-EXPANSION-CADENCE NOT GREEN-LIT.**
> **0** NEW non-operator paid Stripe Checkout completions in the pre-registered 14-day window.

This is the FAIL bucket of the pre-registered 3-way gate (`≥5 → PASS`, `1–4 → PARTIAL`, `0 → FAIL`). The window was honored exactly as pre-registered — no goalpost-moving.

**Factuality correction to the template's hypothesized cause (CLAUDE.md LAW #1 + "measured-not-assumed"):** the pre-registered FAIL template reads *"Either the paywall is invisible OR no organic interest."* **The measured data falsifies that clause** and it is therefore NOT asserted:
- **27** Stripe Checkout sessions were **created** inside the window (≈1.9/day) → the paywall is **demonstrably visible** and producing checkout *starts*.
- **1** organic paid completion landed **4 days past** the window (2026-06-03→08, $9.99, untagged) → organic interest **does** convert.
- The binding constraint is therefore **checkout-start → paid-completion**, NOT visibility or absence of interest.

---

## Window (pre-registered — honored exactly)

| Bound | Epoch | UTC datetime |
|---|---|---|
| `created[gte]` | `1779262200` | **2026-05-20 07:30:00 UTC** (deploy moment of `d528ca5`) |
| `created[lte]` | `1780471800` | **2026-06-03 07:30:00 UTC** (deploy + 14d) |
| span | `1209600 s` | **14 days** (verified) |

Both `created.gte`/`created.lte` are valid integer filters on `GET /v1/checkout/sessions` (probed: HTTP 200).

---

## Primary-window funnel (R1 → R2 → R3)

| Stage | Count | Notes |
|---|---|---|
| **R1 raw N** (sessions created in-window) | **27** | 1 Stripe page; `has_more=false` after page 1 |
| **R2 paid filter** (`status=='complete' AND payment_status=='paid'`) | **0** | None of the 27 reached `complete`+`paid` |
| **R3 operator-excluded M** | **0** | by_email 0 · by_session_id 0 · by_utm_source 0 · by_utm_campaign 0 |
| **Organic** (paid − excluded) | **0** | — |

**R2 `payment_status='paid'` enforcement (correctness):** Stripe doc — `status=complete` only means *checkout finished*; "payment processing may still be in progress." A session counts **only** when `status=='complete'` **AND** `payment_status=='paid'` (`payment_status ∈ {paid, unpaid, no_payment_required}`). Filtering on `status` alone over-counts. The very first in-window session probed was `{status:expired, payment_status:unpaid}` — correctly excluded.

**R3 schema-adaptive exclusion (keys the filter file ACTUALLY exposes):** emails (3) + known operator session-ids (2) **always**; `operator_metadata_markers.utm_source` (4) + `utm_campaign` (3) **applied because the keys are present** (the spec narrative's claim that they were absent was incorrect — see endpoint-truth §P1). Test-card brand step **skipped** — live mode (`sk_live_…`) rejects test cards and `card.brand` is not on the Checkout Session object (it lives on the PaymentIntent charge). With 0 paid sessions, M is trivially 0; the exclusion machinery is nonetheless wired and proven on the secondary window's session (which matched no operator rule).

---

## Per-source attribution (R5 — `utm_source` × count × revenue)

**Primary window:** no organic sessions → table empty.

| utm_source | sessions | revenue |
|---|---|---|
| _(none — 0 organic in primary window)_ | 0 | $0.00 |

Organic source vocabulary (disjoint from operator markers): `mcp_tool` (in-MCP tier-limit click-through), `welcome_page` (/welcome CTA), `direct` (/signup), `(none)` (untagged).

---

## R4 corroboration — `processed_stripe_events` + `request_log` (read-only, Postgres `signal_performance`)

| Probe | Count |
|---|---|
| `processed_stripe_events` total (all event types, all time) | **0** |
| …distinct `event_type`s | **0** |
| `checkout.session.completed` total | **0** |
| `checkout.session.completed` in-window | **0** |
| `checkout.session.completed` post-window (≥06-03 07:30) | **0** |
| `request_log[tool_name='stripe_checkout_completed']` total | **0** |
| `request_log[...]` in-window | **0** |

**Stripe↔DB consistency for the primary window:** consistent at **0** (Stripe 0 paid ⇔ DB 0 recorded).

**⚠️ Separate instrumentation finding (out of this wave's scope, flagged for follow-up):** `processed_stripe_events` holds **0 rows of any type, ever**, and `request_log` has **0** attribution rows — **despite** the real post-window paid completion below. The shipped `checkout.session.completed` webhook handler (`src/lib/stripe.ts`, `src/index.ts:~1080`) + idempotency store (`src/lib/stripe-events-store.ts`) are **recording nothing**. Most likely causes: (a) the Stripe Dashboard webhook **endpoint is not registered** to the production URL, or (b) signature verification is failing so the handler 400s before `tryClaimEvent`. This blinds the funnel-snapshot `stripe_checkout_started`/completed metrics and the AC4 DB-side corroboration. Entitlement-grant path was **not** evaluated here (license resolution likely reads live Stripe subscription state, separate from these attribution rows) — to be confirmed by the follow-up.

---

## Secondary post-window line (informational ONLY — excluded from the verdict)

Window `2026-06-03 07:30:00 UTC → 2026-06-08 03:06:23 UTC` (deploy+14d → run time):

| Stage | Count |
|---|---|
| raw N (created) | 11 |
| paid + complete | **1** |
| operator-excluded | 0 |
| **organic** | **1** |

- Session `cs_live_a1hvV1Kr0OjBPd5At8CbZUkE6zrw8swrzemcv8JgJpl1wytnC7OjUWsgPk`, `utm_source=(none)`, **$9.99** (starter tier).
- **Explicitly does NOT count toward the AC4 verdict** (completed after the pre-registered window closed). Recorded here because it materially informs the diagnosis: organic paid conversion *is* achievable; the 14-day window simply closed ~4 days before it landed.

---

## Next steps (corrected from the template on measured evidence)

1. **ACTIVATION-PAYWALL-W2** — scope to the **actual** binding constraint: **checkout-start → paid-completion** friction (27 starts → 0 in-window paid). NOT a "paywall visibility" audit (visibility is proven by the 27 starts).
2. **Stripe webhook recording repair** (separate, likely higher priority) — investigate why `processed_stripe_events` is empty despite a real paid completion: verify the Dashboard webhook endpoint registration + signature secret + delivery logs. Until fixed, all DB-side funnel/attribution instrumentation for paid conversions is blind.

**EXCHANGE-EXPANSION-CADENCE remains DEFERRED** on the revenue gate (per ToDoList line ~1029), unless the operator architect-overrides on the "ship venues anyway, paid conversion is a separate concern / moat layer 4 cross-venue" basis.

---

## Reproduction (Pillar 3 — reusable primitive)

```bash
# inside the MCP container (STRIPE_SECRET_KEY present; key never leaves the host):
docker cp scripts/measure-activation-soak.mjs crypto-quant-signal-mcp-mcp-server-1:/tmp/m.mjs
docker cp audits/OPERATOR_TEST_STRIPE_FILTER.json crypto-quant-signal-mcp-mcp-server-1:/tmp/filter.json
docker exec crypto-quant-signal-mcp-mcp-server-1 \
  node /tmp/m.mjs --gte 1779262200 --lte 1780471800 --filter /tmp/filter.json --json
# next soak/cohort: re-run with new --gte/--lte (and append new operator session-ids to the filter file first).
```

R4 corroboration (read-only):
```bash
docker exec -e DBURL="$(docker exec crypto-quant-signal-mcp-mcp-server-1 printenv DATABASE_URL | sed 's/@postgres:/@127.0.0.1:/')" \
  crypto-quant-signal-mcp-postgres-1 sh -c \
  'psql "$DBURL" -tAc "SELECT count(*) FROM processed_stripe_events WHERE event_type='"'"'checkout.session.completed'"'"' AND processed_at >= '"'"'2026-05-20 07:30:00+00'"'"' AND processed_at < '"'"'2026-06-03 07:30:00+00'"'"'"'
```
