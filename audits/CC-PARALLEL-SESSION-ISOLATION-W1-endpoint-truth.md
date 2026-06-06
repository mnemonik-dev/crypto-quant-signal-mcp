# CC-PARALLEL-SESSION-ISOLATION-W1 — Plan-Mode endpoint-truth

**Wave:** CC-PARALLEL-SESSION-ISOLATION-W1 — Target ICP tier(s): META (internal dev-workflow / ops-reliability primitive)
**Date:** 2026-06-06
**Repo:** `/Users/tank/code/crypto-quant-signal-mcp` (branch `main`; probe-time HEAD `1731fbf`, advanced to `11c4122` by a parallel session during the wave — see note below)
**Verdict:** 🛑→✅ **3 fictional primitives found (hooks chapter) → architect RATIFIED the DEFER path.** Q1=(b) DEFER the drift detector; Q2=(a) reconcile docs, no pre-push fabrication. W1 ships the verified-safe worktree-isolation core with **ZERO hook changes**.

---

## `claim | reality | resolution`

| # | Spec claim | Probe (read-only) | Reality | Verdict |
|---|---|---|---|---|
| a1 | `claude -w`/`--worktree` exists | `claude --help` (v2.1.118) | `-w, --worktree [name]` present + bonus `--tmux` (requires `-w`) | ✅ REAL |
| a2 | `SessionStart` hook + `.claude/settings.json` schema | this session received a "SessionStart hook additional context" injection; superpowers `hooks/hooks.json` read for schema | SessionStart fires live; schema `{"hooks":{"SessionStart":[{"matcher":"startup\|resume","hooks":[{"type":"command","command":"…","async":false}]}]}}` | ✅ REAL |
| a3 | `.worktreeinclude` native env-copy | `grep -r worktreeinclude` in `/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code` + cached changelog | NOT found in the v2.1.118 bundle (minified) / changelog; research-cited only | ⚠️ UNVERIFIED → ship anyway (harmless) + `cc-session.sh` fallback copies `.env*`; AC line 50 authorizes the fallback |
| b | Code repo absolute path | `git rev-parse --show-toplevel`, `package.json` | `/Users/tank/code/crypto-quant-signal-mcp`, branch `main`, pkg `crypto-quant-signal-mcp@1.20.1` (vault `experiments/` is the stale mirror — not used) | ✅ REAL |
| c | vault CLAUDE.md lines 164/165/168 | Read w/ line numbers | EXACT: 164 clean-baseline / 165 git-add contamination guard / 168 stage-immediately. Keep 161/162/163/166/167 | ✅ REAL |
| d1 | `core.hooksPath` == `hooks` | `git config --get core.hooksPath` (local + global + seed-orch worktree) | **EMPTY everywhere** | ❌ **FICTIONAL** |
| d2 | `hooks/pre-push` present + executable | `ls hooks/`, `git ls-files hooks/`, `find ~/code -name pre-push` | **`hooks/` dir absent; 0 tracked hooks; no pre-push anywhere; `.git/hooks/` has only `.sample`s** | ❌ **FICTIONAL** |
| arch | repo hook mechanism = committed `hooks/` dir governed by `core.hooksPath=hooks` (Req 4: pre-commit "coexists … same dir as pre-push") | read `scripts/install_system_map_hook.sh` + `check_system_map.sh` (5010 B) | **Real mechanism = `.git/hooks/pre-commit` installed by `install_system_map_hook.sh` (single slot, execs `check_system_map.sh` = the SYSTEM-MAP-ENFORCEMENT gate). NOT a committed `hooks/` dir.** That slot is reserved for the system-map gate | ❌ **FICTIONAL (wrong model + unmentioned existing consumer)** |
| e | worktree inherits `core.hooksPath=hooks` | `git rev-parse --git-common-dir` in main vs worktree | hooks ARE shared via `$GIT_COMMON_DIR` (`.git/hooks` resolves to the common dir from any worktree) ✓ — but there is no hooksPath/pre-push to inherit | ⚠️ sharing-mechanism real; the thing shared is absent |
| f | `claude -w` does NOT run `npm install` | worktree = checkout of TRACKED files only; `node_modules`/`dist`/`.env` are gitignored | confirmed → a SessionStart auto-install hook IS needed (the seed-orch worktree only has `node_modules` because it was manually installed) | ✅ REAL (confirms the need) |
| port | server's real PORT env var | `grep -rn env.PORT src/` | **`PORT`** (default 3000, `src/index.ts:922`); facilitator `FACILITATOR_PORT` (4022); `.claude/launch.json` already sets `autoPort:true` for 3000/5500 | ✅ RESOLVED |
| g | env files to copy (`.env`, `.env.local`) | `ls .env .env.local` | **both ABSENT** (server runs from real env on Hetzner; no local dotenv) — `.worktreeinclude` is forward-safe but moot today | ℹ️ note in runbook |

**Drift-detector primitive (for the deferred follow-up), proven live:** `[MAIN] --absolute-git-dir == --git-common-dir`; `[WORKTREE] --git-dir = .git/worktrees/<name>` ≠ `--git-common-dir = .git`. 2 worktrees currently exist.

---

## Fictional-primitive count → HALT → architect decision

**3 distinct probed primitives fictional** (`d1` empty `core.hooksPath`; `d2` no `hooks/pre-push`; `arch` wrong hook model) → ≥3 ⇒ **HALT** per Plan-Mode LAW. A self-contained Q-block was prepared for Cowork (per `feedback_halt_class_prepare_cowork_questions`); ExitPlanMode was NOT taken unilaterally.

**Architect ruling (2026-06-06):**
- **Q1 = (b) DEFER.** W1 makes **ZERO hook changes**; the `.git/hooks/pre-commit` system-map gate is **untouched** (data-integrity-critical; its installer not reviewed by this wave). Follow-up **`OPS-CC-DRIFT-DETECTOR-W1`** composes the fail-open drift detector onto the REAL installer alongside `check_system_map.sh`, with an AC proving the system-map gate still fires.
- **Q2 = (a) reconcile docs.** Do NOT fabricate or restore pre-push. Follow-up **`OPS-AOE-PREPUSH-RESTORE-W1`**. CLAUDE.md line 163 corrected to the `.git/hooks/` reality; the worktree-first block asserts no nonexistent pre-push.

## Identifier diff (Requirements ↔ Acceptance Criteria)

`scripts/cc-session.sh`, `.worktreeinclude`, lines `164/165/168`, `claude -w` — consistent R↔AC. The sole mismatch was `hooks/pre-push` (AC "still fires unchanged") vs reality (absent) — resolved by the Q2 ruling above (AC amended: "W1 makes ZERO hook changes → the `.git/hooks/pre-commit` system-map gate is untouched and still fires").

## Non-blocking inline resolutions

- `.worktreeinclude` unverified in v2.1.118 → shipped anyway (harmless if ignored); `cc-session.sh new` fallback copies `.env*` explicitly.
- `.env`/`.env.local` absent → nothing to copy today; documented in the runbook.
- Port env var resolved to `PORT` (default 3000) → `cc-session.sh` allocates from base 3100 (range 400) to avoid 3000/4022/5500.

## Parallel-session note (the bug class this wave retires, observed live)

During this single wave, a parallel session committed `11c4122` (OPS-RATELIMIT-CALLER-ATTRIBUTION-W1) on top of the probe-time HEAD `1731fbf` in the shared main checkout. The tracked tree stayed clean and none of this wave's target paths collided; W1 was committed with strict per-file `git add` + `git diff --cached` audit. This is precisely the shared-checkout contention the worktree-first LAW makes structurally impossible going forward.
