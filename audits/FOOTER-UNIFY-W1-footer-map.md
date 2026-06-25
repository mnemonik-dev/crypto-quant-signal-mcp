# FOOTER-UNIFY-W1 — footer-map truth table (Plan-Mode R1 evidence)

Built 2026-06-24 against origin/main `386cf33` (post PH-BADGE-COMPACT-W1). Read-only enumeration; **no mutation pending architect ruling.**

## Decisive finding

The 7-footer premise undercounts, and — more importantly — the footers are **5 semantically-distinct footer *types*, not one footer with style drift**. "Canonical = apex footer, lifted verbatim everywhere" would **drop user-facing nav/SEO links and the MIT-license/snapshot line** from several surfaces → violates R3/AC ("no surface lost a footer link") and Data Integrity. There is **no build-time include/partial mechanism** today; static pages come from ≥4 generators + hand-authored files.

## Footer sources (render origins)

| # | Source (file:identifier) | Renders | Type | Link set | PH badge? | URL form |
|---|---|---|---|---|---|---|
| 1 | `landing/index.html` (×2 desktop+mobile) via `render-jsx-static.mjs` `LandingFooter`+`injectFooterBadge` | apex `algovault.com/` | **Brand** | GitHub · X · Signup · Refer&Earn · Privacy | ✅ Follow | mixed (abs signup, rel /referral /privacy) |
| 2 | `src/index.ts:4085` (inline literal) | Express `/track-record` (both hosts) | **Brand** | GitHub · X · Signup · Privacy (no Refer&Earn) | ✅ Follow | rel `/signup` `/privacy` |
| 3 | `src/lib/account-handlers.ts:107` `ACCOUNT_FOOTER_HTML` | Express `/account` family (×3 pages) | **Brand** | GitHub · X · Signup · Privacy (no Refer&Earn) | ✅ Follow | abs `api.../signup` `algovault.com/privacy` |
| 4 | `scripts/render-jsx-static.mjs:1916` `HOW_IT_WORKS_FOOTER_HTML` | `landing/how-it-works.html` | **Brand** | GitHub · X · Signup · Privacy | ❌ none | Signup→`/#quickstart` |
| 5 | `scripts/render-integrations.mjs:123` `CANONICAL_FOOTER_HTML` | `landing/integrations/{binance,okx,bybit,bitget}.html` (×4) | **Brand-ish** | brand-style (confirm at extraction) | ❌ none | — |
| 6 | `landing/faq.html` (hand-authored) | `algovault.com/faq` | **Page-nav** | Home · Track Record · Glossary · Privacy | ❌ none | — |
| 7 | `landing/glossary.html` (hand-authored) | `algovault.com/glossary` | **Page-nav** | Home · FAQ · Track Record · Privacy | ❌ none | — |
| 8 | 16 SEO pages (hand-authored; `generate_jsonld.mjs` only maintains their JSON-LD, does NOT generate the page) | `algovault.com/<seo-slug>` ×16 | **SEO cross-link** | Track Record · Verify · Docs · GitHub | ❌ none | — |
| 9 | `landing/skills.html` + `landing/integrations.html` | `/skills` `/integrations` | **Copyright/MIT** | `© AlgoVault Labs · MIT licensed` + `/api/performance-public` snapshot note | ❌ none | — |

No-footer landing pages (4): `verify.html`, `docs.html`, `terms.html`, `privacy.html`.
Footer-bearing `landing/*.html`: **22 of 26** + the Express-rendered pages.

## Link-set divergence (the central HALT)

- **Brand** footers (1–5) share a TYPE but differ in links (Refer&Earn present only on apex) and URL form (relative vs absolute vs `#quickstart`). Unifiable.
- **Page-nav** (faq, glossary) carry links the apex footer LACKS (Home, Track Record, Glossary, FAQ). Apex-verbatim → **drops these**.
- **SEO** (16 pages) carry Track Record · Verify · Docs the apex LACKS. Apex-verbatim → **drops these + their SEO value**.
- **Copyright/MIT** (skills, integrations) carry the MIT-license + live-data snapshot line. Apex-verbatim → **loses the license notice + the `/api/performance-public` link** (Data-Integrity-adjacent).

## Generators / mechanisms (for "single-derivation" feasibility)

- `render-jsx-static.mjs` → apex (from VAULT JSX `v1-landing-rest.jsx`) + how-it-works + verify.
- `render-integrations.mjs` → 4 exchange tutorial pages.
- `build_landing.mjs` → docs.html + integrations.html blocks.
- `generate_jsonld.mjs` → idempotent **JSON-LD** strip-and-reinject across **all** `landing/*.html` (NOT a page/footer generator — but its pattern is the model for a footer-injector).
- 16 SEO pages + faq + glossary → **hand-authored** (no generator).
- Express → `src/index.ts` (track-record) + `account-handlers.ts` (account). No shared footer fn.

