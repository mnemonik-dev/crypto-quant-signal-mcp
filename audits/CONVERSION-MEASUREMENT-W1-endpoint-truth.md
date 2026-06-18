# CONVERSION-MEASUREMENT-W1 — Plan-Mode Step 0 `endpoint-truth.md`

**Wave:** CONVERSION-MEASUREMENT-W1 — Tier-2 Bulk-Spec (3 ch): funnel instrumentation + best-effort free→paid bridge + PQL scoring
**ICP:** T1 + T2 (paying funnel) · META (internal measurement)
**Author:** Code (Plan-Mode Step 0) · **Date:** 2026-06-18
**Probe targets (live):**
- Deployed: Hetzner `204.168.185.24` · container `crypto-quant-signal-mcp-mcp-server-1` · **v1.20.1** · `PORT=3000` · `ADMIN_API_KEY=SET (len=64)`
- Source: canonical clone `~/code/crypto-quant-signal-mcp` · HEAD `ddb7a87` · working tree **clean** (in sync with deployed)
- DB: `postgres:16-alpine` · container `crypto-quant-signal-mcp-postgres-1` · role `algovault` · db `signal_performance`

> ⚠️ Tooling note: plain `grep` on `src/lib/performance-db.ts` **silently skips the file** (ugrep binary-skip — a non-text byte trips the binary heuristic). All source greps in this probe were re-run with `git grep` / `grep -a`. Codegraph is **NOT** initialized for this repo (`codegraph_status` → "not initialized").

---

## VERDICT: 🛑 HALT — `WAVE1_CH1_HALT: spec premise stale — C1 already shipped & deployed`

**≥3 fictional/stale spec primitives** (CLAUDE.md Plan-Mode: "≥3 fictional primitives → HALT"). The prior wave **ACTIVATION-FUNNEL-AUDIT-W1** (commit `77baa0e`, an ancestor of deployed HEAD `ddb7a87`) **already shipped and deployed** the C1 core: the `funnel-snapshot.ts` data layer, the `GET /api/admin/funnel-snapshot` admin endpoint, and the `recordFunnelEvent` captures for `upgrade_cta_clicked` / `quota_hit_soft|hard|block` / `tg_bot_quota_hit`. Executing C1 **as written** would **recreate a live endpoint and re-wire deployed captures** — a direct violation of the spec's own PRECISION pillar ("build on, do NOT recreate") + the Bulk-Spec Scope Rule + Data-Integrity.

**C2 (bridge columns) and C3 (PQL) are genuine, mostly-additive work** and CAN proceed once C1 scope is corrected. Reduced/corrected scope proposed in §6; architect questions in §7. **No state mutated. Awaiting architect ratification.**

---

## 0. System-map edge-touch enumeration (Step 0)

Touched components are **already mapped** by prior waves; this wave's deltas are mostly additive:

| Component | Existing edges (already in system-map) | This wave's delta |
|---|---|---|
| `funnel_events` (pg) | `client → X-AlgoVault-Track-Token → funnel_events` (TG-BROADCAST-STACK-W1 C6); writers in `index.ts` / `tier-warning.ts` / `license.ts` / `track-token.ts` via `recordFunnelEvent` (perf-db.ts:1007); reader `funnel-snapshot.ts` | **C1:** +1 new `event_type` value `first_non_hold_verdict` (no schema change) |
| `subscriber_profiles` (pg) | producer `checkout.session.completed` (`index.ts:1074`) → `buildSubscriberProfile`; consumer `/api/admin/subscribers` (SUBSCRIBER-ATTRIBUTION-SPINE-W1) | **C2:** +5 columns (additive); `buildSubscriberProfile` gains read edges → `request_log` / `signup_emails` / `signup_attribution` (bridge resolver) |
| `/api/admin/funnel-snapshot` | `generateFunnelSnapshot()` → admin HTTP (ACTIVATION-FUNNEL-AUDIT-W1) | **C3:** surface a `pql_candidates` cohort in the SAME endpoint (no new route) |
| `pql_candidates` | — (does not exist) | **C3:** NEW pg view; producer = query over `subscriber_profiles` + `funnel_events` + `request_log`; consumer = funnel-snapshot endpoint |

