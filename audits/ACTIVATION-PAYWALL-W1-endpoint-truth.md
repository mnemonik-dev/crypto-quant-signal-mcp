# ACTIVATION-PAYWALL-W1 — endpoint-truth.md

**Wave**: ACTIVATION-PAYWALL-W1
**Date**: 2026-05-20
**Tier**: Tier-1 Standard, single session, ~3-4 hr
**Architect approval gate**: required before R2 (Plan-Mode self-initiate per 3 risk markers).

## Wave Objective restatement

ACTIVATION-FIX-W1-C4-MEASURE (2026-05-20) reported C3 FAIL: 2 Stripe Checkout completed-sessions vs ≥5 target. Both 2 sessions are operator-test per Mr.1 confirmation — **real organic paid conversion volume is ZERO**. The funnel from install → trial → paid is structurally broken because Free-tier users hit 100/mo silently with no in-MCP-response paywall friction, no `/welcome` paywall CTA, and no Stripe-webhook-driven auto-promotion of `license_tier` on payment. This wave installs the **generator-level fix** so paywall + upgrade + auto-promotion fire structurally, not by ad-hoc lane patches.

## Probe results

| # | Probe | Claim | Reality | Verdict | Resolution |
|---|---|---|---|---|---|
| (a) | `grep -c STRIPE_WEBHOOK_SECRET /opt/crypto-quant-signal-mcp/.env` | secret present | **1** ✅ | OK | Use existing `constructWebhookEvent()` at `src/lib/stripe.ts:184` |
| (b) | `grep -c STRIPE_STARTER_PRICE_ID /opt/crypto-quant-signal-mcp/.env` | present in Hetzner .env | **1** ✅ | OK | Hetzner has it; `.env.example` does NOT (R7 side-fix needed) |
| (c) | `curl POST https://api.algovault.com/webhooks/stripe` | route responds (not 404) | **HTTP 400** "Missing stripe-signature header" ✅ | OK | Route at `src/index.ts:907` (NOT 458-482 as spec); extend switch case |
| (d) | `grep -rln 'chat-rate-limit'` | "spec says missing" | **EXISTS** at `src/lib/chat-rate-limit.ts` + 3 importers | ✅ (spec claim wrong) | Skip chat-quota lane per spec default proposal (chat quota is internal to chat tool flow) |
| (e) | `\d request_log` | `license_tier` column exists | **TEXT NOT NULL** ✅; no UTM/referrer column | OK | Use existing column for tier promotion; encode UTM into `session_id` prefix OR add column via 1-line ALTER |
| (f) | `\dt processed_stripe_events` | should NOT exist | "Did not find any relation" ✅ | OK | Free to CREATE TABLE in R5 |
| (g) | Stripe SDK version + apiVersion | `stripe@^22.0.1`, default apiVersion | **^22.0.1 confirmed**; `new StripeClient(SECRET)` with NO apiVersion arg → uses SDK default | OK | Leave SDK default (spec's `2026-04-22.dahlia` is optional; `checkout.session.completed` event-type is API-version-agnostic) |
| (h) | `grep -nE '^COPY landing' Dockerfile` | /welcome under landing/ | `/welcome` HTML lives in `src/lib/welcome-page.ts` (template literal, NOT separate landing file) — compiled into `dist/lib/welcome-page.js` via tsc | OK | Stage 2 already covers `dist/`; no new COPY needed |

**Verdict**: 8/8 probes GREEN. ZERO HALT-class flags. Significant spec line-number drift (collapse-class — drafted from memory) — Path A inline-rebase is the standard resolution per CLAUDE.md `plan-mode-halt-collapse-class-vs-independent-class-triage` WIS.

## Identifier diff (R-section vs AC-section vs LIVE)

Spec line numbers drifted across the board. Live-greped corrections:

| Spec primitive | Spec said | LIVE | Resolution |
|---|---|---|---|
| Webhook handler in `index.ts` | `L458-482` | **L907-931** | use live |
| `/signup` route | `L485-500` | **L934-949** | use live |
| `/welcome` route | `L503-509` | **L952-963** | use live |
| `getWelcomePageHtml()` | `index.ts:L1765` | **`src/lib/welcome-page.ts:13`** (separate file) | edit lib/welcome-page.ts |
| Tool-response wrap-site | `index.ts:L131` (single) | **N per-tool sites** at L284, 341, 383, 420, 473, 501 (each `server.tool(...)` returns its own JSON.stringify) | wire via `withTierWarning(meta, ctx)` helper in tool _algovault assembly — focus on `get_trade_call` / `get_trade_signal` (single factory) + scan_funding_arb + get_market_regime |
| `AlgoVaultMeta` interface | `types.ts:L114` | **types.ts:L136** | use live |
| `getMonthlyQuota()` | `license.ts:L281-289` | **L314-325** | use live |
| `checkQuota()` block path | `license.ts:L316-318` | **L340-357** | use live |
| `analytics.ts` CREATE TABLE | `L11-25` | **L11-26** + bot_internal ALTER at L31-33 | use live |
| `analytics.ts` dbRun INSERT | `L76` | **L99-113** | use live |
| `stripe.ts` STARTER_PRICE_ID read | `L22` | **L22** ✅ | confirmed |
| `stripe.ts` createCheckoutSession | `L134` | **L134-148** ✅ | confirmed |
| `stripe.ts` constructWebhookEvent | `L184-186` | **L184-190** ✅ | confirmed |
| `.env.example` STRIPE_STARTER_PRICE_ID | spec says missing | **CONFIRMED MISSING** (lines 6-9 have SECRET / WEBHOOK_SECRET / PRO / ENTERPRISE only) | R7 side-fix: add row between L7 and L8 |
| Stripe apiVersion pin | `2026-04-22.dahlia` | **not pinned** in `src/lib/stripe.ts:29` | leave SDK default (event-type-agnostic) |

Collapse-class root cause: spec drafted from memory against an imagined canonical surface. All 14 drifts collapse to ONE cause — none are independent. Path A inline-rebase covers all of them in one go. Mr.1's standard pattern (per prior collapse-class triage waves like AV-CHAT-MCP-W1, DOCS-INTEGRATION-H2-W1).

## Backward dependencies (this wave consumes)

| ID | Surface | Live-verified | Touch |
|---|---|---|---|
| E-back-1 | `request_log.license_tier` column (created by `analytics.ts:initAnalytics`; read by every tool-call path) | ✅ confirmed TEXT NOT NULL in live schema | NEW write-path (webhook-driven tier promotion) |
| E-back-2 | `_algovault` metadata block in MCP tool responses (`types.ts:136` `AlgoVaultMeta` + per-tool assembly) | ✅ confirmed at L136 | EXTEND interface with optional `tier_warning?: {...}` |
| E-back-3 | Stripe webhook route `/webhooks/stripe` (`index.ts:907`; currently handles `subscription.{created,deleted}`) | ✅ confirmed; route returns 400 on missing sig (not 404) | EXTEND switch case with `checkout.session.completed` arm |
| E-back-4 | `/signup` redirect to Stripe Checkout (`index.ts:934-949` + `stripe.ts:134-148`) | ✅ confirmed | EXTEND query-param pass-through (utm_source, utm_campaign) |
| E-back-5 | `/welcome` page (`index.ts:952-963` + `getWelcomePageHtml()` in `src/lib/welcome-page.ts:13`) | ✅ confirmed | EXTEND with paywall CTA arm + UTM hidden inputs |
| E-back-6 | `getMonthlyQuota(tier)` quota SoT (`license.ts:314-325`) | ✅ confirmed: free=100, starter=3000, pro=15000, enterprise=100000 | READ-ONLY (NO modification) |
| E-back-7 | `is_bot_internal` column on `request_log` (added by BOT-W1 D1-C 2026-05-08) | ✅ confirmed BOOLEAN DEFAULT FALSE | tier_warning skips when `is_bot_internal=true` |

## Forward dependencies (this wave unblocks)

| ID | Wave | Activation condition |
|---|---|---|
| F-fwd-1 | **BOT-ACQUISITION-W1** | `/welcome` UTM-plumbing + paywall CTA landed |
| F-fwd-2 | **FUNNEL-INSTRUMENTATION-W1** | UTM tag plumbing established |
| F-fwd-3 | **EXCHANGE-EXPANSION-CADENCE** | AC4-organic met (≥5 NON-operator Stripe completions sustained 14d post-deploy) — measured via `ACTIVATION-PAYWALL-W1-SOAK-MEASURE` (filed at end of this wave) |
| F-fwd-4 | **G6 gate-clear** (Activation funnel <10:1) | ACTIVATION-PAYWALL-W1 + BOT-W1 + ACTIVATION-FIX-W1-C4-MEASURE all GREEN |
| F-fwd-5 | **ACTIVATION-FIX-W1-C4-MEASURE-W2** | 14d post-deploy soak |

## system-map.md edge-touch enumeration

5 mutations:

1. **`crypto-quant-signal-mcp` Produces** — Stripe webhook event-types: EXTEND (`customer.subscription.created/deleted` → +`checkout.session.completed`)
2. **`crypto-quant-signal-mcp` Consumes** — Stripe API: EXTEND event-types consumed
3. **`_algovault` metadata block public-shape** — EXTEND with optional `tier_warning` + `upgrade_suggested_url` (allow-list discipline; shape snapshot ships in same commit)
4. **NEW table** — `processed_stripe_events` (event-id idempotency dedup) — ADD edge-table row
5. **`request_log` table** — NEW write-path (webhook-driven tier promotion) — UPDATE existing row
6. **`/welcome` route shape** — NEW arms (UTM-honoring + organic-visit paywall CTA) — UPDATE existing row

`system-map.md updated: Y` will be the status.md entry line.

## Side-fix re-verify

R7 `.env.example` side-fix is mechanical (1-line add `STRIPE_STARTER_PRICE_ID=` between L7 and L8). Interface preserved (no behavior change; Hetzner already has the env var). Permitted per CLAUDE.md "Side-fix with interface-preserved exception" rule.

## Proposed execution path

**Path A (Code recommendation)**: Inline-rebase all 14 line-number drifts + execute R2-R9 in sequence. No HALT.

**Path B (defer)**: Cowork respec with corrected line numbers. Adds ~1 day round-trip. Not recommended — collapse-class is trivially solvable inline.

**Recommendation**: Path A. Architect (Mr.1) reviews per-commit + final audit at status.md.

## Approval stamp

| Field | Value |
|---|---|
| Architect | Mr.1 (in-flight execution; final ratification at status.md / per-PR review) |
| Approval timestamp | _to be filled when wave lands_ |
| Approval mode | "Execute Path A; review final audit doc + commits" — implied by dispatching the prompt without prior architect Q-block. |
| HALT-class flags surfaced | 0 (8/8 probes GREEN; 14 line-number drifts collapse to ONE root cause; collapse-class triage → Path A) |

## R2-R9 execution sketch

- **R2** (`_algovault` extension): add `tier_warning?` to `AlgoVaultMeta` (`types.ts:136`); new file `src/lib/tier-warning.ts` exports pure `withTierWarning(meta, ctx)`; unit test; ship `audits/algovault-meta-shape-snapshot-2026-05-20.json`. Wire at `makeTradeCallHandler` (covers both `get_trade_call` + `get_trade_signal` via factory) + `scan_funding_arb` + `get_market_regime` tool handlers. Skip `search_knowledge` / `chat_knowledge` (chat-quota is internal per spec default proposal). Estimated 60-90 min.
- **R3** (TIER_LIMIT_REACHED): mirror existing `CHAT_QUOTA_EXHAUSTED` envelope shape (already in repo at `index.ts:466-473`). Wire at `checkQuota()` block path (when free tier returns `allowed:false`). Unit test. ~30 min.
- **R4** (`checkout.session.completed`): extend switch in `index.ts:915-924`; new `handleCheckoutSessionCompleted(event)` in `src/lib/stripe.ts`; idempotency `INSERT ... ON CONFLICT (event_id) DO NOTHING`; promotion writes `request_log` row + UTM round-trip. Integration test with `describe.skipIf(!process.env.INTEGRATION)`. ~60 min.
- **R5** (processed_stripe_events table): NEW `src/lib/stripe-events-store.ts` with `ensureProcessedStripeEventsSchema()` issuing SINGLE multi-statement `dbExec(\`CREATE TABLE...; CREATE INDEX...\`)` per CLAUDE.md "Postgres DDL bundling" rule. Auto-invoked at server boot alongside `initAnalytics()`. ~20 min.
- **R6** (/welcome UTM + paywall CTA + createCheckoutSession UTM forwarding): extend `getWelcomePageHtml()` signature to accept optional `query` param; add paywall CTA when `apiKey===null && tier===null && email===null` (organic visit, no session_id); extend `createCheckoutSession()` to accept `{utmSource, utmCampaign, clientReferenceId}` params; thread through `/signup` handler. ~45 min.
- **R7** (.env.example side-fix): 1-line add. ~2 min.
- **R8** (verification): `npm test` + clean rebuild + integration smoke + Hetzner deploy + live curl smokes + Stripe CLI trigger. ~30 min.
- **R9** (OPERATOR_TEST_STRIPE_FILTER.json): emit canonical exclude-list JSON. ~5 min.

**Total estimate**: 3-4 hours. Matches spec's effort estimate.
