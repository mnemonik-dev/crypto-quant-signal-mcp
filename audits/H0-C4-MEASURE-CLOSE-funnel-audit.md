# H0-C4-MEASURE-CLOSE — funnel audit (R1) + proposed build plan + HALT for Mr.1

**Target ICP tier:** META (internal ops / conversion measurement) · **Probed:** 2026-07-09 UTC · **Mode:** AUDIT-FIRST · MEASUREMENT-ONLY · MCP-TOOL-SURFACE FROZEN.
**Companion:** [`H0-C4-MEASURE-CLOSE-endpoint-truth.md`](H0-C4-MEASURE-CLOSE-endpoint-truth.md) (primitive `claim|reality|resolution` table) + firewall baseline `H0-C4-MEASURE-CLOSE-toolslist-baseline-2026-07-09.json`.

**Bottom line:** Every data source is live and readable. The wave is genuinely *aggregation + rendering* — and even **more so than the prompt knew**: a standing funnel snapshot library (`generateFunnelSnapshot()`), a subscriber-aggregation library (`aggregateProfiles()`), and two admin surfaces (`/api/admin/funnel-snapshot`, `/admin/subscribers`) **already exist**. `getFunnelScoreboard()` should COMPOSE them, not re-instrument. **BUT** two headline metrics have blocking definitional problems the prompt did not anticipate: (1) **90d retention is structurally uncomputable today** (no cohort is 90d old — prompt R1.3 premise is false), and (2) **the paying-subscriber count conflicts 1-vs-2 across sources** with no ratified canonical. Both need Mr.1 before build. → **5 architect questions in the fenced block at the end.**

---

## R1.1 — The 4 metrics + intent panel: source, computability-today, live value

### Metric 1 — Paying subscribers (by tier)
- **Best source:** Stripe-live `subscriptions.list({status:'active'})` grouped by `price_id → tier` (canonical revenue source per CLAUDE.md "cross-check tier-tagged DB rows against canonical revenue source"). `subscriber_profiles` (`aggregateProfiles()`) = enrichment/cohort layer.
- **Computable today?** Yes (STRIPE_SECRET_KEY present), but the number **conflicts by source**: `subscriber_profiles`=**1** (starter) · bot `linked_tier`=**2** starter · `request_log` distinct paid ip_hash=**2 pro / 1 starter / 1 x402** (all-time; only x402 active last-30d) · Stripe-live=**unverified-but-canonical**. Backcast Part-5 asserts "~1 paying user."
- **Live value:** **1** (subscriber_profiles, active starter, converted 2026-06-07) — pending Q2 canonical decision. → **Q2.**

### Metric 2 — Free-user weekly signups (by channel)
- **Best source:** `signup_attribution` GROUP BY `date_trunc('week', created_at)`, `channel` (the acquisition-attribution spine; has channel + UTM).
- **Computable today?** Yes.
- **Live value:** 162 rows since 2026-06-08; recent weeks ≈ **wk 2026-07-06: 22 · 06-29: 39 (35 direct/4 tg_bot) · 06-22: 44 · 06-15: 32 · 06-08: 25**; channel ≈ 90% `direct`, ~10% `tg_bot`. NOTE: this counts a `/signup` **click**, not a provisioned free key (`free_keys`=6) nor an MCP connection (`mcp_connect`=7183). → definition ratification **Q5.**

### Metric 3 — Free→paid conversion %
- **Best source:** numerator = paying subs (Metric 1); denominator = free signups (Metric 2). Cohorted join = `subscriber_profiles.client_reference_id ↔ signup_attribution` by week.
- **Computable today?** Ratio yes; **cohorted join is near-empty** — the 1 conversion has `attribution_captured=false`, so it doesn't join to a signup cohort (the known identity-bridge gap → follow-up `H0-FUNNEL-IDENTITY-BRIDGE-W1`).
- **Live value:** aggregate ≈ **1 paid / 162 signups ≈ 0.6%** (unattributable at cohort level). → metric-definition ratification **Q4.**

### Metric 4 — Month-3 (90d) retention (by signup cohort)
- **Best source:** for each signup cohort (week), fraction still active at +90d. "Active" = made a tool call (`request_log`/`agent_sessions`) OR still subscribed, in the 90d window.
- **Computable today?** **NO.** Earliest identity cohort = bot 2026-05-08 (~62d) / web-signup 2026-06-08 (~31d). **No cohort has reached 90 days.** First real value: bot **2026-08-06**, web **2026-09-06**. AC4 already anticipates "<90d history → retention null not 0" — that now applies to **every** cohort.
- **Live value:** **null (all cohorts immature).** → what to render **Q1.**

### Intent panel (diagnostic — leading indicators)
- **`upgrade_cta_clicked`** — `funnel_events` event_type. Live: **1 all-time** (2026-06-18). Near-zero → confirms 2026-06-08 diagnosis (constraint = awareness/traffic-quality, not checkout UX). Computable. *(Note: `landing_cta_clicked`=85 is the higher-volume sibling — surface both.)*
- **Free-callers-crossing-quota** — `funnel_events` `quota_hit_soft`=86 / `quota_hit_hard`=64 / `quota_hit_block`=28 (all since 2026-07-04); mirrored per-user in bot `subscribers.quota_hit_*_at`. Computable.
- **Tagged-vs-`direct` traffic split** — `signup_attribution.channel` (`direct` vs `tg_bot`/utm-tagged). Live ≈ 90% direct. Computable. *(Reuse `getIdentityCoverage()`/`getByAuthenticity()` for the connection-side tagged split.)*

