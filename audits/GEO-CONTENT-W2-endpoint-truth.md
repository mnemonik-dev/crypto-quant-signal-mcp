# GEO-CONTENT-W2 — endpoint-truth (Plan-Mode Step 0)

**Wave:** GEO-CONTENT-W2 — 8 answer pages on the remaining measured GEO queries (Tier-2 Bulk-Spec, C1→C4).
**Probed:** 2026-06-15, `origin/main` HEAD `2dcf115` + live `algovault.com` / `api.algovault.com` / live MCP server (`tools/list`=9).
**Verdict:** ✅ **0 fictional primitives.** All frozen W1 inputs present; deploy path, skip mechanism, baselines, API shape, and live tool signatures confirmed. **PROCEED after architect approves** (one reply): the copy-tone preview, the per-page FAQ question sets, the 3 framework + composite honest-scope sentences, and the query-echo canary-exemption design (§ "Decision"). No Cowork Q-block needed (no fictional primitives) — this is the spec-mandated copy-approval gate.

---

## Step-0 probe table (`claim | reality | resolution`)

| # | Claim (spec) | Reality (probed) | Resolution |
|---|---|---|---|
| 1 | Frozen W1 generator exists (`a6b3626` lineage): template, content-source-map, canary | All 3 present, last-touch = `a6b3626` (W1 C1) | ✅ Author FROM them; do NOT modify assertion logic |
| 2 | Canary globs or holds explicit slug array? | **Explicit `ANSWER_SLUGS` array** (8 W1 slugs, `geo_answer_page_invariants.test.mjs:24-33`) + `existsSync` gate (`:34`). Prose-`signal` exemption = `IDENTIFIERS` regex only (`:61`) | **Extend array 8→16** + add slug-scoped query-echo allowlist (§ Decision). `existsSync` gates which exist, so the full array is safe from C1. Assertion logic otherwise frozen |
| 3 | JSON-LD skip mechanism W1 used | `FILES_TO_SKIP` Set (`generate_jsonld.mjs:78`, filtered `:200`) + `GEO_CONTENT_SLUGS`/`managedPages` (`geo_jsonld_consistency.test.mjs:50,56`). Both hold `<slug>.html` strings | **C4 adds the 8 W2 `<slug>.html` to BOTH sets**, identical to W1 |
| 4 | Top-level `landing/<slug>.html` served by Caddy `try_files`; `cp landing/*.html` non-recursive; `deploy-direct.sh` is live path | `deploy-direct.sh`: `reset --hard origin/main` (`:65`) → `snapshot-landing-data.mjs` fail-open (`:72`) → `cp landing/*.html /var/www/algovault/` (`:77`, **non-recursive** — `_templates/` not copied) → cp _design/js/assets/*.txt/sitemap → `docker compose up -d --build --force-recreate mcp-server` (`:113`). Caddy dir `/var/www/algovault/` | ✅ deploy-direct.sh is the path; template stays 404; must push to origin/main before deploy (host resets to it) |
| 5 | 8 W2 slugs 404 (free); capture sitemap/llms/llms-full baselines | All 8 = **404** ✅. **`SITEMAP_BASE=34`**, **`LLMS_BASE=21`**, **`LLMS_FULL_BASE=24`** | C4 gate asserts +8 each (→ 42 / 29 / 32). Base-relative, no absolute literal |
| 6 | `/api/performance-public` field names (`totalCalls` not `totalSignals`); `shadow_venue_count` present | Live keys: `totalCalls=234785`, `totalHolds=20816302`, `hold_rate=98.9`, `asset_count=851`, `exchange_count=5`, `timeframe_count=11`, `shadow_venue_count=12`, `overall={pfeWinRate=0.9159,totalCalls,totalEvaluated}` | ✅ Use `totalCalls`. `shadow_venue_count` EXISTS in API — but see #7 |
| 7 | `data-tr-field` span keys hydrated by `track-record-proxy.js`; flag any new key | Hydrated: `pfe_wr` `call_count` `hold_rate` `asset_count` `exchange_count` `timeframe_count` `batch_count`. **`shadow_venue` = 0 mentions → NOT hydrated** | **No `shadow_venue_count` span** (Build Rule 4). Cross-venue framing on composite/funding pages = `exchange_count` span + qualitative language |
| 8 | Live tool signatures (`get_trade_call`, `get_market_regime`, `scan_funding_arb`, `scan_trade_calls`) | Live (server `d2074c47…`, tools/list=9): `get_trade_call(coin*,exchange?,timeframe?,includeReasoning?,assetClass?)`; `get_market_regime(coin*,exchange?,timeframe?{1h,4h,1d})`; `scan_funding_arb(limit?,minSpreadBps?)` **no exchange arg ✅**; `scan_trade_calls(exchange?,timeframe?,topN?,limit?,minConfidence?,includeHolds?)` | ✅ Snippets use only these params. `get_equity_*` exist but FORBIDDEN on crypto pages (equities under HOLD) |
| 9 | Organization `@id = https://algovault.com/#organization` | Present in `index.html` (4×, the canonical node) | ✅ New pages REFERENCE it (author/publisher), never redefine |
| 10 | calls-not-signals query-echo exemption design | Current canary exempts only `IDENTIFIERS`. 2 query-echo cases need slug-scoped allowlist | **§ Decision** — proposed, awaiting approval |
| 11 | system-map edge-touch | `system-map.md` not in code repo (vault planning doc). Existing edge `LANDING → search-engine/LLM-crawler` (GEO-W1/AI-CRAWLER-ACCESS-W2) | **NONE — internal content addition.** Add n-a last-touched row to vault `system-map.md` at C4; status `system-map.md updated: n-a` |
| 12 | Copy-tone preview | Drafted in the exemplar (`best-mcp-servers-crypto-trading.html`) voice | Surfaced for approval (this HALT) |

---

## Decision — the query-echo canary exemption (Step-0 #10, architect-confirm)

The frozen canary's prose-`signal` test (`:102-106`) strips `IDENTIFIERS` then forbids any `\bsignals?\b`. Two W2 pages must echo the buyer's literal measured-query **category phrase** — never AlgoVault's own output (still "calls"). Proposed: a **slug-scoped, phrase-scoped allowlist** added beside `IDENTIFIERS` (assertion structure unchanged — only a per-slug strip added):

```js
// GEO-CONTENT-W2: two architect-approved query-echo exceptions — the buyer's literal
// measured-query category phrase, NEVER AlgoVault's own output (still "calls" everywhere).
// Slug-scoped + phrase-scoped: the global prose-"signal" check stays HARD on all 14 others,
// and any OTHER stray "signal" on these two pages still fails (only the exact phrase is stripped).
const QUERY_ECHO_EXEMPT = {
  'crypto-signal-providers-verifiable-track-record': /\bsignal providers?\b/gi,
  'crypto-trade-call-api-for-ai-agents': /\bcrypto signal API\b/gi,
};
// in the prose-signal test, after the IDENTIFIERS strip:
//   const echo = QUERY_ECHO_EXEMPT[slug]; if (echo) p = p.replace(echo, ' ');
```

- **Verifiable page** (`/crypto-signal-providers-verifiable-track-record`): "signal providers" allowed (market-category term + the literal buyer query) in title/H1/body. AlgoVault's output = "trade calls / calls" everywhere.
- **Agent-API page** (`/crypto-trade-call-api-for-ai-agents`): "crypto signal API" allowed ONLY inside one FAQ **question** (buyer's words), answered in "calls".
- Properties: phrase-scoped (a bare "signal" still fails on these two); slug-scoped (the other 14 unaffected); satisfies C3 AC "canary still flags stray prose signal".

**Canary edit timing (my recommendation):** apply BOTH edits (array 8→16 + `QUERY_ECHO_EXEMPT`) as the **first step of C1**, framed as the coverage-list + approved-exemption setup — NOT touching any assertion. Rationale: makes the per-chapter ACs literally true (C1 "canary GREEN over all 3", C2 "all 6", C3 "all 8" + "exemption holds") and catches W2-page regressions from C1 rather than only at C4. (Spec puts the array edit in C4; recommending earlier because the per-chapter canary ACs depend on it. Architect may veto → fall back to C4-only.)

---

## Captured baselines (persisted at C4 start)
- `SITEMAP_BASE = 34` → assert 42
- `LLMS_BASE = 21` → assert 29
- `LLMS_FULL_BASE = 24` → assert 32

## Adaptations / notes
- `shadow_venue_count` API field exists but is **not hydrated** → no new span; `exchange_count` + qualitative cross-venue (composite/funding pages). Pre-specified by Build Rule 4.
- `system-map.md` + `brand-facts.md` are vault planning docs, not in the code repo — M-phrase SoT drawn from the frozen `audits/GEO-CONTENT-W1-content-source-map.md` (distills M1–M7) + the live W1 pages.
- origin/main moved past the W2-llms-full commit (parallel `FIX-GEMINI-GOOGLE-INDEX-PRESENCE-W1` landed) → **rebase before each C-phase push** (W1 pattern; disjoint files).
- No version bump / CHANGELOG / publish / Discussion / X (daily RELEASE wave only). Deploy via `deploy-direct.sh` (GHA down). Per-file `git add`. No-TG-on-completion.
