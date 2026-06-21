# P1-TRACK-RECORD-LEADERBOARD-W1 — Plan-Mode Step-0 endpoint-truth

**Wave:** P1 — Filterable, real-time track-record leaderboard
**Worktree:** `~/code/cqsm-wt-track-record` · branch `feat/track-record-leaderboard-w1` off `origin/main` @ `e49c6da`
**Probed:** 2026-06-21 · Code (read-only; no state mutation)
**Verdict:** 0 HALT-class fictional primitives. 1 naming drift (inline-fix). Ratification required before C1.

---

## Map Anchor (system-map edges)
NONE — internal `/track-record` presentation change. Reuses the EXISTING
`SIGNAL --/api/performance-public--> LANDING(/track-record)` edge. No new producer field,
route, API, or manifest. **`system-map.md updated: n-a` expected.**

---

## Step-0 probe table (`claim | reality | resolution`)

| # | Spec claim | Live reality | Resolution |
|---|---|---|---|
| 1 | `/track-record` function-rendered, `getTrackRecordPageHtml`-style | **Function-rendered** via `getPerformanceDashboardHtml(opts)` in `src/index.ts` (route `app.get('/track-record')` @ 2052 → page fn @ 3093). NO `landing/track-record.html`. Spec fn name `getTrackRecordPageHtml` = **0 hits** (fictional name). | Edit `src/index.ts` `getPerformanceDashboardHtml`. **Drift correction:** real fn = `getPerformanceDashboardHtml`. Inline-fix (spec hedged "-style"); not HALT. |
| 2 | API returns per-segment `{pfeWinRate, count}` for byTier/byExchange/byTimeframe/byAsset + overall | **Confirmed.** `overall{pfeWinRate,totalCalls,totalEvaluated}` · `byTier{tier1..4{tier,name,label,color,count,evaluated,pfeWinRate,assets[]}}` · `byExchange{BINANCE,BITGET,BYBIT,HL,OKX{count,evaluated,pfeWinRate,+nested}}` · `byTimeframe{3m,5m,15m,30m,1h,2h,4h,8h,12h,1d{count,evaluated,pfeWinRate}}` · `byAsset{<SYM>{count,tier,pfeWinRate}}` · `period{from,to}` | No new API field needed. WR = `pfeWinRate`; n = `count`. byAsset has no `evaluated` (use `count`). |
| 2b | byAsset row count (Asset-dim cap) | **864 rows** returned, keyed by symbol (e.g. `BTC`, `1000PEPE`, `BRENTOIL`). One anomalous key `"4"` (tier 4, n=78) — real returned row, render as-is. | Asset dim = 864 rows → **ratify render strategy** (Q-P1-7: scroll-all recommended). |
| 3 | Spread ≈ 0.54 → 0.95 | **Confirmed.** Timeframe: `1d` 0.5447 (n=995) … `3m` 0.9372. Asset: down to small-n outliers, up to ~0.96. overall 0.9165 (n=260,412). | Radical-transparency worst-first surfaces `1d`/low-n assets honestly. |
| 4 | Hydration: existing fetch + `data-tr-field`/setField, no 2nd fetch | **Inline `<script>`** in the page: `cachedData` ← `fetch(PERF_URL)` in `load()`; `renderAll()` hydrates; `setInterval(load, 30000)` (30s). `track-record-proxy.js` is **NOT loaded** on this page (proxy serves landing/signup/docs). | Leaderboard hooks into `renderAll()` reading `cachedData` (no 2nd fetch). Re-renders on the existing 30s loop. **Add 0 setInterval** (w11 guard = exactly 7). |
| 5 | Tokens/classes reuse | Inline `<style>` in fn + cross-origin `landing/_design/algovault-design.css` + Tailwind CDN (mint/navy/steel config). Reusable: `.section`/`.section h2` (kicker heading), `.tab`/`.tier-tab` (pills), `.recent-table` (fixed-layout transparent table), `.tf-bar-track`+`.tf-bar-fill` (WR bar — in algovault-design.css), `.green/.red/.gold/.muted`, `.tier-badge`. | Reuse those. Minimal NEW CSS for rank cell + small-sample tag + scroll wrapper → **ratify (Q-P1-5)**. |
| 6 | JSON-LD baseline (GEO add) | **0** `application/ld+json` on `/track-record` (none anywhere in `src/index.ts`). w11 test asserts `=== 0`. | R4 = **ADD 1 Dataset** (0→1). No existing PropertyValue nodes on this page to reuse → author fresh `variableMeasured` (PFE Win Rate, Sample Size). No synthetic `aggregateRating` (Data.md + google-rich-results LAW). |

