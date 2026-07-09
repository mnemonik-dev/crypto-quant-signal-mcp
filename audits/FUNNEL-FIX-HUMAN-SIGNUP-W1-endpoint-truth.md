# FUNNEL-FIX-HUMAN-SIGNUP-W1 — endpoint-truth (Plan-Mode Step 0, read-only)

**Probed:** 2026-07-10 UTC · **Host:** Hetzner `204.168.185.24` (prod) · **Repo:** worktree on branch `funnel-fix-human-signup` @ `origin/main` `e50715f`. **Mode:** AUDIT-FIRST · read-only. **This wave MUTATES the signup/auth path — nothing changes until Mr.1 ratifies. HALT after this.**

Format: `claim | reality (live) | resolution`.

## A. PER-SURFACE gate model (Mr.1's FIRST ask — where does value require email/key?)

| surface | value gate (live/code) | email required for value? |
|---|---|---|
| **MCP** (`/mcp`) | keyless free — `resolveLicense`: no `Authorization` key → keyless free (100/mo by `ipHash`). `av_free_`→free-store, `av_live_`→Stripe, none→free. | **NO** ✓ value-before-email already |
| **TG bot** | keyless free alerts (internal-bypass funnel) | **NO** ✓ |
| **Raw API / HTTP** (`/x402/*`) | x402 **PAYMENT** paywall (`resolveLicense` x402→key→free; unpaid `tier!=='x402'` → 402). AND **dark in prod by default** (`X402_FACILITATOR=legacy` / `BAZAAR_DISCOVERABLE=false` ⇒ `mountX402HttpRoutes` registers nothing). | **NO email** — it's x402-pay, not an email/key gate; and mostly not mounted |
| **Webhooks** (`/api/webhooks`) | requires an API **key** (`webhook-routes.ts` resolves license; key-addressed `checkQuotaByKey`) → a free user needs an `av_free_` key | **YES** (email → free key) |
| **Web `/welcome` + `/api/signup-email`** | email `<input required>` ("Get my free key") → `mintFreeKey(email)` [`av_free_`, idempotent on email] → returns `{key, referral_code, referral_link}` + emails it | **YES — email IS the gate** |
| **Web `/signup`** | Stripe-hosted checkout (paid); email captured at Stripe | email at Stripe |

**Classification of 165→6:** `signup_attribution` **165** = `/signup` Stripe-checkout-CTA clicks (paid-intent); `free_keys` **6** = `/welcome`→`/api/signup-email` free signups. **Different flows** → 165→6 is **partly an artifact** (paid-intent clicks vs free-key grants, not one funnel). The REAL email-gate leak is narrow: it bites only humans who want a **persistent key** (webhooks / cross-IP / referral) via the web — MCP/TG users already get value keyless. **Fix scope → the web free-key flow (`/welcome`+`/api/signup-email`); webhooks benefit; MCP/TG unchanged.**

## B. Signup → key → entitlement flow (the mutate target)

| # | primitive | reality (code) | resolution |
|---|-----------|----------------|------------|
| B1 | free-key issuance | `/api/signup-email` (`src/index.ts:2609`): email(req) + source + optin_consent(opt) + ref(opt) → `mintFreeKey(email)` (`free-keys-store.ts`, `av_free_`, UNIQUE per email) → `ensureUserCode` → **returns `{key, referral_code, referral_link}` in-response** + fire-and-forget Resend email. | Key returns immediately; **email is the pre-gate**. Defer = issue key + a real signal BEFORE email. |
| B2 | paid issuance | `/signup` (`:1424`) → `recordSignupAttribution` (`:1512`, captures `?src/utm` + `client_reference_id` + ip_hash into `signup_attribution`) → 303 → Stripe Checkout → webhook `customer.subscription.created` → `buildSubscriberProfile` + `sendWelcomeEmail` + `av_live_` key. | Untouched by this wave (Stripe path). |
| B3 | **entitlement resolution (INVARIANT core)** | `resolveLicense(headers)` (`license.ts:192`): Tier0 bot-bypass · Tier1 x402 proof→`x402` · Tier2 `Authorization` key → `resolveFromApiKeyAsync` (`av_live_`→Stripe, `av_free_`→free-store, none/unknown→keyless free). | **DO NOT change `resolveFromApiKeyAsync`.** New flow changes ISSUANCE, not RESOLUTION → existing keys resolve identically. |
| B4 | live invariant targets | `free_keys` **6** · `subscriber_profiles status=active` **1** (the live paid customer) · `referral_codes` **10**. | AC3: all 6 + the 1 paid resolve to the same tier before/after (test + live check). |
| B5 | account/self-service | `/account`, `/account/recover-key`, `/account/referrals` (`account-handlers.ts`) — paste `av_live_`/`av_free_` key. | Untouched; the merge/deferred flow must not orphan these. |

## C. Attribution · email · OAuth prereqs

| # | primitive | reality | resolution |
|---|-----------|---------|------------|
| C1 | attribution capture | `/signup` stamps `?src/?utm` + `client_reference_id` into `signup_attribution` (`:1512`). **`/api/signup-email` captures `?ref` (referral) only — NOT `?src/utm`.** | **Gap:** the free-key flow doesn't record channel. New flow must stamp `?src/?ref/utm` at ephemeral-key + account creation (so the scoreboard sees free-signup channel + survives OAuth redirect/merge). |
| C2 | transactional email | Resend (`email.ts`); `RESEND_API_KEY` + `RESEND_FROM_EMAIL` **SET** on prod. `sendFreeKeyEmail`/`sendReferredFreeKeyEmail`/`sendWelcomeEmail`. | Email-link path is live-capable. |
| C3 | OAuth apps | prod env: **NO** `GOOGLE_OAUTH_*` / `GITHUB_OAUTH_*` (only `RESEND_*`). | **Stub-first** — `AuthProvider`+`StubProvider`; wave ships GREEN on stub; live flip = the batched manual OAuth-app step. |

## D. Firewall / system-map
`tools/list` = **9** (baseline sha256 `0da5e7cc…`, captured V2). Signup is HTTP/web → AC5 asserts `tools/list` byte-identical + no tool-response change. **system-map:** likely edits `/api/signup-email`+`/account` (key producer) rows + a NEW `auth_providers`/deferred-identity table + OAuth callback route → edit affected rows + `Last touched:` same commit **if** a table/route/edge is added; else NONE. Determined at build time from the ratified design.
