# FOOTER-UNIFY-W1 — endpoint-truth (Plan-Mode Step 0)

Probed 2026-06-24 against origin/main `386cf33`. Format: `claim | reality | resolution`.

## Spec-primitive probes

| Spec claim | Reality (probe) | Resolution |
|---|---|---|
| "7 distinct footer sources" | **9** distinct sources / **5 footer types** (`grep -rnE '<footer\|FOOTER_HTML\|injectFooterBadge'` → src/index.ts:4085, account-handlers ACCOUNT_FOOTER_HTML, render-integrations CANONICAL_FOOTER_HTML, render-jsx-static HOW_IT_WORKS_FOOTER_HTML+injectFooterBadge+LandingFooter, faq, glossary, SEO×16, skills/integrations) | Undercount — flag Q1 |
| "canonical = apex footer, lift verbatim, inherited everywhere" | apex = BRAND footer; faq/glossary = PAGE-NAV; 16 SEO = SEO cross-link; skills/integrations = COPYRIGHT/MIT. Apex-verbatim drops their links + MIT license | **HALT** — Q1/Q2 |
| "a build-time include/partial for the static `landing/*.html`" | No include mechanism exists; static pages from ≥4 generators + hand-authored. `generate_jsonld.mjs` is the closest (idempotent strip-reinject over all landing/*.html) but is JSON-LD-only | **Must be BUILT** (fictional as-described) — Q3 |
| "ONE shared render fn in src/index.ts imported by every Express handler" | Feasible — collapse `src/index.ts:4085` literal + `ACCOUNT_FOOTER_HTML` into one exported fn | OK (brand footers) |
| `src/index.ts:4085` footer | Confirmed at :4085 (re-grepped post-386cf33) | OK |
| Follow badge `follow.svg?product_id=1254662&theme=dark&size=small` | HTTP 200, count-free, live (PH-BADGE-COMPACT-W1) | OK; re-verify on newly-covered pages at R5 |
| "no surface lost a footer link vs pre-wave state" (R3/AC) | UNACHIEVABLE if canonical=apex-verbatim (faq/glossary/SEO/skills lose distinct links/license) | Internal AC↔canonical contradiction — Q1/Q2 |

**Fictional / premise-collision count: ≥3** (undercount; apex-verbatim-drops-links; no-include-mechanism; AC-self-contradiction) → **HALT-class** per CLAUDE.md Plan Mode ("≥3 → HALT") AND per the spec's own Method-step-3 / R1 ("HALT if footers diverge in links").

## Identifier diff (footer links cited >1 place — URL-form divergence)

| Link | apex | track-record (src/index.ts) | account-handlers | how-it-works |
|---|---|---|---|---|
| Signup | `https://api.algovault.com/signup` | `/signup` (rel) | `https://api.algovault.com/signup` | `https://algovault.com/#quickstart` |
| Privacy | `/privacy` (rel) | `/privacy` (rel) | `https://algovault.com/privacy` | `https://algovault.com/privacy` |
| Refer&Earn | `/referral` (rel) | — | — | — |

→ Relative links resolve differently per host (the cross-host 404 trap). A shared footer MUST normalize to **absolute `https://algovault.com/...`** (or per-host variants, defeating unification). Architect ruling Q4.

## system-map edge-touch

**NONE — internal landing render refactor.** No footer producer/consumer edge in `system-map.md`; prior landing-footer waves recorded `n-a`. `system-map.md updated: n-a` expected.

## Timing gate

Spec: dispatch **after the PH launch-traffic peak settles** (later 2026-06-24 / 2026-06-25) because the refactor touches apex + `/track-record`, which today's live PH launch depends on. Today = 2026-06-24 (launch day). **Architect to confirm go-now vs defer.**
