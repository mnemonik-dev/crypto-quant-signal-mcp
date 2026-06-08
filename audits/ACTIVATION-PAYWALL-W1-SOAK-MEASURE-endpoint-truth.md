# ACTIVATION-PAYWALL-W1-SOAK-MEASURE — Plan-Mode endpoint-truth (Step 0)

**Wave:** ACTIVATION-PAYWALL-W1-SOAK-MEASURE — 14-day organic paid-conversion measurement (read-only, zero production mutation).
**Run:** 2026-06-07 (audit-doc date per AC; box clock 2026-06-08).
**Canonical clone:** `/Users/tank/code/crypto-quant-signal-mcp` @ `origin/main` `4243d1c` (== latest deployed per status.md 2026-06-07 15:19).
**Risk markers present:** external first-use (live Stripe read) + cross-host read (Hetzner psql) → Plan-Mode required.
**Outcome:** **0 fictional primitives. 2 inline-resolved drifts + 1 data finding (empty corroboration tables). NO HALT condition tripped → PROCEED.**

## Step-0 probes — `claim | reality | resolution`

| # | Claim (spec) | Reality (probe) | Resolution |
|---|---|---|---|
| **Path** | Code checkout at `/Users/tank/crypto-quant-signal-mcp/` (Context §). | That path is a **separate STALE clone** (`origin/main` `65d14a0`, 2026-05-31; local HEAD `74507f3` 2026-05-30). Canonical = `/Users/tank/code/crypto-quant-signal-mcp` (`origin/main`==HEAD `4243d1c` 2026-06-07 == deployed). | Use `/Users/tank/code/…`. Matches memory `reference_canonical_repo_clone.md`. **Flagged.** |
| **P1** | `audits/OPERATOR_TEST_STRIPE_FILTER.json` defines ONLY `operator_emails` / `operator_stripe_session_ids_known_so_far` / `test_card_brands` / `test_card_numbers_documented_at`; **does NOT** define `operator_metadata_markers`. 404 = HALT. | File **EXISTS** on `origin/main`. `jq keys` = `[_meta, consumer_pattern, exclusion_logic, operator_emails, `**`operator_metadata_markers`**`, operator_stripe_session_ids_known_so_far, test_card_brands, test_card_numbers_documented_at, update_cadence]`. `operator_metadata_markers` **IS present** (`utm_source[4]`, `utm_campaign[3]`) + a 5-step `exclusion_logic`. | Spec narrative (§20–21) **under-claimed** the file. R3 is schema-adaptive ("metadata-markers only if the keys exist") → **APPLY** `utm_source`+`utm_campaign` exclusion (the file's own steps 3+4 ARE executable). More conservative (excludes more operator-test). No HALT. **Flagged.** |
| **P2** | `tool_name='stripe_checkout_completed'` literal unverified; fall back to `license_tier` rows if absent. | **PRESENT.** `src/index.ts:1108` writes a `request_log` row `tool_name='stripe_checkout_completed'`, `session_id=cs_*`, `license_tier=<tier>`, `verdict='utm:<src>:<camp>'`. `timestamp = new Date().toISOString()` → **TEXT ISO-8601 UTC** (lexicographically range-filterable). Documented `src/lib/stripe.ts:366-369`. | No fallback needed. R4 `request_log` query: `WHERE tool_name='stripe_checkout_completed' AND timestamp >= '2026-05-20T07:30:00' AND timestamp < '2026-06-03T07:30:00'`. |
| **P3** | `created[gte]`/`created[lte]` valid int filters; expect 200. | **HTTP 200.** `object=list`, `data_len=1`, `has_more=true` (→ R1 **MUST paginate**). Live session keys include `status, payment_status, metadata, customer_details, customer_email, amount_total, currency, livemode, client_reference_id`. First in-window session = `{status:expired, payment_status:unpaid}` → correctly excluded by R2. | Proceed with R1 paginated pull. `jq 'keys'` shape-probe done before deep-path query per `jq-keys-shape-probe-before-deep-path-query` skill. |
| **P4** | Postgres `signal_performance` reachable; expect `1`. | `select 1 = 1` (reachable). PG container `crypto-quant-signal-mcp-postgres-1` (`postgres:16-alpine`); user `algovault` @ `postgres:5432/signal_performance`. **FINDING:** `processed_stripe_events` total=**0**; `checkout.session.completed`=**0**; `request_log[stripe_checkout_completed]`=**0** — corroboration tables **EMPTY**. | Reachable → no HALT. Empty tables ⇒ the webhook/attribution leg has recorded nothing. R4 reports a Stripe↔DB **mismatch IF** Stripe N>0 (instrumentation gap to flag), or **consistency IF** N=0. Verdict driven by the authoritative Stripe-side count (R1–R3), per spec. |

## Stripe secret & mode
- `STRIPE_SECRET_KEY` = `sk_live_…` (len 107) → **LIVE mode**. Confirms the test-card exclusion is a **no-op** (Stripe rejects test cards in live). Do NOT read `session.payment_method_details.card.brand` (absent on the Checkout Session object). Test-card step **skipped** (would require `expand[]=payment_intent.latest_charge`).

## Exclusion plan (R3 — schema-adaptive, keys that ACTUALLY exist)
1. `customer_details.email ?? customer_email`, case-insensitive trim ∈ `operator_emails` `[diophantus.hau@gmail.com, admin@algovault.com, algovaultlabs@gmail.com]`.
2. `session.id` ∈ `operator_stripe_session_ids_known_so_far` (2 `cs_live_` ids).
3. `metadata.utm_source` ∈ `operator_metadata_markers.utm_source` `[operator_test, test_paywall_w1, smoke_test, ci_test]` — **PRESENT → applied.**
4. `metadata.utm_campaign` ∈ `operator_metadata_markers.utm_campaign` `[operator_dev, smoke, soak_test]` — **PRESENT → applied.**
5. test-card brand → **SKIP** (live-mode no-op; field absent on session object).

Organic `utm_source` values (R5, **disjoint** from operator markers): `mcp_tool` (in-MCP tier-limit click-through), `welcome_page` (/welcome CTA), `direct` (/signup), `(none)` (unattributed).

## Paid-filter correctness (R2)
Count ONLY `status == 'complete' AND payment_status == 'paid'`. Stripe doc: `status=complete` means checkout finished — "payment processing may still be in progress"; `payment_status ∈ {paid, unpaid, no_payment_required}`. Filtering on `status` alone over-counts.

## system-map impact
**n-a** — read-only; writes only `scripts/measure-activation-soak.mjs` (new standalone script, no producer→consumer edge) + this/the audit doc + vault `status.md`/`ToDoList.md`. No table, route, MCP tool (`tools/list` unchanged), or response-shape mutated.

## Persistence
`AlgoVaultFi` GitHub flagged (HTTPS push / OAuth / GHA blocked; git-over-SSH deploy key OK; HTTPS **fetch** works — confirmed `git fetch` exit 0). Persist R6+R7 via per-file `git add` → local commit → push via `github-funnel` deploy key; else **defer** (verdict lands in vault `status.md`/`ToDoList.md` regardless — never gated on the code repo reaching origin).
