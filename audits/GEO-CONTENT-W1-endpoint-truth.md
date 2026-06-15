# GEO-CONTENT-W1 — Plan-Mode endpoint-truth (Step 0)

**Wave:** GEO-CONTENT-W1 — 8 NEW top-level answer/comparison pages (5 head + 3 comparison) from one reusable template + invariants canary. Tier-2 Bulk-Spec, C1→C4.
**Repo:** `~/code/crypto-quant-signal-mcp` @ `origin/main` `7d3677c` (synced 0/0; spec mandates deriving anchors from `origin/main`, NOT the ~6wk-stale vault mirror). **Date probed:** 2026-06-15.
**Verdict: 1 fictional primitive (inline-fixable) → PROCEED after architect approves the copy-tone preview + FAQ questions (Step 0 #10).**

---

## Step 0 — system-map edge-touch (probe #9)
`grep -niE 'LANDING|landing→|search-engine|crawler' system-map.md` → the `landing/* → Caddy → search-engine/LLM-crawler` producer edge ALREADY exists (GEO-W1 + AI-CRAWLER-ACCESS-W2). 8 new `landing/<slug>.html` + sitemap/llms entries are **content INSIDE that edge** — no new producer→consumer edge, no MCP tool (`tools/list`=9), no postgres column, no public-response-shape change. → **`system-map.md updated: n-a`** + prepend a last-touched row at C4 (per `system-map-updated-n-a-with-last-touched-row-precedent`).

---

## Probes — `claim | reality | resolution`

| # | Probe | Reality | Resolution |
|---|---|---|---|
| 1 | **Routing** — top-level `landing/<slug>.html` served by Caddy `try_files` catch-all; `cp` glob doesn't recurse into `_templates/` | `grep app.get src/index.ts` → only `/integrations/:slug`, `/docs/integrations/:slug`, `/knowledge/:slug.json` routes; **NO route intercepts top-level slugs**. `deploy-direct.sh:77` `cp landing/*.html` is **non-recursive** → subdirs not copied. Live `/_jsonld/*.template → 404` proves subdir templates are non-served. | ✅ New top-level slugs are static via Caddy. `landing/_templates/answer-page.template.html` → non-served (canary asserts `/_templates/… → 404`). No `deploy.yml`/`Caddyfile`/`src` edit. |
| 2 | **Deploy** — `deploy-direct.sh` primary; serve dir + reload | `deploy-direct.sh` = the on-host SSH block (git reset→snapshot→`cp landing/*.html` → `/var/www/algovault/`→rebuild mcp-server). GHA `deploy.yml` down/flagged (confirmed every status entry since 2026-06-11). | ✅ Deploy via `scripts/deploy-direct.sh`; serve dir `/var/www/algovault/`. |
| 3 | **Slugs free + baselines** | All 8 slugs → **404** (free). `SITEMAP_BASE=26`, `LLMS_BASE=13`. | ✅ Gate targets: sitemap **34** (26+8), llms **21** (13+8). Baselines persisted to `/tmp` at C4 start. |
| 4 | **API shape** | `keys` ⊇ `byTier`(tier1-4), `byExchange`(BINANCE/BITGET/BYBIT/HL/OKX), `byTimeframe`(10), `byAsset`(851), `overall.pfeWinRate`, `hold_rate`, `totalHolds`, `totalCalls=233226`. **`totalSignals` = null.** | ✅ all `data-tr-field` source fields present. **Clarification (not a defect):** spec Step0#4 lists `totalSignals`; the live field is `totalCalls`. The proxy already maps span `call_count → perf.totalCalls` (proxy:131, comment "read canonical totalCalls only; legacy totalSignals dropped"). Use span key `call_count`. |
| 5 | **JSON-LD baseline + entity** | index.html has 6 inline `<script type="application/ld+json">` blocks; `"@id": "https://algovault.com/#organization"` present (ENTITY-FOOTPRINT-W1, sameAs github/x/npm/crunchbase/g2). | ✅ New pages REFERENCE `@id`, never redefine the Org node. Proven TechArticle pattern (docs.html): `headline` + ISO `datePublished/dateModified` (`…T00:00:00+00:00`) + `image` ImageObject(512²) + `publisher.logo` ImageObject — all per `google-rich-results`. New pages swap docs.html's inline `author/publisher` Organization → `{"@id":"https://algovault.com/#organization"}`. |
| 6 | **Schema validity (external first-use)** | The JS validators (validator.schema.org / Google Rich Results Test) can't be driven programmatically from here. | ✅ Validity asserted by **reuse of proven-valid live patterns**: TechArticle (docs.html, validated WEBSITE-REFRESH-W1), FAQPage (faq.html/index.html, live), Organization `@id` ref (ENTITY-FOOTPRINT-W1, live). `aggregateRating` **absent by design** (GEO-HYGIENE-W1 removal + `google-rich-results` §4 synthetic-rating spam-risk). Canary `JSON.parse`s every block. **LIVE Google Rich-Results Test = a confirm step on the C1 exemplar URL post-deploy** (`https://algovault.com/best-mcp-servers-crypto-trading`); record result in C1 status. |
| 7 | **`data-tr-field` hydration** | `landing/js/track-record-proxy.js` hydrates `pfe_wr, call_count(→totalCalls), batch_count, hold_rate, exchange_count, asset_count, timeframe_count` (+ `total_calls_executed`). | ✅ All 7 span keys the wave uses are **already hydrated** — no new hydration line needed. `%` goes INSIDE the span (Design.md §6). |
| 8 | **Canary + runner + pre-commit** | **⚠️ `lib/check-numerical-fact-density.mjs` / `scripts/check-numerical-fact-density.*` = ABSENT** (find + grep across repo, only `security-canary.mjs`/`stripe-webhook-events-canary.sh`/`audit-r4-*` exist). `npm test`=`vitest run`; the `.test.mjs` canary runs via **`node --test`** (deploy.yml:71 runs `geo_jsonld_consistency.test.mjs` that way). `scripts/check_system_map.sh` present (pre-commit gate). | **FICTIONAL PRIMITIVE #1 → INLINE FIX:** the cited numerical-fact-density canary doesn't exist (CLAUDE.md↔repo drift). Enforce numeric-anchoring **inside `geo_answer_page_invariants.test.mjs`** instead: assert every page has ≥1 `data-tr-field` AND no bare 2+-digit numeral in prose outside `<code>`/`data-tr-field`/version/date. Drop the absent-canary step from the C4 gate. Runner = `node --test`; wire the new test into deploy.yml:71 (additive, for when GHA returns). |
| 9 | **system-map edge-touch** | see Step 0 above | `NONE — internal content addition`. n-a. |
| 10 | **Copy-tone preview + FAQ** | drafted (below) | **SURFACED for architect approval — HALT here.** |

---

## Identifier diff (slug ↔ query_id ↔ H1 ↔ gate)
8 slugs are consistent across the page table, all 3 chapter gates, and the C4 sitemap/llms loop (verified char-for-char): `best-mcp-servers-crypto-trading` · `ai-agents-crypto-trade-calls` · `build-crypto-trading-agent-python` · `claude-crypto-trading-stack` · `trade-calls-for-python-backtesting` · `algovault-vs-raw-indicator-tools` · `build-vs-buy-trading-model` · `single-venue-vs-cross-venue-mcp`. No mismatch. ✅

## Gate adjustments (baked into C1/C4)
- C4 sitemap gate: `LOCS == 26+8 == 34`; llms gate: `LLMS == 13+8 == 21` (from Step-0 baselines, no absolute literal).
- C4 numerical-fact-density-canary step → **removed** (absent); replaced by the invariants-canary numeric-anchoring assertion (fix #1).
- Canary runner = `node --test tests/unit/geo_answer_page_invariants.test.mjs` (+ wire into deploy.yml:71).
- Live Google Rich-Results Test on the C1 exemplar = a recorded confirm (probe #6).

## Fictional-primitive tally
**1** (numerical-fact-density canary). < 3 → PROCEED, inline-fix above. (The `totalSignals` item is a clarification, not a fictional primitive — `totalCalls`/span `call_count` is the live path.)

**HALT for architect approval of the copy-tone preview + per-page FAQ questions + honest-scope sentences + ratification of inline-fix #1. C1–C4 do NOT start until approved.**
