# REFERRAL-WEB-FIX-W1 — Plan-Mode Step-0 endpoint-truth

Probed `origin/main` @ `e49c6da` (zero drift on wave files). Mr.1 ratified Q1–Q4.
Bulk-Spec C1 (referee landing / the #1 bug) → C2 (share UX + copy).

| Anchor | Reality (re-probed) | Resolution |
|---|---|---|
| `shareLink` | `referral-constants.ts:57` — URL **builder** (editable; NOT a frozen term). **4 web callers**: signup-email resp (`index.ts:2406`), welcome email (`email.ts:63`), TG-API `share_url` (`referral-api.ts:76`), `/account` stats (`referral-pages.ts:81`) | retarget → `https://algovault.com/join?ref=${code}` (one edit → all web links) |
| TG `share_url` vs `deep_link` | `referral-api.ts:57` comments: `share_url`=web `/signup?ref=`, `deep_link`=`t.me/<bot>?start=ref_`. `deep_link` built by `tgDeepLink()` (`:42`, t.me) — NOT shareLink. Bot shares/display the **deep_link** (`handlers.py:1198 build_share_url(deep_link,…)`, `referral.py` body) | retarget touches only the WEB `share_url`; **TG native deep-link UNTOUCHED** (Mr.1 caveat satisfied) |
| apex `/join` | greenfield (apex+api 404); function-page apex proxy works (`/track-record`, `/how-it-works` → 200) | **option B feasible, no fallback.** `app.get('/join')` + Caddyfile `handle /join` (mirror `/track-record` `index.ts:2052`) |
| `/signup` no-plan | `index.ts:1421` → `400 getSignupPageHtml()`; ref captured `1405-1412` | ref present + no plan → **302 → `https://algovault.com/join?ref=`**; paid `?plan=…&ref=` checkout UNCHANGED |
| apex `/api/signup-email` | LIVE (Caddyfile:53; live POST returns `av_free_` key) | `/join` start-free form POSTs same-origin |
| `processFreeReferralSignup` | grants 500 + attribution on valid ref — `referral-accrual.ts` | `/join` free CTA → `/api/signup-email?ref=` → real grant |
| plan cards | inside `getSignupPageHtml()` (`index.ts:4019`) / `signup-flow.ts` | extract shared `renderPlanCards()`; **getSignupPageHtml byte-IDENTICAL** (snapshot `/signup` to confirm) |
| bonus | one-time `REFERRAL_TERMS.BONUS_CALLS` (500); `freeMeterCharge` monthly-then-bonus | copy "one-time, on top of 100/mo" |
| keyless | `license.ts:285` no-key → `free:${ipHash}` | byte-identical (untouched) |

## Identifier diff
- NEW `GET /join` (apex fn route + Caddyfile `handle /join`) · `?ref=` param · new source `'join-page'`
- `shareLink(code)` → `https://algovault.com/join?ref=${code}` (was `api.algovault.com/signup?ref=`)
- `/signup?ref=` (no plan) → `302 https://algovault.com/join?ref=`
- SoT: `bonusCallsLabel()`→"500"; `{LINK}`→`shareLink()`

## Ratified decisions
- Q1: `/join` = minimal `/referral` dark-mint shell. Q2: shared `renderPlanCards()` (getSignupPageHtml byte-preserved).
- Q3: retarget 4 WEB callers + `/signup?ref=` 302; **TG native deep-link untouched**. Q4: copy approved verbatim (SoT live-inject only).
