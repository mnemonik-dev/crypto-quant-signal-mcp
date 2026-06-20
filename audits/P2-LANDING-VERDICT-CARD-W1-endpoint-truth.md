# P2-LANDING-VERDICT-CARD-W1 — Plan-Mode Step-0 (endpoint-truth + ratification)

**Wave:** P2 — styled verdict-with-receipts card on the landing (below-fold). **T1+T3.**
**Date:** 2026-06-20 · **Base:** worktree `feat/p2-verdict-card` off origin/main `486e725` (P0 `VERDICT-WITH-RECEIPTS-W1`).
**Map Anchor:** **NONE — internal landing change only.** Card reuses the EXISTING `SIGNAL --/api/performance-public--> LANDING` edge via existing `data-tr-field` hydration. No producer/consumer edge added/renamed/removed → **`system-map.md updated: n-a`.**
**Status:** read-only probes complete. **0 fictional primitives** (≥3 = HALT; this is 0). 2 inline-fixes/flags. NO product code touched — awaiting architect ratification of the Q-P2 table before C1.

---

## Step-0 probe table (claim | reality | resolution)

| # | Spec claim / primitive | Probe | Reality | Resolution |
|---|---|---|---|---|
| 1 | Authoring path = static dual-render JSX→HTML (not `src/` function-renderer) | `ls landing/index.html`; `grep lp-*-desktop` | `landing/index.html` 284KB/734L; surfaces `lp-hero`, `lp-rest`, `lp-belowfold` (each ×desktop+mobile) | **CONFIRMED static dual-render.** 3 edit sites resolved (below). |
| 2 | JSX SoT at `Design/AlgoVault Landing Hero v1/v1-*.jsx` | `ls` repo path → absent; `find` vault | NOT in code repo; lives in **VAULT**: `…/Design/AlgoVault Landing Hero v1/{v1-minimal,v1-landing-rest,v1-belowfold}.jsx` | **INLINE-FIX (path clarified): vault, not repo.** Renderer reads `VAULT_DESIGN`. New section → `v1-landing-rest.jsx` (pending Q-P2-1). |
| 3 | Renderer `scripts/render-jsx-static.mjs` + `--check` + targets | `grep target=` | EXISTS; targets `hero\|landing-rest\|belowfold\|verify\|how-it-works`; `patchBelowFold()` post-patch | CONFIRMED. `--check` is the dual-render parity gate (AC). |
| 4 | Dual-render surfaces (`lp-<surface>-desktop`+`-mobile`) | `grep -oE 'lp-…-(desktop\|mobile)'` | `lp-{hero,rest,belowfold}-{desktop,mobile}` — **6 artboards total; new section = `=2` (1 desktop + 1 mobile) within its surface** | CONFIRMED. AC count for the new section = **2 artboards**. |
| 5 | Reuse classes `.glow` `.card-hover` `.fade-in`; mint ramp `mint-400..600`; `emerald-400`; navy palette; `--font-display/-mono` | per-class `grep` of baked HTML | `glow`✓ `card-hover`✓ `fade-in`✓ `text-mint-400`✓ `mint-400/500`✓ `emerald-400`✓ `#060a14/#0a0e1a`✓ `--font-display`(119) `--font-mono`(183); **`mint-600` = 0 hits (unused)** | **§5 PASS — 0 new classes.** Use `mint-400` (accent) + `emerald-400` (BUY/PFE green) + `glow`/`card-hover`/`fade-in`. **FLAG:** `mint-600` cited but unused → do NOT use it (non-load-bearing). |
| 6 | `data-tr-field="pfe_wr"` + `="call_count"` exist + hydrated | `grep` baked HTML + `track-record-proxy.js` | `pfe_wr` (8 spans) + `call_count` (9 spans) live; `setField('pfe_wr', formatPfe→"91.6%")` + `setField('call_count', formatCount→"255,455")` | **Probe-4 = REUSE (markup-wrap only).** `%` INSIDE the `pfe_wr` span. 0 new hydration / 0 new poller. |
| 7 | P0 `RECEIPTS_*_TOOLTIP` + disclaimer constants | `grep src/lib/receipts.ts` | `RECEIPTS_DISCLAIMER` (L36) · `RECEIPTS_BADGE_TOOLTIP` (L45) · `RECEIPTS_CONVICTION_TOOLTIP` (L46) | CONFIRMED — reuse verbatim (tooltip/disclaimer copy SoT). |
| 8 | deploy: `landing/index.html` rides existing `cp landing/*.html` glob | `grep deploy.yml` | `cp landing/*.html /var/www/algovault/` (L116); `landing/js/*` cp'd too | **CONFIRMED — no deploy.yml/new-subdir edit.** |
| 9 | Caddy serves `/` (root) + `/track-record` route | `grep Caddyfile` | `handle { root /var/www/algovault; try_files }` catch-all + `handle /track-record` | CONFIRMED — no Caddyfile edit; CTA `/track-record` resolves. |
| 10 | Host anchors live | `curl -w %{http_code}` | `algovault.com/`=**200** · `/track-record`=**200** · `/api/performance-public`=**200** | CONFIRMED. |
| 11 | JSON-LD baseline count (R5) | `grep -c application/ld+json` | **6** blocks (spec said "≥4") | Baseline=6 → after +1 Q&A = **7** (or FAQPage mainEntity +1). Pending Q-P2-7. |
| 12 | Example call = a REAL non-HOLD BUY (Probe 5) | live `scan` + `get_trade_call` | Quiet market: majors all HOLD; only non-HOLDs = **AXS BUY 53 TRENDING_UP** (clean crypto) + CL BUY (TradFi, "market closed" caveat → rejected) + BEL BUY (obscure) | **Captured AXS** → `audits/p2-example-call-2026-06-20.json`. Pending Q-P2-3 framing+coin. |

