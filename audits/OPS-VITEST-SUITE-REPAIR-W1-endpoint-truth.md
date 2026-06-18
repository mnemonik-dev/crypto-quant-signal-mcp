# OPS-VITEST-SUITE-REPAIR-W1 — Plan-Mode endpoint-truth

**Wave:** OPS-VITEST-SUITE-REPAIR-W1 (Tier-2 Bulk-Spec, META / internal verification-gate hygiene). NOT a release / NOT a hotfix.
**Produced:** C1 (2026-06-18), live HEAD `eb97cf9` (v1.20.1), baseline `ddb7a87`.
**Verdict:** Plan-Mode HALT raised on **3 spec-vs-reality gaps** (≥3 → architect ratification per CLAUDE.md). All 3 ratified by Mr.1; corrections folded below. Core of the wave (test-file set, runners, scripts-to-mirror) is fully grounded — every cited primitive verified live.

## Step-0 environment (live-probed)

| Primitive | Probe | Reality |
|---|---|---|
| Repo / remote | `git remote -v` | `~/code/crypto-quant-signal-mcp`, origin `AlgoVaultLabs/crypto-quant-signal-mcp` ✓ |
| Baseline commit | `git cat-file -t ddb7a87` | exists ✓ ("restore green landing/design canary suite") |
| Test runner | `package.json` | `"test": "vitest run"`, `"test:watch": "vitest"` ✓ — vitest **3.2.4** installed |
| vitest config | `find . -iname 'vitest*'` + `pkg.vitest` | **NONE** → pure defaults → default `include` matches `**/*.test.{ts,mjs}` (vitest DOES run `.mjs`) |
| node:test gate | `deploy.yml:75-76` | `node --test tests/unit/geo_jsonld_consistency.test.mjs tests/unit/geo_answer_page_invariants.test.mjs` — **only 2** files; deploy.yml never runs `npm test` (confirms eroded vitest gate) |
| Class-A/B files | `find tests` | all cited files exist (paths in ledger); `x402-http-routes` is in `tests/` ROOT (not `tests/integration/`) |
| Scripts to mirror | `ls scripts/` | `check_system_map.sh` + `install_system_map_hook.sh` exist ✓; `check_test_baseline.sh` / `install_test_gate_hook.sh` absent ✓ (C4 creates) |
| Worktree env | `git worktree list` | **15 active worktrees** — not sole session → worktree-first LAW in force; node_modules **symlinked** to primary (repo convention) |

## Truth table — claim | reality | resolution (the 3 HALT gaps + ratification)

| # | Spec claim | Reality (probed) | Ratified resolution |
|---|---|---|---|
| 1 | C4: `audits/GEO-AUTOPILOT-W1-endpoint-truth.md` is an untracked leftover to `rm` | **TRACKED** — committed `24245ec` (GEO-AUTOPILOT-W1); absent from `git status` untracked set | **Q3 → KEEP** (removing a tracked file is out of scope). Reconcile as an "expected-untracked-but-tracked" ledger row. The other leftovers expand to **6 genuinely-untracked** files (4× `NPM-PUBLISH-v1.{19.0,19.1,20.0,20.1}-W1-endpoint-truth.md`, `chatgpt-app-directory-submission-package.md`, `.claude/napkin.md`) → remove in C4 with the `git ls-files --error-unmatch` guard; chatgpt-doc → relocate to vault first if it holds unique drafting. |
| 2 | C4 AC + gate: "existing pre-commit system-map gate present + unmodified"; `grep check_system_map .git/hooks/pre-commit` | **No active hooks** — `.git/hooks/` holds only `.sample` templates; pre-commit AND pre-push both ABSENT in this clone | **Q2 → INSTALL (idempotent), as the LAST C4 step.** Run `scripts/install_system_map_hook.sh` (restore the documented gate; clone drifted to `.sample`-only) then `scripts/install_test_gate_hook.sh`. Executing the installers ≠ modifying them → stays inside the C4 firewall; a genuine pass, not an AC relaxation. Order: after C4's own commits land (C4 touches no edges → the now-active pre-commit gate passes). |
| 3 | C3 + Map Anchor: refresh the system-map "2 wobbling files" note **in the same commit** as the test changes; C3/C4 gates `grep ... system-map.md` (relative) | `system-map.md` lives in the **VAULT** (`check_system_map.sh:22` hardcodes `.../AlgoVault MCP/system-map.md`); not in the repo; the vault is **not a git repo** → "same commit" impossible. The "2 wobbling files" string is a **HISTORICAL "Last touched" changelog row** (vault line 27, SUBSCRIBER-ATTRIBUTION-SPINE-W1 2026-06-08), not a live status card | **Q1 → DROP the doc-note.** C3 mutates no producer→consumer edge; system-map records components+edges, not test-flakiness. C3 `system-map edges:` → **"NONE — internal change only"**; **REMOVE** the `grep -q -E 'knowledge-flow\|x402-http-routes' system-map.md` clause from the C3 gate; do **NOT** edit line 27 (HISTORICAL-must-not-update). Record the Class-B final status in THIS ledger + the C4 status.md entry. status.md verdict line = `system-map.md updated: N`. |

## Identifier diff (R-section vs AC-section)
Internally consistent. The C4 AC verification gate enforces absence of only `chatgpt-app-directory-submission-package.md` + `.claude/napkin.md` (not the NPM-PUBLISH / GEO-AUTOPILOT files) — consistent with keeping the tracked GEO-AUTOPILOT and removing the untracked set. Zero `file:line` anchors cited by the spec (probe #6 N/A by design) — confirmed.

## Runner ownership (resolved — the C1 caveat)
- **vitest (`npm test`)** owns all `tests/**/*.test.ts` + exactly **one** `.mjs`: `tests/unit/snapshot-capabilities.test.mjs` (imports from `vitest`).
- **node:test (`node --test`, deploy.yml)** owns **13** `.mjs` (`design_w{3..11}_consistency`, `geo_answer_page_invariants`, `geo_jsonld_consistency`, `how_it_works_consistency`, `landing_faq_glossary_substrate`) — all import `node:test`. Under `node --test`: **464 tests, 464 pass, 0 fail**.
- vitest's default `include` mis-collects those 13 → "No test suite found in file …" → counted as 13 failed files. **Fix = vitest `exclude` config (C3, project-scoping), NOT 13 assertion edits.** This is the spec-anticipated `runner-misglob` class.

## No fictional CORE primitives
All test files, runners, baseline commit, and scripts-to-mirror verified present. The 3 gaps are peripheral (hygiene file tracked-status, hook install-status, doc-note location) and are reconciled above per Build Rule 8 + architect ratification. **0 REAL_BUG rows buried** — `perf-stats-cache` flagged `REAL_BUG_SUSPECTED` in the ledger for C2 root-cause (Build Rule 6).
