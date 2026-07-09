# FUNNEL-FIX-HUMAN-SIGNUP-W1 — flow audit (R1) + new-flow design + HALT

**Target:** T1+T2 human buyers · **Probed:** 2026-07-10 UTC · **Mode:** AUDIT-FIRST · **MUTATES the signup/auth path** (entitlement invariant is the headline guardrail). **Companion:** [`FUNNEL-FIX-HUMAN-SIGNUP-W1-endpoint-truth.md`](FUNNEL-FIX-HUMAN-SIGNUP-W1-endpoint-truth.md).

**Bottom line:** The per-surface probe (Mr.1's first ask) confirms the email gate is **NOT universal** — MCP + TG already return value keyless; the gate bites only the **web persistent-key flow** (`/welcome`→`/api/signup-email`, email `<input required>` before the key) and, downstream, webhooks (need a key). The `165→6` "leak" is **partly an artifact**: 165 = `/signup` Stripe-checkout clicks (paid-intent), 6 = free-key email signups — two different flows. So the fix targets the web free-key flow: **issue an ephemeral key + a real signal before email**, plus **stub-first OAuth one-tap**, without touching entitlement resolution. **6 architect decisions in the fenced block.**

## R1(a) — Per-surface gate map (see endpoint-truth A)
- **Value-before-email already ✓:** MCP (`/mcp`, keyless free 100/mo by ipHash), TG bot.
- **Not an email gate:** raw-API/HTTP `/x402/*` = x402-payment paywall + dark in prod by default.
- **Email/key gate (fix scope):** web `/welcome`→`/api/signup-email` (email→`av_free_`) + webhooks (need a key).
- **165→6 verdict:** partly artifact (paid-clicks vs free-keys); the real, narrow leak = humans who need a persistent web key must give email first.

## R1(b) — Flow + entitlement (see endpoint-truth B/C)
- Free: `/welcome` email form → `/api/signup-email` → `mintFreeKey` (`av_free_`, idempotent-on-email) → returns key+referral in-response + Resend email.
- Paid: `/signup` → `recordSignupAttribution` (`?src/utm`) → Stripe → webhook → `av_live_` + welcome email.
- **Entitlement INVARIANT:** `resolveLicense`→`resolveFromApiKeyAsync` (`av_live_`→Stripe, `av_free_`→free-store, none→keyless-free). **The new flow changes ISSUANCE, never RESOLUTION.** Live targets: 6 free keys + 1 paid + 10 referral codes resolve identically before/after.
- **Attribution gap:** the free-key flow captures `?ref` but NOT `?src/utm` (only `/signup` does) — the new flow must close this.
- Email = Resend (live). OAuth apps = absent → stub-first.

## Proposed new-flow design (pending Q1–Q6)
1. **Deferred identity (R2).** A "Try it / Get a key" web action issues an **ephemeral `av_free_` key** (same 100/mo quota, keyed by the key) + returns a **real signal** (server-side one `get_trade_call`) BEFORE any email. Email captured later (quota edge / referral / persistence). On email capture, **idempotently merge** ephemeral → the email's account (email = identity; carry quota usage; no orphan/double key). Behind `NEW_SIGNUP_ENABLED`. MCP/TG unchanged.
2. **OAuth one-tap (R3, stub-first).** `AuthProvider` interface + `GoogleProvider`/`GitHubProvider`/`StubProvider`; factory → Stub when creds absent (`[STUB]`). Google one-tap + "Continue with GitHub" on the signup surface behind per-provider flags; live flip = env creds.
3. **Attribution (R4).** Stamp `?src/?ref/utm` first-touch server-side at ephemeral-key + account creation; survive the OAuth redirect + the merge. Referral +500 relocated to post-value.
4. **Firewall + security:** two-flag (`NEW_SIGNUP_ENABLED` outer + per-provider/feature inner); OAuth `state` + `redirect_uri` allowlist (reuse the shared SSRF/redirect guard); ephemeral key carries normal free quota/rate guards (no unlimited-anon hole); secrets env-only. `tools/list` byte-identical.

## Entitlement / auth diff (what changes vs stays)
| stays byte-identical | changes (additive, flagged) |
|---|---|
| `resolveLicense` / `resolveFromApiKeyAsync` | NEW ephemeral-key issuance + `pending_email` state |
| existing `av_live_`/`av_free_` keys + the 1 paid customer | NEW `AuthProvider` + OAuth callback routes (stub-first) |
| `/mcp`, TG, x402 paywall | NEW deferred-identity merge on email capture |
| Stripe checkout / webhook | `/api/signup-email` gains a "return a signal + defer email" branch (legacy email-first stays behind the flag) |

## HALT — architect (Mr.1) ratification required before any build

```
FUNNEL-FIX-HUMAN-SIGNUP-W1 — Plan-Mode HALT (6 decisions). Probed live 2026-07-10.
Audit: audits/FUNNEL-FIX-HUMAN-SIGNUP-W1-flow-audit.md (+ endpoint-truth.md).
Per-surface probe done: email gate bites ONLY web-free-key + webhooks; MCP/TG already keyless;
165→6 is partly an artifact (paid /signup clicks vs free /api/signup-email keys — different flows).

Q1 [Ephemeral-key TTL + quota]. A pre-email key = a real av_free_ key with a pending_email
   flag, same 100/mo free quota keyed by the key itself. TTL if never claimed?
     (a) [rec] 7d unclaimed → auto-expire (cron/lazy); (b) 24h; (c) until quota exhausted
         then prompt email; (d) other. Quota keyed by the key (not ipHash) — confirm.

Q2 [Email-capture trigger point]. WHERE do we ask for email?
     (a) [rec] BOTH: at the quota edge (hit the free cap) AND when they want referral credit /
         a persistent key.  (b) quota-edge only.  (c) referral/persistence only.

Q3 [Key-merge semantics]. When an ephemeral key later gives an email that ALREADY has an
   av_free_ key (mintFreeKey is idempotent-on-email):
     (a) [rec] merge ephemeral USAGE into the existing key, keep the existing key, discard the
         ephemeral (email = identity; no double key). (b) promote ephemeral → permanent + alias.
   Confirm (a).

Q4 [Scope / priority]. Given 165→6 is partly artifact and MCP/TG are already keyless, the fix
   targets the WEB free-key flow (/welcome + /api/signup-email) + benefits webhooks. Is the
   ephemeral-key-on-web the priority, OR is the bigger lever clarifying the /signup(paid)→free-
   account path (the 165 clicked PAID intent)? [rec] ship ephemeral-key + OAuth on the web
   free-key surface; add a "start free (no card)" path from the /signup paid page too.

Q5 [OAuth surface + confirm stub-first]. Put Google one-tap + GitHub on /welcome (the free-key
   surface)? And confirm stub-first: wave ships GREEN with StubProvider; you create the Google/
   GitHub apps post-hoc via the batched manual step (redirect api.algovault.com/auth/{g}/callback).

Q6 [Attribution gap]. The free-key flow currently captures ?ref but NOT ?src/utm (only /signup
   does). Confirm the new flow stamps ?src/?ref/utm at ephemeral-key + account creation (so the
   scoreboard sees free-signup channel + it survives OAuth redirect + merge). [rec] yes.

Guardrail acknowledged: entitlement INVARIANT — resolveFromApiKeyAsync untouched; the 1 paid
customer + 6 free keys resolve identically (AC3 test + live check). tools/list byte-identical.
Out of scope (separate): FUNNEL-FIX-ATTRIBUTION-W1 (server-side ?src= first-touch / visitor
instrumentation) — this wave only PRESERVES ?src through its new flows.
```

**Until Mr.1 answers: NO code, NO commit, NO deploy.** Only these 2 audit artifacts exist (uncommitted, `funnel-fix-human-signup` worktree). On ratification: V2-RESUME folds the answers in, thin re-probe, then R2→R6 (deferred-identity → stub-first OAuth → attribution/entitlement preservation → tests → close-out). Ships GREEN on stub + email-link; OAuth flips post-hoc; NO version bump (accrues to the next daily RELEASE as EXTERNAL).
