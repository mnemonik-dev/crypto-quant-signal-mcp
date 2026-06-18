# OPS-VITEST-SUITE-REPAIR-W1 — Regression Ledger

**Generated:** C1, 2026-06-18 · live HEAD `eb97cf9` (v1.20.1) · baseline `ddb7a87`.
**Method:** `rotten-suite-regression-ledger-worktree-baseline` — full `vitest run` (JSON reporter) at HEAD + at a throwaway worktree on `ddb7a87`; failure-SET `comm` diff; `node --test` for the node:test canaries as `deploy.yml` invokes them.
**Status column** is updated by C2/C3/C4 as files are repaired/stabilized.

## Summary

| Run | Failed files | Failed cases | Total files |
|---|---|---|---|
| current `eb97cf9` (vitest run) | **22** | **14** | 221 |
| baseline `ddb7a87` (vitest run) | **22** | 13 | (same 22-file set) |
| node:test canaries (`node --test`, 13 .mjs) | **0** | 0 | 464 tests pass |

**Failure-SET diff (comm):** NEW-in-current = **0**, disappeared-since-baseline = **0**, COMMON = **22**. The failing file set is **identical** and **stable** between `ddb7a87` and `eb97cf9`. (All 14 failed *cases* live in the 7 A-stale-vitest files; the other 15 failed files have 0 failed assertions — 13 file-level "No test suite found" + 2 flaky suite-level failures.)

## Baseline-vs-current reconciliation (the "22 vs 20" question)

The 2026-06-18 finding observed current=20 ⊂ baseline=22. Re-measured now, **both `ddb7a87` and `eb97cf9` = 22 failing files, identical set**. The 20↔22 wobble is the **nondeterministic Class-B flaky set** flipping run-to-run (pass-in-isolation, contend under concurrent vitest on shared SQLite/test-state). This run: `knowledge-flow` + `knowledge-bundle` RED, `x402-http-routes` GREEN (flaky-passed), `snapshot-capabilities` RED (its failure is a *deterministic* snapshot-drift assertion, distinct from flakiness). Conclusion: a **stable 22-file rotten baseline**; repairs start here, and the residual nondeterminism is exactly what C3 removes.

## The 22 failing files

### Class `runner-misglob` (13) — node:test files mis-collected by vitest → **C3 vitest `exclude`**
All import `node:test`/`node:assert`; vitest reports **"No test suite found in file"**; deploy.yml runs 2 of them via `node --test`; all 13 **PASS under `node --test` (464/464)**. NOT stale assertions — the canonical runner is node:test. Reclassified from spec's "Class A" per Build Rule 8.

| # | File | baseline | current | Planned action | Status |
|---|---|---|---|---|---|
| 1–9 | `tests/unit/design_w{3,4,5,6,7,8,9,10,11}_consistency.test.mjs` | RED(vitest) | RED(vitest) | C3 exclude from vitest include | OPEN |
| 10 | `tests/unit/geo_answer_page_invariants.test.mjs` | RED(vitest) | RED(vitest) | C3 exclude (also a deploy.yml `node --test` gate) | OPEN |
| 11 | `tests/unit/geo_jsonld_consistency.test.mjs` | RED(vitest) | RED(vitest) | C3 exclude (also a deploy.yml `node --test` gate) | OPEN |
| 12 | `tests/unit/how_it_works_consistency.test.mjs` | RED(vitest) | RED(vitest) | C3 exclude from vitest include | OPEN |
| 13 | `tests/unit/landing_faq_glossary_substrate.test.mjs` | RED(vitest) | RED(vitest) | C3 exclude from vitest include | OPEN |

### Class `A-stale-vitest` (7 files / 14 cases) — **C2 assertion/fixture corrections**

