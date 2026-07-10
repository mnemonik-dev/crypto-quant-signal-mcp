# FUNNEL-FIX-AUTH-UNIFY-W1 — R1 audit (audit-first) + HALT for architect

**Target ICP:** T1+T2 · **Flags:** Plan-Mode · AUDIT-FIRST · PUBLIC UX (operator-approved 2026-07-10) · MCP tools/list FROZEN · NO version bump · NO TG
**Audited against `origin/main`** (deployed truth; local checkout 49 behind). Companion: `FUNNEL-FIX-AUTH-UNIFY-W1-endpoint-truth.md`.

## 1. How each page renders today + its auth methods

| Page | Route | Render source | Sign-in methods TODAY | Post-auth context |
|---|---|---|---|---|
| **/welcome** | index.ts:1539 | `getWelcomePageHtml()` — `src/lib/welcome-page.ts` | **Start-free** (`avStartFree`→`/api/start-free`) · **Google/GitHub** (gated `getAuthProvider().live`→`/auth/:provider`) · **email** (get-free-account form→`/api/signup-email`). Behind `NEW_SIGNUP_ENABLED` (LIVE). | API-key reveal after Stripe checkout, else paywall/free CTA. |
| **/signup** | index.ts:1423 | **Stripe-Checkout 303-redirect** (no HTML sign-in) | none (paid redirect); `?ref`/utm→Stripe metadata | → Stripe hosted checkout → `/welcome?session_id=…` reveal |
| **/account** | index.ts:1570 | `getAccountPageHtml()` — `src/lib/account-handlers.ts` | **paste API key** (`av_live_`/`av_free_`) → recover-key · referrals | manage plan · portal · recover key · referral stats |
| **/referral** | index.ts:1586 | `renderReferralLandingPage()` — `src/lib/referral-pages.ts:315` | **email** (`renderReferralSignupForm`→`/api/signup-email`) + "find your link in your account" (paste-key) | referral link + signups + earnings (via key→code) |

**Divergence (the confusion the wave targets):** OAuth one-tap exists ONLY on `/welcome`; `/account` leads with agent-identity (paste key); `/referral` leads with email. Same user, three front doors — and `/referral` can't use the Google/GitHub login OPS-OAUTH-APPS-WIRE-W1 just shipped.

## 2. Reusable pieces (EXTRACT, do not rebuild)

