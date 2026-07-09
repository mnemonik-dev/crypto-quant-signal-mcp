# H0-C4-MEASURE-CLOSE — endpoint-truth (Plan-Mode Step 0, read-only live probes)

**Probed:** 2026-07-09 (UTC) · **Probe host:** Hetzner `204.168.185.24` (prod) · **Repo base:** fresh worktree off `origin/main` @ `3bb5390` (local `~/code/crypto-quant-signal-mcp` was **35 commits stale** at `f6a2b52` — as the prompt warned; all repo reads below are from the fresh worktree, all DB/host reads from live prod).

**Mode:** AUDIT-FIRST · MEASUREMENT-ONLY · every command below is READ-ONLY (SELECT / `\d` / `ls` / `curl POST tools/list` / `git show`). Zero mutation. **No code written except these two audit docs. HALT for Mr.1 after this.**

Format per line: `claim (from prompt/CLAUDE.md) | reality (live) | resolution`.

---

## A. Repo / deploy freshness

| # | claim | reality (live) | resolution |
|---|-------|----------------|------------|
| A1 | canonical checkout `~/code/crypto-quant-signal-mcp`; local checkout may be 30+ commits stale | local HEAD `f6a2b52`, **35 commits behind** `origin/main` `3bb5390`; 0 ahead; only untracked cruft (`.claude/napkin.md`, an unrelated endpoint-truth) | **Work in fresh worktree `~/code/cqs-H0-C4-MEASURE-CLOSE` @ origin/main `3bb5390`.** Confirmed. |
| A2 | deploy via GHA push-to-main; prod dir `/opt/crypto-quant-signal-mcp/`; Hetzner `204.168.185.24` | SSH OK; 3 containers up 19h: `crypto-quant-signal-mcp-mcp-server-1`, `-postgres-1`, `-facilitator-1`; prod dir present | Confirmed. Build = clean rebuild + `git push --follow-tags` GHA. |
| A3 | tests = vitest; pre-commit system-map gate + pre-push test-baseline gate active | (per memory `git_hooks_now_active`) shared `.git/hooks` — pushes run full suite ~40s | Confirmed. New worktree needs `npm ci` (NOT node_modules symlink — `worktree-node-modules-symlink-trap`) before build/test in build phase. |

## B. Postgres `signal_performance` primitives (container `crypto-quant-signal-mcp-postgres-1`, user `algovault`)

| # | primitive (claim) | reality (live `\d` / counts, 2026-07-09) | resolution |
|---|-------------------|------------------------------------------|------------|
| B1 | `funnel_events` incl. `upgrade_cta_clicked` | EXISTS. cols: `id, event_type, ts(timestamptz), session_id, chat_id(bigint), license_tier, meta_json`. idx on event_type/session_id/ts. Event dist: `mcp_connect` 7183, `mcp_tools_list` 1553, `quota_hit_soft` 86, `landing_cta_clicked` 85, `track_record_viewed` 70, `quota_hit_hard` 64, `first_non_hold_verdict` 57, `quota_hit_block` 28, `upgrade_cta_clicked` **1** (2026-06-18), `referral_*` 2/2. earliest ts **2026-06-05**. `chat_id` **0 non-null** (9134 rows). | ✅ computable. **`upgrade_cta_clicked` = 1 all-time** (intent-panel headline ≈ 0). `chat_id` reserved/unused (memory-confirmed) → no chat_id metric. |
| B2 | `processed_stripe_events` (idempotency + `checkout.session.completed`) | EXISTS. cols: `event_id(PK), event_type, processed_at(tstz), session_id, customer_email, amount_total(int cents), metadata`. **row count = 0.** | ⚠️ **EMPTY.** Webhook subscription fix (`e6456f4`) is in place but **zero completions have recorded here.** Conversion count from this table = 0 today. See B6 (subscriber_profiles holds the 1 conversion). |
| B3 | `request_log` incl. `stripe_checkout_completed`, `license_tier`, **UTM attribution** | EXISTS. cols: `id, timestamp(**TEXT**, ISO-8601-Z), session_id, tool_name, asset, timeframe, license_tier, response_time_ms, verdict, confidence, ip_hash, is_bot_internal, is_automated`. tool_name ∈ **only the 10 MCP tools** (no `stripe_checkout_completed`). **No UTM columns.** tier dist: internal 89445 (52496 auto), free 8114 (5894 auto), pro 15, x402 7, starter 1. paid distinct ip_hash all-time: pro **2** / starter 1 / x402 1; last-30d: only x402 1. | ❌ **PROMPT DRIFT.** request_log has NO `stripe_checkout_completed` and NO UTM cols — it logs MCP tool calls only. UTM lives in `signup_attribution` (B4). `timestamp` is TEXT (ISO-Z → lexicographically sortable, but string-compare filtering). |
| B4 | (unnamed in prompt) free-signup channel attribution | `signup_attribution` EXISTS (SUBSCRIBER-ATTRIBUTION-SPINE-W1). cols: `client_reference_id(PK), created_at(tstz), channel(default 'unknown'), utm_source/medium/campaign, referrer, landing_path, tier_requested, ip_hash, user_agent`. **162 rows**, 2026-06-08→2026-07-08. weekly ~24–43, channel ≈ 90% `direct`, ~10% `tg_bot`. | ✅ **THIS is the free-signup-by-channel + UTM source.** (A `/signup` CLICK, not a provisioned free key.) earliest 2026-06-08. |
| B5 | (unnamed) free identities / emails / quota | `free_keys` (api_key PK, email, ref_code, created_at) **6 rows**, earliest 2026-06-21. `signup_emails` (email opt-ins, source) exists. `quota_usage` (tracker_key PK, call_count, period_start TEXT, milestone_referral_shown). | ✅ 3 candidate "free identity" definitions (free_keys=6 / signup_emails / signup_attribution=162) — they measure different things (see funnel-audit Q5). |
| B6 | Stripe live tier via `resolveLicense`; paying subs from bot+Stripe | `subscriber_profiles` (customer_id PK; PII email/name/country — ADMIN-GATED) **1 row**: `starter/active`, converted 2026-06-07, channel `direct`, `attribution_captured=false`, has `converted_at`, **no `signup_at`**. idx on converted_at DESC. cols incl. `pre_conversion_calls/sessions`, `latency_seconds`, `peak_quota_pct`, `bridge_confidence`. | ✅ conversion/subscriber SoT (incomplete cache). **Paying-subs count CONFLICTS across sources** (=1 here vs bot linked=2 vs request_log pro-ip=2 vs Stripe-live=canonical). See funnel-audit Q2. |
| B7 | x402 micropayment success logs | `processed_x402_payments` (nonce PK, tool, amount, created_at) **7 rows**, all 2026-06-30. | ✅ computable; paid micro-path signal, 1-day burst. |

