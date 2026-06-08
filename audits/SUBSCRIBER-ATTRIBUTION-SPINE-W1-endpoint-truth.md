# SUBSCRIBER-ATTRIBUTION-SPINE-W1 — Plan-Mode Step-0 endpoint-truth

**Wave:** SUBSCRIBER-ATTRIBUTION-SPINE-W1 — Tier-2 Bulk-Spec, 3 chapters, additive + read-mostly.
**Run:** 2026-06-08 ~06:40 UTC. **Method:** probe each primitive with one concrete command (`claim | reality | resolution`). HALT only on: ≥3 fictional primitives / repo-state guard can't determine a safe deploy mode / cross-chapter identifier mismatch.
**Result:** **0 fictional primitives; 1 inline-resolved drift (webhook-case file location); repo-state guard CLEAN → deploy mode = `deploy-direct`; NO HALT.** Proceeding autonomously C1→C2→C3.

---

## A. REPO-STATE GUARD (ran FIRST — protects QUOTA-CONSISTENCY-COUNT-ALL-W1)

| Probe | Result | Resolution |
|---|---|---|
| `git push --dry-run origin main` | **`Everything up-to-date`** — push works. origin advanced `d8ffad7→4c79798→4a4b122` (3 waves pushed since the flag) → **GitHub flag CLEARED.** | Deploy via `deploy-direct.sh` is viable (push path open). |
| Equity change (`equity-tool-formatters.ts` HOLD-free) uncommitted? | **NO — already committed AND pushed** as `4a4b122` ("get_equity_call HOLD-free metering … deferred commit", author `Megatron888-Robot` = operator deferred-commit bot) while I was probing. `origin/main==local==4a4b122`. The commit msg explicitly states it preserves the change "through deploy-direct.sh (git reset --hard origin/main on the host)". | **Guard's prescribed recovery already satisfied by operator automation** → I do NOT re-commit it. |
| Live concurrent Claude session? | **None.** `git worktree list` shows 4 STALE worktrees (`cqsm-wt-{coalesced-timeout,perfstats,seed-freshness,seed-orchestrator}`) from already-SHIPPED waves — all dirty/behind, **no bound ports** (`cc-session.sh list`). The `4a4b122` commit was a finished one-shot automation, not a running session. | Safe to work in the main checkout (prompt's explicit flow); prior wave proved per-file-add discipline here. Re-verify `git status` before each commit/deploy. |
| Host `/opt/crypto-quant-signal-mcp` git state | HEAD `4a4b122`; working tree has ` M README.md` + ` M landing/*.html` = **expected build-time snapshot-injection drift** (`scripts/snapshot-landing-data.mjs` re-applies post-`git pull`). | `deploy-direct` git-reset wipes → snapshot re-applies = normal cycle. No action. |

**→ DEPLOY MODE = `deploy-direct.sh`** (push→host `git reset --hard origin/main`→rebuild). SAFE because origin/main contains the equity recovery (`4a4b122`); the host git-reset preserves it. (rsync-direct fallback unneeded — push is open.)

## B. Primitives

| # | Claim | Reality | Resolution |
|---|---|---|---|
| P1 | `signup_attribution` / `subscriber_profiles` not pre-existing | `to_regclass` → both **NULL** | ✅ greenfield; create both. |
| P2 | `/signup` route + `direct:<ts>:<rand>` client_reference_id gen | `src/index.ts:1136` `app.get('/signup', …)`; `:1149` `` `${utmSource ?? 'direct'}:${Date.now()}:${Math.random().toString(36).slice(2,8)}` `` | ✅ exact shape the diagnosis saw (`direct:1780796896353:0n031n`). C1 inserts capture here. |
| P3 | `checkout.session.completed` case in `src/lib/stripe.ts` | **DRIFT** — the case is in **`src/index.ts:1074`** (`summarizeCheckoutCompleted(event)` + `tryClaimEvent` at `:1082` + `logRequest` at `:1106`). `src/lib/stripe.ts:359` is only a *summary helper*. | ⚠️ **inline-resolved DRIFT (1).** C2 wires `buildSubscriberProfile(session)` into the real case in `index.ts:1074` (inside the `isNew` branch, after `tryClaimEvent`); the profiler LOGIC lives in the new module `src/lib/subscriber-attribution.ts` per spec intent. The C2 "Must NOT write stripe.ts /signup/admin" firewalls still hold (index.ts webhook-case region ≠ C1 /signup ≠ C3 admin). Immaterial to behavior. |
| P4 | Idempotency `tryClaimEvent` + `processed_stripe_events` | `src/lib/stripe-events-store.ts` — `tryClaimEvent` (SELECT-then-INSERT, ON CONFLICT semantics) + `ensureProcessedStripeEventsSchema`; imported `index.ts:40` | ✅ profiler runs only in the `isNew` branch → replay writes 0 rows. |
| P5 | ip-hash helper | `hashIp(ip:string)` (sha256→16hex) `src/lib/analytics.ts:122`. ALS `getRequestIpHash()` (`license.ts:57`) reads `requestContext` — **only entered for `/mcp` (index.ts:2148), NOT express routes.** | ✅ `/signup` extracts client IP from `x-forwarded-for[0] / x-real-ip / req.ip` (mirrors `index.ts:2088-2092`, `trust proxy` set `:912`) → `hashIp()`. Never store raw IP. |
| P6 | admin-auth middleware + `ADMIN_API_KEY` + `/admin/geo-dashboard` | `ADMIN_API_KEY` env **PRESENT** (in-container); `isAdminAuthorized(req)` `index.ts:1265` (Bearer / `?key=` / cookie); admin block `if(adminKeyRaw){…}` `:1230-1452`; `/admin/geo-dashboard` `:1396`, `/api/admin/funnel-snapshot` `:1340` (JSON mirror) | ✅ C3 adds 2 routes INSIDE the admin block reusing `isAdminAuthorized`. |
| P7 | Stripe geo fields (diagnosis-proven) | `Customer.address.country` / `Charge.billing_details.address.country` / Link `country` — all proven US for `cus_UepU…` in SUBSCRIBER-ATTRIBUTION-DIAGNOSIS-W1 | ✅ reuse; `country_source` records which field. |
| P8 | migrations numbering + apply mechanism | `migrations/` → `…010_processed_x402_payments.sql`; **no runner in `deploy-direct.sh`** → tables self-heal via in-code `ensureXSchema()` at startup (+ SSH pre-apply + `.sql` record) | ✅ next = **`011_signup_attribution`**, **`012_subscriber_profiles`**; module exports `ensure*Schema()` (dual-backend, mirrors `stripe-events-store.ts`). |
| P9 | `STRIPE_WEBHOOK_SECRET` in-container | **PRESENT** | ✅ webhook signature verification intact (untouched). |

## Baseline (on `4a4b122`, pre-wave)
- `rm -rf dist && npm run build` (tsc) → **exit 0** (clean).
- `npm test` → **13 failed | 1956 passed | 10 skipped** (20 files failed; e.g. pre-existing `tests/unit/snapshot-capabilities.test.mjs`). **"+0 NEW" gate compares against 13 failures.**

## HALT check: 0 fictional; 1 inline drift (P3 file location); repo-state guard determined a safe deploy mode (`deploy-direct`). **NO HALT → execute C1→C2→C3.**
