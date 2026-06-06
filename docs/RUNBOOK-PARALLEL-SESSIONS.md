# RUNBOOK — Parallel Claude Code sessions (worktree isolation)

**Owner:** AlgoVault Labs · **Wave:** CC-PARALLEL-SESSION-ISOLATION-W1 · **Status:** LIVE (npm path; pnpm deferred)

Run many Claude Code sessions at once **without git working-tree pollution**. Every parallel
session lives in its own git worktree — its own `index` and its own working tree — so the
cross-session bugs we used to fight are *structurally impossible*, not merely guarded.

---

## Why (the root cause)

A normal clone has **one** working tree and **one** staging area (`index`). Point N sessions at
it and they fight over both:

- `git add -A`/`.` in session A stages session B's edits (cross-session capture).
- `git reset --hard` in session A wipes session B's **uncommitted** work.
- two builds race on the same `dist/`.

A git worktree gives each session its **own** `HEAD` + `index` + working dir, sharing only the
object store (and `$GIT_COMMON_DIR` — config + hooks). That removes the shared structure the bugs
fought over. (Primary sources: `research/parallel-claude-code-worktrees.md`.)

---

## Quickstart

```bash
# start an isolated session for a task (native claude -w if available, else a git-worktree fallback)
scripts/cc-session.sh new my-feature

# or use Claude Code's built-in flag directly:
claude --worktree my-feature      # creates .claude/worktrees/my-feature on branch worktree-my-feature

# see every live session
scripts/cc-session.sh list

# reclaim finished sessions (DRY-RUN by default — shows what it WOULD remove)
scripts/cc-session.sh clean
scripts/cc-session.sh clean --force   # actually remove merged+clean+pushed worktrees
```

`scripts/cc-session.sh list` columns: **worktree path · branch · ahead/behind · dirty (Y/N) · assigned port**.

---

## What you get per worktree (isolation guarantees)

| Symptom on a shared checkout | Why a worktree kills it |
|---|---|
| Session A's `git add` grabs B's files | each worktree has its **own index** |
| Session A's `reset --hard` wipes B's edits | `reset --hard` only mutates **its own** tree |
| `dist/` build collisions | each worktree builds into **its own `dist/`** |
| "is the tree clean?" ambiguity | each worktree has **independent `git status`** |

Defense-in-depth still applies **inside** each worktree: keep per-file `git add` (never `-A`/`.`) —
it's now backed by index isolation rather than being the only line of defense.

---

## Dependencies & ports (auto-provisioned)

`claude -w` checks out **tracked files only** — a fresh worktree has **no `node_modules`** (it's
gitignored). The `SessionStart` hook in [`.claude/settings.json`](../.claude/settings.json) runs
[`scripts/cc-session-bootstrap.sh`](../scripts/cc-session-bootstrap.sh) on session start, which:

1. **`npm ci`** when `node_modules` is absent (no-op in the main checkout — deps already there).
2. **Assigns a unique `PORT`** to the worktree's `.env.local` (base `3100`, deterministic from the
   worktree name, bumped past any in-use port) so parallel local MCP servers don't collide with
   each other or with the server default `3000` / facilitator `4022` / landing `5500`.

The hook is **fail-open**: any failure warns to stderr and the session still starts.
Re-run the bootstrap manually any time: `bash scripts/cc-session-bootstrap.sh`.

### Env files

`.worktreeinclude` lists `.env` / `.env.local` to copy into each new worktree. **Both are currently
absent** in this repo (the server runs from real environment variables on Hetzner, not a local
dotenv), so there is nothing to copy today — the file is forward-safe for when local dotenv work
lands. The `cc-session.sh new` fallback path copies any present `.env*` explicitly.

---

## `clean` safety contract

`clean` proposes a worktree for removal **only** when ALL hold:

- its branch is **merged into `main`** (HEAD is an ancestor of `main`), AND
- its tree is **clean** (no uncommitted or untracked files), AND
- it is **fully pushed** (no commits ahead of its upstream, when an upstream is set).

Anything dirty / unmerged / unpushed is **KEPT** with the reason printed. The main checkout is
never touched. Default is **DRY-RUN**; `--force` applies and then runs `git worktree prune`.

---

## Deferred / known gaps

- **Drift detector → `OPS-CC-DRIFT-DETECTOR-W1`.** A fail-open `pre-commit` warning ("you're
  committing in the shared main checkout while N worktrees exist") is deferred. This repo's hook
  mechanism is `.git/hooks/pre-commit` installed by `scripts/install_system_map_hook.sh` (the
  single slot is owned by the SYSTEM-MAP gate, `scripts/check_system_map.sh`). The follow-up will
  **compose** the drift check onto that real installer alongside the system-map gate — proving the
  gate still fires — rather than clobbering it. **W1 makes no hook changes.**
- **AOE pre-push protection → `OPS-AOE-PREPUSH-RESTORE-W1`.** Main-branch (pre-push) protection is
  **not active in this clone** (no `hooks/pre-push`, `core.hooksPath` unset). Tracked as a known gap.
- **pnpm (Level-2) → `OPS-PNPM-MIGRATION-W1`.** Plain `npm` copies all deps into every worktree.
  pnpm's content-addressable store makes per-worktree installs near-instant and disk-light, but
  carries lockfile/CI/Dockerfile risk → deferred. **W1 works on npm (`npm ci` per worktree).**

---

## Notes

- `.git/config` + hooks are **shared** across worktrees via `$GIT_COMMON_DIR` — any hook installed
  in `.git/hooks/` (e.g. the system-map `pre-commit` gate) governs **every** worktree automatically;
  no per-worktree re-install.
- The same branch can't be checked out in two worktrees (git refuses) — a feature: it stops two
  sessions clobbering one branch.
- Sweet spot is **3–5** active worktrees (review bandwidth, not tooling, is the limit). Past ~10 or
  for destructive ops, reach for container isolation — see the research doc.
- Cleanup: `cc-session.sh clean` (safe) or `git worktree remove <path>` + `git worktree prune`.