---

## Sections to REPLACE (the 3 fixed blocks)
- `<div class="section"><h2>Performance by Asset Tier</h2>` — `.tier-stat-grid` ×4 `.tier-stat-card` (3352–3431), hydrated 3787–3807.
- `<div class="section"><h2>Performance by Exchange</h2>` — `.exchange-stat-grid` ×5 (3438–3516), hydrated 3814–3824.
- `<div class="section"><h2>Performance by Timeframe</h2>` — `.tf-bar-chart` ×9 (3530–3542), hydrated 3836–3849.

## PRESERVED (untouched)
KPI stat cards (Total / PFE WR) · exchange-logo strip · Cross-Venue callout · On-Chain Verified badge · merkle-stats · exchange-tabs + tier-tabs (global filters feeding `src()`) · Verify-Any-Call card · Latest Trade Calls stream · Methodology · 30s refresh · Nav/Footer chrome.

---

## Test impact (Design.md §11 — pre-edit grep)
Baseline = GREEN (zero known-failing files; pre-push gate blocks NEW failures). Replacing the 3 sections breaks these assertions → **supersession updates required same commit** (`SUPERSEDED BY P1-TRACK-RECORD-LEADERBOARD-W1`, documented-relaxation pattern):

| File | Breaking assertion(s) | Action |
|---|---|---|
| `design_w3_consistency.test.mjs` | `id="tier-stat-card-${k}"` markup (138) + `getElementById('tier-stat-card-'+k)` hydration (147) | Update to leaderboard markup/controller |
| `design_w4_consistency.test.mjs` | tier-stat-card (120) + exchange-stat-card (124) + `data-tf` (133) | Update |
| `design_w5_consistency.test.mjs` | `<h2>Performance by Timeframe</h2>` (171) + tier/ex/tf refs (175/178/182) | Update |
| `design_w8_consistency.test.mjs` | tier-stat-card (139) + exchange-stat-card (143) + `data-tf` present (147) | Update (KEEP verify-card + latest-calls + CSS-bg asserts) |
| `design_w11_consistency.test.mjs` | 22× tier-stat-card (141), 24× exchange-stat-card (147), 4× tf-bar-chart (153), ≥44 data-tr-field (220), JSON-LD ===0 (233), KPI live-bind spans (275) | Update to new baselines + flip JSON-LD →1 |
| `design_w10_consistency.test.mjs` | reads `account-handlers.ts` + `landing/index.html` only | **UNAFFECTED** ✓ |

**Hard constraints from preserved guards:** setInterval must stay **7** (w11:227); `verify-any-call-card` ≥3 (w11:159); body/Nav/Footer/artboard/H1/brand-block chrome byte-stable; 0 Build-Rule-9 forbidden phrases; 0 outcome_won/Phase-E/outcome_return_pct in rendered chrome.

## Data Integrity
Payload grep `outcome_return_pct|outcome_price|pnl|roi` = **0**. Leaderboard renders `pfeWinRate` + `count` only (allow-list). New canary: assert no P&L keys in the leaderboard render path.

## Concurrency
`src/index.ts` is a HOT file (REFERRAL-FREE-KEY f59f90c today; ~15 commits/14d). **`git fetch origin main` immediately before commit** (hot-file fetch-fetch discipline). Worktree has NO `node_modules` (`.worktreeinclude` = .env only) → `npm ci`/symlink before tsc+vitest.