→ **No shared include exists.** "ONE footer projected everywhere" requires building a new build-time footer-injector (à la `generate_jsonld.mjs`) for static pages + a shared TS fn for Express. Significant new code, not a "lift verbatim."

## system-map edges

NONE — landing render refactor. `system-map.md` has no footer producer/consumer edge; all prior landing-footer waves recorded `system-map.md updated: n-a`. Confirmed.

---

## Architect rulings (Mr.1 2026-06-24) — folded (V2 pre-resolved)

- **Q1=A** — unify the **BRAND footer type ONLY** → 8 brand surfaces: apex (×2 artboards), `/track-record` (`src/index.ts:4085`), `/account` family (`ACCOUNT_FOOTER_HTML` ×3 pages), `how-it-works` (`HOW_IT_WORKS_FOOTER_HTML`), 4 integration tutorials (`render-integrations.mjs CANONICAL_FOOTER_HTML`).
- **Q2=A** — leave page-nav (faq, glossary) + copyright/MIT (skills, integrations) footers AS-IS (different types; revisit separately).
- **Q3=A + HARD REQ** — ONE shared footer-content module (markup defined ONCE), consumed by BOTH (a) a new build-time static footer-injector (idempotent strip-and-reinject, à la `generate_jsonld.mjs`) for the static brand surfaces AND (b) `renderFooter()` exported from `src/index.ts` for the Express handlers. Collapse ALL of: inline `src/index.ts:4085` literal, `ACCOUNT_FOOTER_HTML`, `injectFooterBadge()`, `HOW_IT_WORKS_FOOTER_HTML`, `render-integrations CANONICAL_FOOTER_HTML` → that one source.
- **Q4=Y** — all shared brand-footer links absolute `https://algovault.com/...` (cross-host safe).
- **Q5=Y** — SUPERSET link set: GitHub · X/Twitter · Signup · Refer&Earn · Privacy (+ Follow badge). Additive, zero loss.
- **Q6 → DEFER** — SEO render source CONFIRMED hand-authored (16 byte-identical footers, NO generator); per the Q6 condition, do NOT hand-add to 16 files. Defer SEO badging to follow-up **FOOTER-UNIFY-SEO-BADGE-W1** (the new injector adds just-the-badge single-source there). Flagged.
- **Q7 → DEFER to 2026-06-25** — Code's dispatch call: no evidence the PH launch peak has clearly settled; refactor touches launch-critical apex + `/track-record`. Conservative default holds.

## Locked execution design (for the 2026-06-25 single session)

1. **NEW shared footer-content module** — markup defined ONCE (superset links absolute, Follow badge inside `data-slot="social-proof-badges"`, desktop+mobile variants). **Design constraint:** must be consumable by BOTH compiled TS (`src/**`) AND the raw-node `.mjs` build scripts → author as a plain ESM `.mjs`/JSON SoT both worlds import (TS can import `.mjs`; avoids the `.ts`-from-`.mjs` runtime-loader trap; cf. CLAUDE.md `.mjs` createRequire + pure-data-constants gotchas). Test-importable.
2. `renderFooter()` in `src/index.ts` imports it; `account-handlers.ts` imports it (`ACCOUNT_FOOTER_HTML` deleted); the `src/index.ts:4085` inline literal deleted.
3. `render-jsx-static.mjs` (`injectFooterBadge` + `HOW_IT_WORKS_FOOTER_HTML`) + `render-integrations.mjs` (`CANONICAL_FOOTER_HTML`) import the same SoT.
4. **NEW build-time footer-injector** (strip-and-reinject the shared brand footer into the static brand surfaces only; runs at deploy like `snapshot-landing-data.mjs`/`generate_jsonld.mjs`). Does NOT touch the page-nav/SEO/copyright footers.
5. **Footer-drift CI canary**: zero inline brand-footer markup outside the module; single badge definition; every brand surface renders the shared marker.
6. Deploy via `deploy-direct.sh` + Caddy sync; verify the 8 brand surfaces live (apex, /track-record, /account, how-it-works, 4 integration pages) — footer + count-free Follow badge, links resolve, desktop+mobile.

V2-RESUME shape: this table is the pre-resolved drift correction; the 2026-06-25 run opens with a thin re-probe gate (confirm origin/main hasn't drifted the 5 sources; re-grep line numbers) and HALTs only on NEW drift.