`system-map.md` update is **deferred to execution** (same commit as code, per the spec) — no edge is mutated at Step 0.

---

## 1. Live `\d` probes (the mandated Step-0 probe)

### `\d funnel_events` (3 rows; all `event_type='first_tool_call_with_track_token'`)
```
 id           integer    PK   nextval('funnel_events_id_seq')
 event_type   text       not null
 ts           timestamptz not null  default now()
 session_id   text
 chat_id      bigint
 license_tier text
 meta_json    text
Indexes: pkey(id); idx_event_type(event_type); idx_session_id(session_id) WHERE session_id IS NOT NULL; idx_ts(ts)
```
**⛔ The spec's "What ALREADY EXISTS" column list for `funnel_events` is FICTIONAL.** Spec claims columns `utm_*, client_reference_id, first_tool_call_with_track_token, upgrade_cta_clicked`. **None exist.** Those are either `event_type` *values* (`first_tool_call_with_track_token`, `upgrade_cta_clicked`) or columns of a *different* table (`signup_attribution` holds `utm_*` + `client_reference_id`). The real schema is the event-row shape above.

### `\d subscriber_profiles` (1 row)
```
 customer_id PK · created_at · email · name · subscription_id · tier · status · amount_usd numeric(10,2)
 currency · channel · country · country_source · client_reference_id · signup_at · converted_at
 latency_seconds int · cold_subscribe bool · attribution_captured bool · risk_level
Indexes: pkey(customer_id); idx_converted_at(converted_at DESC)
```
The 1 row: `cus_UepU…` · tier=`starter` · status=`active` · channel=`direct` · `cold_subscribe=TRUE` · `attribution_captured=FALSE` · client_ref=`direct:1780796896353:…` · converted `2026-06-07`. (The "COLD `/signup`" the spec references.)