## R1.2 — Live schemas / freshness (see endpoint-truth B–C)
- `funnel_events` / `processed_stripe_events` / `request_log` `\d` captured (endpoint-truth B1–B3). **`request_log.timestamp` is TEXT (ISO-Z)** and has **no UTM / no stripe columns** (prompt drift). `processed_stripe_events` is **empty (0 rows)**.
- Snapshot freshness: latest `2026-07-06-auto.json` (3d, fresh), lineage to `2026-04-15` (endpoint-truth C1).
- bot `subscribers` `.schema` captured; 27 rows, linked 2026-05-08→06-07 (C2). x402 log = PG `processed_x402_payments`, 7 rows (B7).

## R1.3 — 90d-retention feasibility
**FAILS the prompt's premise.** The 2026-04-15 first cohort exists only as **aggregate snapshots**, not identity rows. No per-identity cohort is 90d old. → **Q1.**

## R1.4 — Existing `/dashboard` route
Path `/dashboard` (`src/index.ts:1802`); auth `isAdminAuthorized` (Bearer / `?key=` / `av_admin_session` cookie); render `getDashboardHtml()` server HTML; whole block gated on `ADMIN_API_KEY`. **`/dashboard/funnel` copies this verbatim.** (endpoint-truth D1.)

## R1.5 — Attribution coverage (unattributable share — report honestly)
- **Paid completions → free identity:** of 1 conversion, `attribution_captured=false` → **0% of paid completions join a known free-signup cohort.**
- **Checkout STARTS → free identity:** checkout starts are **not recorded** as events at all (no `checkout_started` in `funnel_events`; `processed_stripe_events` records only completions, and is empty). Backcast history cites "47 Stripe checkouts / 0 paid" (2026-04) — starts were counted in the old snapshot lineage, not a live per-identity table.
- **Connection identity coverage** (reusable): `getIdentityCoverage()` reports token/fallback/anon over `mcp_connect`.
- **Resolution:** scoreboard surfaces `unattributable_pct` prominently; the bridge is out-of-scope → follow-up `H0-FUNNEL-IDENTITY-BRIDGE-W1` (prompt-sanctioned).

## R1.6 — Firewall honored
**YES, by construction** (endpoint-truth E1/"Firewall honored?"). HTTP route + `src/lib/` module + DB reads only; no `server.tool`, no `FEATURE_REGISTRY`, no envelope, no manifest/version. `tools/list`=9 unchanged; AC2 re-proves live before/after.

---

## Prompt-Context corrections folded in (drift, not questions)
1. **`request_log` has no `stripe_checkout_completed` and no UTM columns** — it logs the 10 MCP tools + tier + is_automated only. UTM/channel = `signup_attribution`; completions = `processed_stripe_events` (empty) / `subscriber_profiles`.
2. **`processed_stripe_events` is empty (0 rows)** — the `checkout.session.completed` subscription fix (`e6456f4`) is in place, but zero completions have recorded to it; the 1 paying user lives in `subscriber_profiles`.
3. **The data model is richer than Context named** — `subscriber_profiles`, `signup_attribution`, `src/lib/subscriber-attribution.ts` (`aggregateProfiles`), and existing `/admin/subscribers` + `/api/admin/funnel-snapshot` are the real reuse spine (SUBSCRIBER-ATTRIBUTION-SPINE-W1 + ACTIVATION-FUNNEL-AUDIT-W1). → **Q3.**

---

## Proposed build plan (pending Q1–Q5 ratification)

- **R2** `src/lib/funnel-scoreboard.ts` → `getFunnelScoreboard(window?)` — a pure aggregator that **composes** `generateFunnelSnapshot()` + `aggregateProfiles()`/`listSubscriberProfiles()` + new small queries for signup_attribution-weekly + bot state.db + Stripe-live + x402. Returns `{paying_subscribers{by_tier,total,source,reconciliation}, free_signups{weekly[],by_channel}, conversion{pct,cohort[],unattributable_pct}, retention{d7,d14,d30,d90|null,matures_on}, intent_panel{upgrade_cta,landing_cta,quota_hits,tagged_vs_direct}, computed_at, data_freshness, warnings[]}`. Default-deny on NaN/missing (null, never a favorable coercion). Unit-testable (business logic here; route = thin shell).
- **R3** `app.get('/dashboard/funnel')` (HTML via a `getFunnelDashboardHtml()`, `isAdminAuthorized` gate, cookie/redirect identical to `/dashboard`) + `GET /dashboard/api/funnel-scoreboard` (JSON, same gate) backing it. Daily timeseries for funnel/conversion/retention panels (CLAUDE.md mandate).
- **R4** Live-on-load (retention cohorts ≤27 identities → trivial, **no matview**). Optional: append a weekly scoreboard row to the EXISTING `activation-funnel/snapshots/` lineage (no new store, no new cron, no Telegram). → drives the system-map edge determination (Q4).
- **R5** AC2 firewall proof: re-run the 3-step handshake before/after (diff vs baseline JSON) + `git diff` shows no `server.tool`/envelope change + 4-manifest version diff empty.
- **R6** status.md append (newest-first, `system-map.md updated:` line) + flip Backcast Part-5 scoreboard row ("not yet on the wall"→live) + ToDoList C4 residual (line 1003) → retired-into-standing + A1 (line 537) done.