## C. Cross-host / snapshot / Stripe primitives

| # | primitive | reality (live) | resolution |
|---|-----------|----------------|------------|
| C1 | `activation-funnel/snapshots/*.json` weekly cron since 2026-04-15 | prod `/opt/crypto-quant-signal-mcp/activation-funnel/snapshots/`: weekly `.json`+`.md`, latest **2026-07-06** (3d old, weekly Mon cadence = fresh), earliest **2026-04-15** (`-auto` + `-baseline`). | ✅ snapshot LINEAGE back to 2026-04-15 — but these are **aggregate** snapshots, NOT per-identity cohorts. Append target for R4 confirmed. |
| C2 | bot SQLite `/var/lib/algovault-bot/state.db` `subscribers.linked_at` cohorts | EXISTS (mode 0660 algovault-bot; `sqlite3` on host OK). `subscribers`: chat_id PK + `linked_api_key/linked_tier/linked_at`, `quota_hit_{soft,hard,block}_at`, `bot_blocked_at`, `first_command_fired_at`. **27 subs**, linked_at 2026-05-08→2026-06-07. linked_tier: **starter 2**, unlinked 25. **7/27 blocked** (churn). | ✅ computable; earliest identity cohort (2026-05-08, ~62d). Cross-host read = host `sqlite3` (no cross-host port). |
| C3 | Stripe — Checkout sessions; live tier | container env: `STRIPE_SECRET_KEY`=set, `STRIPE_{STARTER,PRO,ENTERPRISE}_PRICE_ID`=set, `STRIPE_WEBHOOK_SECRET`=set, `ADMIN_API_KEY`=set. | ✅ Stripe-live query IS possible (read-only `subscriptions.list`) — canonical revenue source. Adds an external call on load (design choice — Q2). |
| C4 | 90d-retention feasibility: first cohort 2026-04-15 ≥90d | **NO identity cohort reaches 90d.** earliest per-identity: bot 2026-05-08 (~62d), funnel_events 2026-06-05 (~34d), signup_attribution 2026-06-08 (~31d), free_keys 2026-06-21 (~18d), sub_profile conv 2026-06-07. First real 90d: **bot 2026-08-06 / web-signup 2026-09-06.** | ❌ **PROMPT PREMISE FALSE (R1.3).** 2026-04-15 is the aggregate-snapshot cron start, NOT identity data. **90d retention = null for every cohort today.** See funnel-audit Q1. |

## D. Existing admin surfaces (the new view MUST match) + reuse inventory