**Concurrent-wave hygiene (§12):** `landing/index.html` is a HOT file (LANDING-CONVERSION-TRUST-W1 `f5dd562/a84b034/ae26888` + WEBSITE-X402-SURFACING-W1 + ENTITY-FOOTPRINT-W1 in last ~14d). origin/main = `486e725` (P0; no in-flight landing conflict). **`concurrent-wave-fetch-discipline-for-hot-files`: `git fetch origin main` immediately before C1 commit + re-diff after push.**

**Cross-section identifier diff:** dek wording differs between prompt Method/Context ("…you can **check** yourself", L32) and R5 ("…you can **verify** yourself", L64) → Q-P2-2 resolves. All other identifiers (classes, anchors, `data-tr-field` keys, `/track-record`, `RECEIPTS_*`) consistent across R/AC sections.

---

## Architect ratification (REQUIRED before C1 starts)

| Q-ID | Decision | Code recommendation |
|---|---|---|
| Q-P2-1 | **Insertion anchor** (surface + after which section) | NEW `LRBlock id="live-verdict"` in **`v1-landing-rest.jsx`**, as the FIRST section right after the hero (before `quickstart`/"Try it in 30 seconds.") — max first-touch/top-of-funnel. *Alt:* after `three-tools` ("3 tools, one verdict.") for thematic adjacency. |
| Q-P2-2 | **Section copy** (NEW public prose; editor-agent at C1) | kicker `· live verdict` → H2 **"One call. One verdict. Verifiable."** (mint accent on `Verifiable.`) → dek **"Direction, conviction, and the drivers behind it — with a track record you can verify yourself."** (adopt "verify", matches H2 + brand "Don't trust — verify"). Card label **"Example output"**. CTA **"View Live Track Record →"** → `/track-record`. |
| Q-P2-3 | **Example-call framing + chosen call** | DEMONSTRATIVE-FROM-REAL-EVENT → **"Example output"** label. Bake **AXS · BUY · 53% conviction · Trending up** (real, 2026-06-20 13:50 UTC; factors: trend HIGH / funding ELEVATED-bullish / breakout IMMINENT). Reject CL (TradFi/closed-market). Static verdict/conviction/factors/Why; **PFE WR + N live-bound**. |
| Q-P2-4 | **Any NEW class / CSS-var?** | **NONE.** Reuse-only: `card-hover`+`glow`+`fade-in`, `mint-400` accent, `emerald-400` BUY/PFE green, navy-800 surface, `--font-display`/`--font-mono`. (mint-600 cited-but-unused → not used.) |
| Q-P2-5 | **data-tr-field: reuse vs new** | **REUSE** existing `pfe_wr` + `call_count` (live+hydrated); markup-wrap only, `%` inside `pfe_wr` span. 0 new hydration. |
| Q-P2-6 | **JSX SoT path** | Cited repo path resolves to the **VAULT** `Design/AlgoVault Landing Hero v1/v1-landing-rest.jsx`. Inline-fix (awareness). |
| Q-P2-7 | **JSON-LD Q&A** (R5) | Baseline 6. ADD one Q&A **"What does an AlgoVault trade call return?"** → answer enumerates `{verdict, confidence, regime, factors}` + Merkle-anchored track record, appended to the existing **FAQPage `mainEntity`** (reuse existing `PropertyValue` metric nodes; no metric duplication). After = 6 blocks / FAQPage +1 Q. |