**Firewall / scope self-check:** zero MCP-tool-surface touch · zero version bump · zero public copy · zero Telegram · zero paid-path mutation. All reads. ✅

---

## HALT — architect (Mr.1) ratification required before any build

The following 5 decisions are genuinely Mr.1's (spec/code/defaults don't resolve them). Recommended option is listed first in each. **Copy-paste block for Cowork:**

```
H0-C4-MEASURE-CLOSE — Plan-Mode HALT (5 architect decisions). Audit at
audits/H0-C4-MEASURE-CLOSE-funnel-audit.md (+ endpoint-truth.md). All probed live 2026-07-09.

Q1 [BLOCKING — prompt R1.3 premise is false]. 90d retention is uncomputable today:
    NO signup cohort is 90 days old (earliest = bot 2026-05-08 ~62d; web-signup
    2026-06-08 ~31d; first real 90d value = bot 2026-08-06, web 2026-09-06). The
    "first cohort 2026-04-15" is the aggregate-SNAPSHOT cron start, not identity data.
    Which do you want on the wall now?
      (a) [rec] Ship d7/d14/d30 retention NOW (all computable) + render d90 as
          null-with-"matures 2026-08-06 (bot)/2026-09-06 (web)". Honest, useful,
          satisfies AC4's null-not-0 rule. (Scope-additive: adds the shorter windows.)
      (b) Render ONLY d90 as null-pending (AC1's "4th number" shows null + a date).
      (c) Other.

Q2 [BLOCKING — paying-subscriber source conflict]. subscriber_profiles=1 vs bot
    linked_tier=2 starter vs request_log distinct paid ip=2 pro/1 starter/1 x402 vs
    Stripe-live (canonical, STRIPE_SECRET_KEY present). CLAUDE.md says cross-check
    tier-tagged rows vs the canonical revenue source. Canonical for the headline number?
      (a) [rec] Stripe-live subscriptions.list(status=active) grouped by price->tier,
          read-only, cached ~5min; subscriber_profiles = enrichment/cohort layer; show
          a reconciliation caveat when sources diverge. (Confirm a read-only Stripe call
          on dashboard load is OK under MEASUREMENT-ONLY — it is read-only.)
      (b) subscriber_profiles only (=1; under-counts, no external call).
      (c) Other.

Q3 [scope-shaper]. generateFunnelSnapshot() + /api/admin/funnel-snapshot AND
    aggregateProfiles() + /admin/subscribers ALREADY exist. Confirm getFunnelScoreboard()
    COMPOSES them (no duplicate SQL) and /dashboard/funnel is a NEW additive route, leaving
    the existing admin endpoints intact?
      (a) [rec] Yes — compose + additive new route; existing endpoints untouched.
      (b) Consolidate/replace the existing funnel-snapshot/subscribers admin endpoints.
      (c) Other.

Q4 [metric definition]. Free->paid conversion: the cohort join is near-empty (the 1
    conversion has attribution_captured=false -> joins no signup cohort; identity-bridge
    is the known gap, follow-up H0-FUNNEL-IDENTITY-BRIDGE-W1). Report as:
      (a) [rec] BOTH an aggregate ratio (~1/162 ~= 0.6%) AND the joinable-cohort
          conversion, with unattributable_pct front-and-center. Never hide the weak join.
      (b) Aggregate ratio only.
      (c) Other.

Q5 [metric definition]. "Free-user weekly signups" — which is canonical (they differ ~10x)?
      signup_attribution /signup CLICKS (162, has channel) | free_keys provisioned keys (6)
      | signup_emails opt-ins | mcp_connect sessions (7183, anon reach).
      (a) [rec] signup_attribution by channel = primary "signups"; free_keys/signup_emails
          = secondary "identified free identities" line; mcp_connect = top-of-funnel reach
          line. Label each precisely so they aren't conflated.
      (b) A different single definition (specify).
      (c) Other.

Also confirm: system-map edge = NONE (pure read-view, no new cron/matview) unless you want
a weekly scoreboard row appended to the existing activation-funnel/snapshots lineage (then
+1 read edge). Rec: NONE.
```

**Until Mr.1 answers, NO code, NO commit, NO deploy.** Only these 3 audit artifacts exist (uncommitted, in the fresh worktree). On ratification: V2-RESUME executes R2→R6 with the answers folded into a "Pre-resolved decisions" table; a thin N-probe confirmation gate re-verifies drift; HALT only on NEW drift.
