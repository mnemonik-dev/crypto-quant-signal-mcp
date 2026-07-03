# LANDING-MOBILE-NAV-FUNCTION-RENDERED-W1 — Step-0 truth table + execution record

Follow-up to MOBILE-NAV-HEADER-LANDING (which fixed the 24 static landing pages).
Extends the mobile nav to the FUNCTION-RENDERED navs. Checkout: worktree
`/Users/tank/code/cqsm-wt-mobilenav-fr` (branch `feat/landing-mobile-nav-function-rendered`,
off origin/main `d77f40a`). Probed + executed 2026-07-03. Status: **✅ SHIPPED via a
shared `renderSiteNav()` extraction (generator-level fix).**

## Step-0 truth table

| # | Spec premise | Actual | Verdict |
|---|---|---|---|
| 1 | "single shared generator — one `hidden sm:flex` occurrence in `src/index.ts` → patch once" | **2 navs in 2 files**: inline in `src/index.ts:3559` (/track-record) + `ACCOUNT_NAV_HTML` const in `src/lib/account-handlers.ts:87` (/account). The 3393 `hidden sm:flex` in index.ts is a code COMMENT, not a nav. | MISMATCH → prompt's ≥2 branch: **extract `renderSiteNav()`** (do not hand-duplicate) |
| 2 | Step-0.5 CSP: "same-origin fetch was BLOCKED → inline IIFE may be CSP-gated (nonce/external needed)" | `/track-record` + `/account` both HTTP 200 with **NO `content-security-policy` header** (Cloudflare-proxied, no helmet). The blocked fetch was a CORS/tooling artifact, not a page CSP. | MISMATCH (favorable) → **resolution (a): inline IIFE**, byte-identical to the static pages |
| 3 | accent token = mint | `bg-mint-500/15 border border-mint-500/30 text-mint-400 hover:bg-mint-500/25` in both navs | MATCH ✓ |
| 4 | `/account` = `accountPageHandler` ~:1570 | Route at :1570 delegates to `src/lib/account-handlers.ts`; `ACCOUNT_NAV_HTML` feeds **3** pages (getAccountPageHtml, getAccountErrorPageHtml, getAccountRecoverySuccessHtml) | Clarified — one const → 3 pages |
| 5 | probe /signup, /welcome for the nav | `/signup` (:1423) + `/welcome` (:1539) have **NO `<nav>`** (grep `<nav>` src/ = exactly 2) | Not in scope — no gap |
| 6 | body-style probe (§9): no overflow/centering that clips a slide-down panel | Panel is a child of `position:fixed` `<nav>` → not clipped by artboard/body overflow (same as the static pages, which work). No conflict. | MATCH ✓ |
| 7 | current gap | `grep -c data-mobile-nav-toggle src/` = 0 before edit | MATCH ✓ |

## Decision — extract `renderSiteNav()` (prompt's ≥2-navs directive + generator-level fix)
Created `src/lib/site-nav.ts` exporting `renderSiteNav({ active, trackRecordHref })`
returning the full `<nav>` (desktop links + hamburger) + `#mobile-menu` panel + the
controller IIFE — ONE call renders the complete working unit. The two navs differ ONLY
in: the active link (`text-mint-400 font-medium` on Track Record vs Account) and the
Track Record href (relative `/track-record` on algovault.com-served /track-record;
absolute `https://algovault.com/track-record` on api.algovault.com-served /account —
cross-origin). Both parameterized; every other byte identical.

- `src/index.ts` /track-record nav → `${renderSiteNav({ active: 'track-record', trackRecordHref: '/track-record' })}`
- `src/lib/account-handlers.ts` `ACCOUNT_NAV_HTML` → `renderSiteNav({ active: 'account', trackRecordHref: 'https://algovault.com/track-record' })` (feeds all 3 account pages)

**In-scope: 4 rendered pages via 2 call sites** (/track-record, /account, account-error, account-recovery-success).

## Verification
- **Desktop byte-equivalence (frozen oracle):** `tests/site-nav.test.ts` asserts `renderSiteNav()` output CONTAINS the exact pre-extraction desktop containers, captured verbatim into `tests/fixtures/site-nav-desktop-{track-record,account}.html`. Guarantees the "desktop unchanged" AC can never silently regress.
- **vitest:** 7 new tests pass (byte-equivalence ×3 + mobile chrome ×2 + jsdom behavior ×2 on both surfaces: open/close, aria-expanded/label, icon swap, Escape/outside/link close, zero JS errors). **Full suite 2937 passed | 6 skipped — no regression** (existing account tests pass because desktop is byte-identical).
- **R4 canary** (`scripts/check_mobile_nav_parity.sh`) extended to scan `src/**/*.ts` in addition to `landing/**/*.html`: GREEN, and proven exit 1 on a throwaway `src/*.ts` carrying the desktop sig without a toggle.
- **Rendered handlers:** all 3 compiled account page-builders include `data-mobile-nav-toggle` + `#mobile-menu` + controller + the byte-identical desktop nav.
- **CSP resolution:** inline (no CSP header on either page).
- **Post-deploy:** `curl https://algovault.com/track-record` + `https://api.algovault.com/account` grep `data-mobile-nav-toggle` ≥ 1; `docker exec … grep -c data-mobile-nav-toggle /app/dist/lib/site-nav.js` ≥ 1 (extraction moved the string from dist/index.js → dist/lib/site-nav.js — the AC's "helper" case).

## Closes
The MOBILE-NAV-HEADER-LANDING REPORT-ONLY follow-up note (function-rendered pages share the gap) — now fixed.