| # | File | Cases | Failure reason (first line) | Sub-class | Status |
|---|---|---|---|---|---|
| 14 | `tests/recent-signals-shape.test.ts` | 1 | `expected 'undefined' to be 'string'` (s.call) | A-stale public-shape — PERFORMANCE-PUBLIC-SANITIZE-W1 (`c27bba0`) stripped call/confidence from the recentSignals[] allow-list; test asserted the pre-hardening shape. **NOT a regression.** | ✅ FIXED C2 |
| 15 | `tests/unit/chat-engine.test.ts` | 4 | `pages` missing → then `bundle_version: expected 2, got 1` | A-stale **fixture** — BUNDLE-EXPAND-BLOG-W1 added required `pages` + bumped `_algovault.bundle_version` 1→2 | ✅ FIXED C2 (`pages: []` + `bundle_version: 2`) |
| 16 | `tests/unit/copy-consistency.test.ts` | 1 | README.md lacks `'11 timeframes'` | A-stale public-copy — README forward-stabilized by GEO-REGISTRY-RANK-README-REFRESH-W1 (`e511b28`); literal claim lives on landing copy. **ALSO parallel-flaky** (file-level fail under load, passes isolated) → Class-B | ✅ stale-assertion FIXED C2 (dropped README from loop, landing surfaces kept exact); ⚠️ flakiness → C3 |
| 17 | `tests/unit/knowledge-index.test.ts` | 4 | `pages` then `bundle_version` (as #15) | A-stale **fixture** (same BUNDLE-EXPAND-BLOG-W1 schema bump) | ✅ FIXED C2 (`pages: []` + `bundle_version: 2`) |
| 18 | `tests/unit/mcp-usage-docs.test.ts` | 2 | H2 regex mismatch; `expected 17 to be 6` `<details>` | A-stale — doc restructured ("Connect Your MCP Client" now `<h3>` under an "Integration" `<h2>`; 17 details across 3 sections) | ✅ FIXED C2 (heading `<h2>`→`<h[23]>`; `toBe(6)`→`toBeGreaterThanOrEqual(6)` per Build Rule 5) |
| 19 | `tests/unit/perf-stats-cache.test.ts` | 1 | `expected undefined to be 'BUY'` (sampleA.call) | **REAL_BUG CLEARED** → A-stale public-shape. `formatPublicRecentSignal` is a SECURITY-CRITICAL 6-key allow-list (`c27bba0`); `call`/`confidence` deliberately stripped (live on /api/recent-calls). Production correct-by-design; test stale. **No `src/**` change; no Build Rule 6 HALT.** | ✅ FIXED C2 |
| 20 | `tests/unit/snapshot-capabilities.test.mjs` | 1 | `--check` exit 2 not 0 | NOT a stale assertion — env-dependent: `--check` reads `dist/lib/capabilities.js`; fails only on a STALE `dist` (missing `dist` fail-opens to 0). Genuinely in-sync once built. | ✅ GREEN w/ fresh dist; robustness `beforeAll` build → C3; gate builds first → C4 |

### Class `B-parallel-flaky` (2 this run; +1 flaky-passed) — **C3 isolation/sequencing**

| # | File | baseline | current | Note | Status |
|---|---|---|---|---|---|
| 21 | `tests/integration/knowledge-flow.test.ts` | RED | RED (0 failed asserts; suite-level) | shared SQLite/test-state contention under parallel | OPEN → C3 |
| 22 | `tests/unit/knowledge-bundle.test.ts` | RED | flaky (RED C1; GREEN C2 runs) | same contention class; nondeterministic | OPEN → C3 |
| 16b | `tests/unit/copy-consistency.test.ts` | (discovered C2) | flaky (GREEN isolated; file-level RED under load, no message) | pure file-read test — flakiness is worker/parallel-load artifact, not shared mutable state; investigate in C3 | OPEN → C3 |
| — | `tests/x402-http-routes.test.ts` | (passed) | **GREEN** (flaky-passed all runs) | system-map-documented flaky pair w/ knowledge-flow; in C3 stabilization scope though GREEN every run | WATCH |

## Hygiene delta (C4) — reconciled
- `audits/GEO-AUTOPILOT-W1-endpoint-truth.md` — **TRACKED** (`24245ec`), NOT an untracked leftover → **KEEP** (Q3). 
- Genuinely-untracked leftovers to remove in C4 (6): `audits/NPM-PUBLISH-v1.{19.0,19.1,20.0,20.1}-W1-endpoint-truth.md`, `audits/chatgpt-app-directory-submission-package.md`, `.claude/napkin.md`.

## REAL_BUG watch (Build Rule 6) — RESOLVED, zero real bugs
- **#19 perf-stats-cache** — `REAL_BUG_SUSPECTED` **CLEARED at C2 (NOT a real bug).** Root cause: `formatPublicRecentSignal` (`src/lib/performance-db.ts:2304`) is a SECURITY-CRITICAL 6-key allow-list (`id, coin, tier, timeframe, exchange, created_at`) shipped by PERFORMANCE-PUBLIC-SANITIZE-W1 (`c27bba0`, 2026-05-15); `call`/`confidence` were deliberately stripped from `recentSignals[]` (they remain public on `/api/recent-calls` via `formatRecentCallRow`). Production is correct-by-design; the test asserted the pre-hardening shape. Fixed in the TEST only — no `src/**` change, no `WAVE1_CH2_HALT`. **Zero REAL_BUG rows remain across the 22-file set.**