- **OAuth core** — `auth-providers.ts`: `getAuthProvider().live`, `StubProvider`/Google/GitHub, `generateOAuthState`, `safeRedirectPath`; routes `/auth/:provider`(+`/callback`) index.ts:2752/2777. Google+GitHub LIVE.
- **Deferred/free key** — `deferred-signup.ts` (`startFree`/`captureEmail`) + `/api/start-free` + `free-keys-store.ts` (`mintEphemeralKey`/`mergeEphemeralIntoEmail`, `av_free_`).
- **Email** — `/api/signup-email` (email→key via Resend).
- **The widget MARKUP** — currently **inline** in `welcome-page.ts:getWelcomePageHtml()` (Start-free btn L62, OAuth L64, email form L82-95). No shared partial exists → extract into e.g. `src/lib/signin-component.ts` (`renderSigninComponent(opts)`), import on target pages.
- **Secondary paths** — `account-handlers.ts`: paste-key/recover-key/referrals (relocate under the shared component's "I have an API key →").
- **Referral resolver** — key → referral code (`accountReferralsHandler` + `referral-api`/`referral-store`).

## 3. The referral bridge (R1 explicit deliverable)

**Finding:** the referral link is resolved **from the API key**, not from an OAuth/email identity directly. But OAuth callback (issues a free key for the verified email) and the email form (`/api/signup-email`) **each already mint a key**. So post-sign-in the user HAS a key → feed it to the SAME key→code resolver `accountReferralsHandler` uses.

**⇒ The bridge is UI wiring only** (thread the post-auth key into the `/referral` post-auth render), **no new table / no identity-model change**. Free keys already get referral codes (`accountReferralsHandler` accepts `av_free_`). Low-risk. Recommend implementing as the R4 "referral by any identity" path.

## 4. Invariants to prove (guardrails)

- **Entitlement (headline, AC2):** `resolveLicense` (license.ts:174) → `resolveFromApiKeyAsync` (license.ts:313) FROZEN. Assert `git diff` empty on `license.ts` + `track-token.ts`; live-resolve `cus_UepUXyDjxzx99c` (starter/active) + existing keys → identical tier before/after.
- **Secondary paths (AC3):** paste-key / recover-key / referrals still functional (tests).
- **Attribution (AC4):** `?src` first-touch (`classifySource`, write-once at `requestContext.run`) survives sign-in + OAuth redirect — stamped on the initial hit, callback only updates last-touch. Test required.
- **Frozen surface (AC5):** `tools/list`=9 (derives from `feature-registry.allToolNames()`; untouched) byte-identical; no tool-response change; no public track-record copy; no version bump.
- **Reversible:** ship behind `UNIFIED_SIGNIN_ENABLED` (default OFF → legacy layouts intact), mirroring `isNewSignupEnabled()`.

## 5. Proposed component (matches the approved mockup)

`renderSigninComponent({ page, oauthProviders, newSignupEnabled, utm })` →
- **Primary:** `Continue with Google` · `Continue with GitHub` (each gated `.live`) · `Continue with email` (magic-link / `/api/signup-email`) · `Get started free — no card` (`/api/start-free`).
- **Secondary:** `I have an API key →` (paste `av_live_`/`av_free_`) + `Recover lost key`.
- **Per-page post-auth context** (unchanged behaviors, just relocated): /signup→new key+quickstart · /account→manage plan+recover · /referral→referral link+signups+earnings.

## 6. Architect ratifications (Mr.1, 2026-07-10) — all 6 approved + 3 riders
- **Q1 → B** — `/signup` stays the paid Stripe redirect; the shared card lands on `/welcome`+`/account`+`/referral`. **Rider:** route the primary nav "Signup" CTA → `/welcome`, keep `/signup?plan=` as the paid express-lane. *(nav rider → deferred, §8.)*
- **Q2 → approved** — mock order exactly. **Rider:** "Get started free — no card" kept ONLY as the INSTANT ephemeral (no-email) path, labeled distinct from "Continue with email". *(Done — `/api/start-free` vs `/api/signup-email`, distinct labels.)*
- **Q3 → YES** — post-auth key → existing key→code resolver; no new table. *(Found already shipped in the OAuth callback — §3.)*
- **Q4 → A** — `/welcome`'s widget becomes the shared card, gated + byte-identical when OFF. *(Done — surgical swap, golden-snapshot-proven.)*
- **Q5 → YES + confirm** — returning email returns its EXISTING key. *(Verified: `mintFreeKey` idempotent on `email UNIQUE`, free-keys-store.ts:79-103 + test.)*
- **Q6 → YES** — two-flag firewall: outer `UNIFIED_SIGNIN_ENABLED` over inner `NEW_SIGNUP_ENABLED`, default OFF. *(Done — `isUnifiedSigninEnabled`.)*

## 7. system-map / status
- **system-map edges:** NO new producer→consumer edge (one new leaf module `signin-component.ts` imported by 3 existing render paths; no new route/table/cron). `system-map.md updated: n-a` — overwrite the single `Last touched:` line only (the pre-commit gate fires on the `app.get(` diff line; §5 gate-touch).
- **status.md:** appended on GREEN completion (newest-first) per CLAUDE.md step 6.

## 8. What shipped + the deferred nav rider
**Shipped (DARK behind `UNIFIED_SIGNIN_ENABLED`, default OFF → legacy byte-identical):**
- `src/lib/signin-component.ts` — the ONE shared `renderSigninComponent()` (Google · GitHub · email · Get-started-free · paste-key → · recover-key; scoped `.avsi-*` CSS/JS; OAuth+start-free gated by inner `newSignupEnabled`; `?src`+`next` threaded).
- `auth-providers.ts` `isUnifiedSigninEnabled()`; `welcome-page.ts` / `account-handlers.ts` / `referral-pages.ts` render the card when ON; `index.ts` `/welcome`+`/referral` routes + `accountPageHandler` pass the flag.
- Tests: `welcome-byte-parity.test.ts` (7 golden snapshots — OFF path byte-identical) + `funnel-fix-auth-unify.test.ts` (12 — component, 3 integrations, flags, Q5). Full vitest **3129 pass**; clean rebuild green.

**DEFERRED — nav CTA re-route (Q1 rider) → follow-up `FUNNEL-FIX-NAV-CTA-WELCOME-W1`.** Rationale: the primary nav "Signup" href is a FRAGMENTED, un-flaggable, canary-coupled surface — hardcoded across `src/lib/site-nav.ts` (SIGNUP_HREF) + `scripts/render-integrations.mjs:119` + `scripts/render-jsx-static.mjs:225` (`#Signup`→url) + ~24 committed `landing/**/*.html` outputs, AND asserted by golden fixtures (`tests/fixtures/site-nav-desktop-{account,track-record}.html`) + `design_w10_consistency.test.mjs:69` + `landing-conversion-trust.test.ts`, with a `design_w6` note that `algovault.com/signup` 404s on the apex Caddy allowlist (routing must use absolute `https://api.algovault.com/welcome` + a live route check). Doing it correctly = a focused ~30-file source+output+fixture change with live route verification — not safe to couple to this auth ship. Turnkey scope enumerated for the follow-up. The component this nav will point to ships here.

## 7. system-map / status
- **system-map edges:** render refactor + one new partial imported on 3 routes → **NONE new** unless a route/edge changes (Map Anchor: `NONE — internal render change`). Confirm at close-out.
- **status.md:** NOT appended yet — wave is HALTed at R1 awaiting architect answers (append on GREEN completion, newest-first, per CLAUDE.md step 6).
- **Artifacts land** in the worktree's `audits/` (branched off `origin/main`) as the wave's first `docs(audit):` commit **after** approval — not written into the 49-behind main checkout now.