### `\d request_log` (44,554 rows)
```
 id PK · timestamp text · session_id · tool_name not null · asset · timeframe
 license_tier not null · response_time_ms · verdict · confidence · ip_hash · is_bot_internal bool default false
Indexes: pkey(id); idx_external_ts(timestamp) WHERE is_bot_internal=false
```
External (`is_bot_internal=false`): **692 distinct sessions, 269 distinct ip_hashes.** Verdict distribution: `HOLD=1014`, `null=821`, **`BUY=16`, `SELL=2`** → only **18 non-HOLD verdicts ever served** (the aha signal C1's `first_non_hold_verdict` would capture).

### Join tables (confirmed present, schema read)
`signup_attribution` (28 rows; `client_reference_id` PK, `utm_*`, `referrer`, `landing_path`, `tier_requested`, `ip_hash`, `user_agent`) · `signup_emails` (1 row; `email` UNIQUE, `source`, `optin_*`) · `quota_usage` (265 rows; `tracker_key` PK = `free:<ipHash>` etc., `call_count`, `period_start`) · `processed_stripe_events` (`event_id` PK, `event_type`, `session_id`, `customer_email`, `amount_total`, `metadata`).

---

## 2. `information_schema.columns` pre-check (C2 ADD COLUMN idempotency)

C2's 5 target columns on `subscriber_profiles` — **NONE exist** (clean add):
`pre_conversion_calls` ❌ · `pre_conversion_sessions` ❌ · `time_to_first_call_s` ❌ · `peak_quota_pct` ❌ · `bridge_confidence` ❌
→ C2 is genuine additive work. Use `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+ supports it; this is pg16) — pre-apply via SSH then deploy code with idempotent guards (CLAUDE.md `Pre-apply schema via SSH then deploy`).

`pql_candidates` relation: `SELECT count(*) FROM pg_class WHERE relname='pql_candidates'` → **0** → C3 is genuine new work.

---

## 3. Drift table — `claim | reality | resolution` (≥3 fictional → HALT)

| # | Spec claim | Live reality | Class |
|---|---|---|---|
| 1 | "the **never-run** spec `activation-funnel-audit-w1.md`" is the C1 blueprint (line 12) | **RAN & DEPLOYED** as `77baa0e` ("…14 stages + admin endpoint + leak detector + event captures"); ancestor of deployed HEAD `ddb7a87` (v1.20.1) | **STALE** |
| 2 | C1: "+ **NEW** `GET /api/admin/funnel-snapshot` endpoint (per-stage counts + weakest transition + 24h-retention)" | **ALREADY EXISTS & DEPLOYED** — `index.ts:1513`, `isAdminAuthorized`-gated, returns 14-stage `funnel` + `stage_retentions` + `weakest_stage_transition`, `?window=24h\|7d\|14d\|30d\|all_time` (default 14d). Reuses the `/admin/subscribers` auth pattern the spec asked me to reuse. | **FICTIONAL-NEW** (recreation risk) |
| 3 | C1: "4 funnel events **never fire**" (`upgrade_cta_clicked`, `quota_hit_soft/hard`, `tg_bot_quota_hit/upgrade_clicked`) | Captures **WIRED & DEPLOYED**: `upgrade_cta_clicked` (`index.ts:1300`, fires on `/signup?upgrade_from=`), `quota_hit_soft\|hard` (`tier-warning.ts:110`), `quota_hit_block` (`license.ts:499`), `tg_bot_quota_hit` (bot `alerts.log`). **0 DB rows = the leak itself** (no free session has crossed 75% quota or clicked the CTA), NOT un-wired code. `tg_bot_upgrade_clicked` was **explicitly deferred** to `OPS-FUNNEL-STRIPE-PIXEL-W1` by the prior wave (`funnel-snapshot.ts:83`). | **STALE / MISLEADING** |
| 4 | "What ALREADY EXISTS": `funnel_events (… utm_*, client_reference_id, first_tool_call_with_track_token, upgrade_cta_clicked)` | Real cols: `id, event_type, ts, session_id, chat_id, license_tier, meta_json`. The named "columns" are `event_type` **values** or `signup_attribution` columns. | **FICTIONAL** (schema) |
| 5 | C1: `quota_hit_soft (≥80%)`, `quota_hit_hard (≥90%)` | Deployed `SOFT_THRESHOLD=0.75`, `HARD_THRESHOLD=0.90` (`tier-warning.ts:20-21`). Soft is **75%, not 80%**. | **DRIFT** (threshold) |
| 6 | Map Anchor: "+ NEW `/api/admin/funnel-snapshot` endpoint" | Not new (see #2). | **FICTIONAL-NEW** |

**Genuinely accurate spec primitives** (✅ confirmed): the `funnel_events` / `subscriber_profiles` / `request_log` / `signup_attribution` / `signup_emails` / `quota_usage` / `processed_stripe_events` tables all exist; `checkout.session.completed` webhook live; `/api/admin/subscribers` + ADMIN_API_KEY auth pattern live; track-token capture live; the C2 bridge columns + C3 PQL view genuinely **don't** exist (clean to build); the structural-honesty caveat (keyless = ipHash-probabilistic) is correct.

---

## 4. Identifier diff

| Identifier | Spec | Live | Match? |
|---|---|---|---|
| Endpoint path | `/api/admin/funnel-snapshot` (NEW) | `/api/admin/funnel-snapshot` **(exists, `index.ts:1513`)** | path ✅ / "NEW" ❌ |
| Admin auth | `ADMIN_API_KEY`-gated, reuse `/admin/subscribers` pattern | `isAdminAuthorized(req)` (Bearer / `?key=` / cookie); `ADMIN_API_KEY` **SET (len 64)** in container | ✅ |
| Event types (C1) | `first_non_hold_verdict`, `quota_hit_soft`, `quota_hit_hard`, `upgrade_cta_clicked`, `tg_bot_quota_hit`, `tg_bot_upgrade_clicked` | live values: `upgrade_cta_clicked`, `quota_hit_soft\|hard\|block`, `tg_bot_quota_hit`, `first_tool_call_with_track_token`, `first_call`/`paid_upgrade` (snapshot aliases). **Missing: `first_non_hold_verdict`** (genuine). `tg_bot_upgrade_clicked` deferred. | partial |
| funnel snapshot stages | (implied 14) | `CANONICAL_STAGE_ORDER` = 14: install, mcp_tools_list, first_call, quota_hit_soft, quota_hit_hard, quota_hit_block, upgrade_cta_clicked, stripe_checkout_started, paid_upgrade, tg_bot_start, tg_bot_first_command, tg_bot_watchlist_add, tg_bot_quota_hit, tg_bot_upgrade_clicked. **`first_non_hold_verdict` is NOT a stage.** | n/a |
| subscriber_profiles cols (C2) | +`pre_conversion_calls`, `pre_conversion_sessions`, `time_to_first_call_s`, `peak_quota_pct`, `bridge_confidence ENUM(deterministic\|probabilistic\|none)` | none present | clean-add ✅ |
| `recordFunnelEvent` signature | (implied) | `recordFunnelEvent({ eventType, sessionId?, chatId?, licenseTier?, meta? })` → `INSERT INTO funnel_events(event_type,session_id,chat_id,license_tier,meta_json)`, fail-open (`perf-db.ts:1007`) | ✅ (for C1 reuse) |
| Checkout handler (C2 hook) | "at `checkout.session.completed`" | `src/index.ts:1074` → `buildSubscriberProfile(session)` (`subscriber-attribution.ts:290`) | ✅ |

---

## 5. Existing call-site confirmation (the spec's "confirm call sites")

- **`upgrade_cta_clicked`** — `src/index.ts:1298-1316`, inside `GET /signup`; fires when `?upgrade_from=` present (the `DEFAULT_UPGRADE_URL` in `tier-warning.ts:33` carries `&upgrade_from=quota`). Lazy-import + fail-open. ✅ wired.
- **`quota_hit_soft` / `quota_hit_hard`** — `src/lib/tier-warning.ts:110`, inside `withTierWarning()`; fires once a free caller crosses 75% / 90% (`getRequestSessionId()` as session). ✅ wired.
- **`quota_hit_block`** — `src/lib/license.ts:499` (the 100%/`TIER_LIMIT_REACHED` block path). ✅ wired.
- **`first_tool_call_with_track_token`** — `src/lib/track-token.ts` + `index.ts:2345` (the only event with live rows: 3). ✅ wired.
- **bot tg events** — `~/algovault-bot/src/algovault_bot/db.py` + `handlers.py` emit `tg_bot_first_command` (stage 11); `tg_bot_quota_hit` read from `alerts.log`; `unlock.py` maps `funnel_events` first-tool rows. ✅ mostly wired; `tg_bot_upgrade_clicked` deferred.
- **C2 base** — `buildSubscriberProfile` (`subscriber-attribution.ts:290`) already JOINs `signup_attribution` (channel), reads `signup_emails` (opt-in) + `funnel_events.upgrade_cta_clicked` (CTA bridge), upserts `subscriber_profiles` `ON CONFLICT(customer_id) DO UPDATE`. The clean extension point for the C2 bridge resolver + 5 columns.

---

## 6. Genuine residual scope (the REAL wave, post-correction)

**C1 (reduced to the one true gap):**
- Wire **`first_non_hold_verdict`** (the aha) — record once per free session on its first `BUY`/`SELL` verdict (at the `get_trade_call` / `get_trade_signal` response site, dedup via `getRequestSessionId()` like the quota events). Surface it in `funnel-snapshot.ts` as a **retention-quality signal** (the file already supports non-stage signals). Only 18 non-HOLD verdicts exist all-time, so this is low-volume but the key activation metric.
- **Do NOT** recreate `/api/admin/funnel-snapshot`, **do NOT** re-wire the existing captures, **do NOT** change `SOFT_THRESHOLD` (75%) without explicit sign-off (it's the deployed paywall threshold; changing it is behavioral, not measurement).

**C2 (genuine, additive):** `ADD COLUMN IF NOT EXISTS` the 5 columns; extend `assembleProfile`/`buildSubscriberProfile` + the upsert with a **bridge resolver** (priority: track-token → `signup_emails.email` → `signup_attribution.ip_hash` → `request_log.ip_hash`/`session`) computing `pre_conversion_calls/sessions`, `time_to_first_call_s`, `peak_quota_pct` (from `quota_usage`), and an honest `bridge_confidence` (deterministic only for track-token/email; probabilistic for ipHash; none otherwise). Backfill the 1 existing subscriber (`cus_UepU…`, `direct`, cold, `attribution_captured=false` → almost certainly `bridge_confidence='none'`). Pre-apply schema via SSH, deploy idempotent code.

**C3 (genuine, new):** `CREATE OR REPLACE VIEW pql_candidates` flagging free users by (`peak_quota_pct ≥ PQL_QUOTA_PCT` OR rolling call-freq ≥ `PQL_CALL_FREQ` OR `first_non_hold_verdict` reached) with a simple score; env-driven thresholds (`PQL_*`, default-deny on NaN); surface the cohort **in the existing `/api/admin/funnel-snapshot`** (additive field). Read-only; no outreach.

---

## 7. 🛑 HALT — architect questions (for Mr.1 → Cowork)

```
CONVERSION-MEASUREMENT-W1 — Plan-Mode Step 0 HALT (C1 already shipped & deployed by ACTIVATION-FUNNEL-AUDIT-W1 / commit 77baa0e, live in v1.20.1). Need ratification before any state mutation:

Q1 [C1 scope]  C1's NEW /api/admin/funnel-snapshot endpoint + the upgrade_cta_clicked / quota_hit_soft|hard / tg_bot_quota_hit captures ALREADY EXIST AND ARE DEPLOYED (0 DB rows = the activation leak itself, not un-wired code). Confirm C1 is REDUCED to: wire ONLY the missing `first_non_hold_verdict` (aha) event + surface it in the existing snapshot — and explicitly NOT recreate the endpoint or re-wire the existing captures. (Y / N + alternative)

Q2 [aha shape]  `first_non_hold_verdict` = first BUY/SELL a FREE session receives (only 18 non-HOLD verdicts exist all-time). OK to: (a) record it at the get_trade_call/get_trade_signal response site, deduped per session_id, AND (b) add it to funnel-snapshot as a retention-QUALITY signal (NOT a 15th funnel stage, to keep the 14-stage CANONICAL_STAGE_ORDER + snapshot history stable)? (Y / N)

Q3 [quota threshold]  Spec says quota_hit_soft ≥80%; deployed SOFT_THRESHOLD = 75% (tier-warning.ts:20, the live paywall threshold). Leave at 75% (measurement-only wave; changing it is behavioral) — Y? Or retune to 80% in THIS wave — N?

Q4 [tg_bot_upgrade_clicked]  Already deferred to OPS-FUNNEL-STRIPE-PIXEL-W1 by the prior wave (funnel-snapshot.ts:83). Keep it deferred (out of this wave) — Y? Or pull it in — N?

Q5 [C2/C3 proceed]  C2 (5 new subscriber_profiles cols + bridge resolver, additive on the existing buildSubscriberProfile) and C3 (new pql_candidates view surfaced in the EXISTING funnel-snapshot endpoint) are genuine + don't recreate anything. Approve proceeding C2→C3 once Q1–Q4 are resolved? (Y / N)

Q6 [bridge confidence]  Confirm bridge_confidence labels = deterministic (track-token or email match) | probabilistic (ipHash match only) | none (no match). The 1 existing subscriber (cold direct /signup, attribution_captured=false) will almost certainly resolve to 'none' — acceptable as the honest answer? (Y / N)
```

---

*No code, schema, or config mutated. `endpoint-truth.md` written (uncommitted, audits/ is `paths-ignore`d). Awaiting architect ratification per CLAUDE.md Plan-Mode + the HALT-class "prepare Cowork questions" contract.*