| # | primitive | reality (live in worktree `src/index.ts` / `src/lib/`) | resolution |
|---|-----------|--------------------------------------------------------|------------|
| D1 | existing `/dashboard` route + auth model | `app.get('/dashboard')` `src/index.ts:1802`. Auth `isAdminAuthorized(req)` (`:1779`): `Bearer` header OR `?key=` (`safeCompare` vs `ADMIN_API_KEY`) OR `av_admin_session` HttpOnly cookie (24h TTL). `?key=` sets cookie + 303 → clean URL; else 401. Render = `res.send(getDashboardHtml())` (`:3205`, server HTML string). **Whole admin block gated on `if (ADMIN_API_KEY)`.** | ✅ **`/dashboard/funnel` copies this pattern verbatim** (same `isAdminAuthorized`, same cookie/redirect, HTML render). |
| D2 | existing funnel aggregation | `src/lib/funnel-snapshot.ts::generateFunnelSnapshot()` (`:759`) — 14-stage funnel + `conversion`, `stage_retentions`, `tier_cohort_sizes`, `by_source[]` (per-source conversion), `getIdentityCoverage` (connection-attribution %), `getByAuthenticity` (human/automated). Wrapped by **existing** `GET /api/admin/funnel-snapshot?window=` (`:1854`). | ✅ **Standing funnel infra ALREADY EXISTS** (ACTIVATION-FUNNEL-AUDIT-W1 2026-05-28). Reuse — do not re-instrument. |
| D3 | existing subscriber aggregation | `src/lib/subscriber-attribution.ts`: `aggregateProfiles()` (`:705`→`ProfileAggregates`), `listSubscriberProfiles()` (`:677`), `renderSubscribersAdminHtml()` (`:731`). Routes `GET /api/admin/subscribers` (`:2099`), `GET /admin/subscribers` (`:2118`). | ✅ **Paying-subs/cohort helpers ALREADY EXIST** (SUBSCRIBER-ATTRIBUTION-SPINE-W1 2026-06-08). `getFunnelScoreboard()` COMPOSES these (Q3). |

## E. MCP-tool-surface firewall baseline (AC2 "before" snapshot)

| # | primitive | reality (live) | resolution |
|---|-----------|----------------|------------|
| E1 | `tools/list` byte-identical before vs after | live 3-step handshake vs `https://api.algovault.com/mcp` (server is **stateless** — tools/list returns without a session-id): **TOOL_COUNT = 9** → `get_trade_call, get_trade_signal, get_market_regime, scan_funding_arb, scan_trade_calls, get_equity_call, get_equity_regime, chat_knowledge, search_knowledge`. Full JSON saved `audits/H0-C4-MEASURE-CLOSE-toolslist-baseline-2026-07-09.json` (26693 B, sha256 `0da5e7cc2234bf5ea997e8d4546957f609bbc30105469a041e3682d0cfe7fd17`). system-map asserts `tools/list=9` as the standing invariant across ~10 waves. | ✅ Baseline captured. Tools register from `FEATURE_REGISTRY` SoT via loop `src/index.ts:859`; an HTTP-only route + a `src/lib/` module + DB reads **cannot** touch this. |
| E2 | 4 manifest versions unchanged | origin/main: `package.json` 1.23.0, `server.json` 1.23.0, `manifest.json` 1.16.0, `lobehub-manifest.json` "18". | ✅ AC2 diffs against these — wave bumps none. |

---

## System-map edge enumeration (Plan-Mode Step 0)

Per Map Anchor, the wave is **either** `NONE — internal read-only aggregation` **or** `+1 internal read edge`. Determination hinges on Q4/R4 (whether a rollup matview or standing-snapshot cron is added):

- **If pure read-view** (module reads live on each load, no new cron/matview, no new snapshot store): **`NONE — internal read-only aggregation`** → `system-map.md` UNTOUCHED (n-a).
- **If a rollup/cron/snapshot is added** (e.g. retention-cohort matview refreshed on an existing host cadence, or a weekly scoreboard row appended to `activation-funnel/snapshots/`): **+1 internal read edge**: `/dashboard/funnel → reads funnel_events · processed_stripe_events · subscriber_profiles · signup_attribution · request_log · bot state.db · x402 · Stripe-live` → then edit the affected map rows + overwrite the single `Last touched:` line same commit (never a prepended row).

**Recommended (pending Q4 ratification):** pure read-view + reuse the EXISTING weekly snapshot cron (no new cron) → **`NONE`**. Retention cohorts are tiny (≤27 identities) → live compute is trivial, no matview needed.

## Firewall honored? (R1.6)

**YES (by construction).** The planned deliverable adds only: `src/lib/funnel-scoreboard.ts` (a pure module), a new `app.get('/dashboard/funnel')` + `/dashboard/api/funnel-scoreboard` HTTP route (admin-gated), DB read queries, tests, docs. It touches **no** `server.tool(...)` registration, no `FEATURE_REGISTRY`, no tool response envelope, no manifest/version. `tools/list` stays 9, byte-identical (AC2 re-proves live).
