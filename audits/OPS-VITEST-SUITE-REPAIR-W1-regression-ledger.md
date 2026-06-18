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
| 14 | `tests/recent-signals-shape.test.ts` | 1 | `expected 'undefined' to be 'string'` — a public shape field is now undefined | shape-drift (root-cause: is field legitimately renamed/removed, or REAL shape regression?) | OPEN |
| 15 | `tests/unit/chat-engine.test.ts` | 4 | `Error: KnowledgeBundle: missing required field 'pages'` | stale **fixture** (loader now requires `pages`) | OPEN |
| 16 | `tests/unit/copy-consistency.test.ts` | 1 | README.md does not contain `'11 timeframes'` | stale public-copy canary (verify claim still true; shape-regex if phrasing drifted) | OPEN |
| 17 | `tests/unit/knowledge-index.test.ts` | 4 | `Error: KnowledgeBundle: missing required field 'pages'` | stale **fixture** (same loader requirement) | OPEN |
| 18 | `tests/unit/mcp-usage-docs.test.ts` | 2 | (a) H2 heading regex mismatch; (b) `expected 17 to be 6` `<details>` blocks | **frozen-count → shape-regex** (Build Rule 5) + heading update | OPEN |
| 19 | `tests/unit/perf-stats-cache.test.ts` | 1 | `expected undefined to be 'BUY'` — cache column-projection drops `call` vs full-row SELECT | **REAL_BUG_SUSPECTED** — C2 root-cause; if the projection genuinely drops a public field → Build Rule 6 HALT (no `src/**` fix here) | OPEN |
| 20 | `tests/unit/snapshot-capabilities.test.mjs` | 1 | `--check exits 0 when in-sync; expected 2 to be 0` (vitest `.mjs`) | snapshot-drift (deterministic) — regenerate/refresh capabilities snapshot or correct the in-sync expectation | OPEN |

### Class `B-parallel-flaky` (2 this run; +1 flaky-passed) — **C3 isolation/sequencing**

| # | File | baseline | current | Note | Status |
|---|---|---|---|---|---|
| 21 | `tests/integration/knowledge-flow.test.ts` | RED | RED (0 failed asserts; suite-level) | shared SQLite/test-state contention under parallel | OPEN |
| 22 | `tests/unit/knowledge-bundle.test.ts` | RED | RED (0 failed asserts; suite-level) | same contention class | OPEN |
| — | `tests/x402-http-routes.test.ts` | (passed) | **GREEN** (flaky-passed both runs) | system-map-documented flaky pair w/ knowledge-flow; in C3 stabilization scope though GREEN this run | WATCH |

## Hygiene delta (C4) — reconciled
- `audits/GEO-AUTOPILOT-W1-endpoint-truth.md` — **TRACKED** (`24245ec`), NOT an untracked leftover → **KEEP** (Q3). 
- Genuinely-untracked leftovers to remove in C4 (6): `audits/NPM-PUBLISH-v1.{19.0,19.1,20.0,20.1}-W1-endpoint-truth.md`, `audits/chatgpt-app-directory-submission-package.md`, `.claude/napkin.md`.

## REAL_BUG watch (Build Rule 6)
- **#19 perf-stats-cache** — `REAL_BUG_SUSPECTED`. C2 must root-cause whether the `getPerformanceStats` cache column-projection legitimately omits `call`. If a production-code (`src/**`) change is required to make the projection correct → STOP, do NOT fix here, append `WAVE1_CH2_HALT` + flag a separate dispatch.