**Architect signature (ratify inline; per-row `Q-P2-N: OVERRIDE → <choice>` to override):** RATIFIED 2026-06-20 (see C1 outcome).

---

## C1 outcome (post-ratification)

**Ratification:** Q-P2-1 **OVERRIDE** → insert immediately BEFORE the `track-record` section (so the card's `Verify →` hands off into it). Resolution: a `use-cases` section sits between `three-tools` and `track-record`; the binding "handoff" rationale → card placed after `use-cases`, immediately before `track-record` (both artboards). Q-P2-2 **ACCEPT** (verbatim Why + authored prose calls-only). Q-P2-3 **OVERRIDE** → real ≥60% qualifying call. Q-P2-4/5/6/7 **ACCEPT**.

**Example re-capture (Q-P2-3):** quiet market — a 5-venue × 4-TF scan (minConfidence 60) found no STABLE ≥60 on 1h/4h/1d and only a transient 15m AXS spike (flipped to HOLD on direct capture). A tight scan→immediate-direct-capture loop caught **AXS · 1h · BUY 60 · TRENDING_UP** (the 1h candle is stable). Baked static; PFE/N live-bound. (`audits/p2-example-call-2026-06-20.json`.)

**Verbatim-reasoning "signals" note (Q-P2-2):** every BUY/SELL reasoning ends with the engine's conviction clause containing the generic TA word "signals" ("…from blended signals"). Probed the `copy-consistency.test.ts` FORBIDDEN_PHRASES — it forbids only tier-gating phrases + the old `performance://signal-stats` URI, NOT the generic word. So the verbatim Why ships faithfully (no canary trip); all AUTHORED prose stays calls-only (editor-agent PASS).

**2 fictional primitives (inline-fixed, not HALT — <3):**
1. `node scripts/render-jsx-static.mjs --check` (cited in spec Method + AC) **does NOT exist** — the renderer only renders to `--out`/stdout. Real verify = `node scripts/build_landing.mjs --check`.
2. `build_landing.mjs --check` covers `landing/docs.html` + `landing/integrations.html` ONLY — it does **NOT** bake/verify `landing/index.html`. Plus index.html has known render-vs-deployed drift (LANDING-CONVERSION-TRUST-W1) → full-regen regresses. **Resolution:** surgical dual-render insert of just the new section into both artboards, verified by (a) re-render-section **byte-equals** baked section, (b) `id="live-verdict"` ×1 (desktop) + card content ×2 (both artboards), (c) `build_landing --check` exit 0 (docs/integrations unaffected).

**Concurrent-wave reconciliation (hot-file discipline):** mid-wave, origin/main advanced `486e725`→`e7f7928` (LANDING-REFERRAL-PAGE-W1 touched `landing/index.html` footer + `render-jsx-static.mjs applyFooterUrls` — non-overlapping regions). Discarded my 2 collision-file edits, `merge --ff-only origin/main`, re-applied the 3 render-jsx edits, re-rendered + re-baked the card + JSON-LD. Referral footer (`href="/referral"` ×2) preserved; byte-consistency re-confirmed.

**Verification:** tsc clean · `build_landing --check` in-sync · full vitest **2462** + node:test canaries **0 fail** · new `landing-verdict-card.test.ts` 13/13 · dual-viewport preview GREEN (desktop 580×401 card + mobile, "Example output" + populated numbers, disclaimer at footer) · editor-agent Build-Rule-9 **PASS**.
