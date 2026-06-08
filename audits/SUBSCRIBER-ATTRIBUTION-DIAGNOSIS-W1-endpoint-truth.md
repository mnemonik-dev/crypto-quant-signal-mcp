# SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 — Plan-Mode Step-0 endpoint-truth

**Wave:** SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 — read-only forensic, zero production mutation.
**Run:** 2026-06-08 ~06:26 UTC. **Method:** probe each cited primitive with one concrete command (`claim | reality | resolution`). HALT only on a fictional/inaccessible primitive (≥3 → HALT; 1–2 → fix inline + flag).
**Result:** **0 genuinely fictional primitives; 2 inline-resolved drifts; NO HALT.** Proceeded autonomously to verdict.

---

## Probe table

| # | Claim (from spec) | Reality (probe + result) | Resolution |
|---|---|---|---|
| P1 | MCP container exists on Hetzner `204.168.185.24` | `docker ps` → **`crypto-quant-signal-mcp-mcp-server-1`** (Up; `StartedAt=2026-06-08T06:09:29.653Z`, `RestartCount=0`). Also `…-postgres-1` (Up 40h), `…-facilitator-1` (Up 40h healthy). | ✅ real. Baseline `StartedAt` captured for end-of-wave zero-mutation proof. |
| P2 | In-container `STRIPE_SECRET_KEY` present (no value printed) | `docker exec …mcp-server-1 printenv STRIPE_SECRET_KEY \| cut -c1-8` → **`sk_live_`** (livemode; only the non-secret 8-char class prefix printed). | ✅ real, livemode. Secret never left host; all Stripe calls run in-container. |
| P3 | `docker exec <mcp-ctr> psql … -c 'select 1'` = 1 | MCP container has **NO `psql`** (`command -v psql` → not found; it is a Node image — `node` present at `/usr/local/bin/node`). Ran `select 1` via the **postgres container** (`…-postgres-1`, `psql -U algovault -d signal_performance`) → **`1`**. | ⚠️ **inline-resolved DRIFT #1.** Spec's `docker exec <mcp-ctr> psql` is not literally runnable (mcp image lacks psql). Same DB / same host / no secret egress → ran psql in the postgres container per the analyzer-DB convention. Does not change any finding. |
| P4 | MCP `DATABASE_URL` present | `docker exec …mcp-server-1 printenv DATABASE_URL \| sed 's#//user:pass@#//REDACTED@#'` → **`postgresql://REDACTED@postgres:5432/signal_performance`**. PG container env: `POSTGRES_USER=algovault`, `POSTGRES_DB=signal_performance`. | ✅ real; dbname `signal_performance` ✓ (matches CLAUDE.md, NOT `algovault`). Creds redacted. |
| P5 | Tables `request_log`, `funnel_events`, `signup_emails`, `processed_stripe_events`, `processed_x402_payments` exist | `pg_tables` filter → **all present** (+ `webhook_subscriptions`, `webhook_deliveries` present). `\d` confirmed columns for each used in the report. | ✅ all real. |
| P6 | `request_log` has a `caller` dimension (migration 009) | `\d request_log` → columns are `id, timestamp(text), session_id, tool_name, asset, timeframe, license_tier, response_time_ms, verdict, confidence, ip_hash, is_bot_internal`. **No column literally named `caller`.** The internal-vs-external "caller" split is realized via **`is_bot_internal`** (+ `tool_name`). | ⚠️ **inline-resolved DRIFT #2.** Used `is_bot_internal` + `tool_name` + `license_tier`. Immaterial to the verdict: `request_log` has **no per-user identity column** (no email/api_key/customer) under either reading → the pre-subscription usage bridge is structurally impossible regardless. |
| P7 | Canonical clone `/Users/tank/code/crypto-quant-signal-mcp` (NOT the stale `/Users/tank/crypto-quant-signal-mcp/`) | `git -C /Users/tank/code/crypto-quant-signal-mcp` → `origin/main` **`e6456f4`** (2026-06-08), remote `github.com/AlgoVaultLabs/crypto-quant-signal-mcp` (**PUBLIC**). | ✅ real. Stale-clone trap honored. **Repo PUBLIC → customer PII redacted from all committed docs** (Data-Integrity LAW; see report header). |
| P8 | `~/.config/algovault/db.env` (spec flags this as fictional) | Not used. DB reached via container `DATABASE_URL` / postgres container. | ✅ correctly avoided (spec self-flagged; confirmed unnecessary). |
| P9 | Hypothesis: customer `cus_UepU…` via `cs_live_a1hvV1…`, $9.99 untagged | Resolved **by email** (`customers.list({email:'…'})`, not assumed): exactly **1** match = `cus_UepUXyDjxzx99c`; its checkout session = `cs_live_a1hvV1…`, amount 999, `client_reference_id` prefix `direct`. | ✅ hypothesis **confirmed**, not taken as given. |
| P10 | Stripe live API reachable from container | `customers.list` → HTTP 200, `match_count=1`; subsequent `subscriptions`/`charges`/`checkout/sessions`/`invoices`/`events` all 200. | ✅ real. |

## Fictional-primitive count: **0** (2 inline-resolved drifts: psql-exec-target, `caller`-column). **No HALT.**

## Zero-mutation envelope (verified at end of wave)
- MCP container `StartedAt=2026-06-08T06:09:29.653Z`, `RestartCount=0` — **unchanged** from start to finish (re-probed at 06:25:57Z). No restart, no deploy.
- Only operations performed: read-only Stripe `GET`s (in-container) + read-only `psql` `SELECT`/`\d` (postgres container) + `docker cp` of throwaway `/tmp` probe scripts. **No `src/` change, no DB write, no Stripe write, no version bump.**
