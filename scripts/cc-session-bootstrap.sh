#!/usr/bin/env bash
# cc-session-bootstrap.sh — SessionStart hook for CC-PARALLEL-SESSION-ISOLATION-W1.
# Wired from .claude/settings.json; runs when a Claude Code session starts.
#
# In a fresh git worktree this:
#   1. installs deps when node_modules is absent (`npm ci`) — `claude -w` does NOT do this
#   2. assigns a unique PORT to .env.local so parallel local servers don't collide
# In the MAIN checkout it is effectively a no-op (node_modules present; no port write).
#
# FAIL-OPEN: never aborts the session — every failure warns to stderr and exits 0.
# NOTE deliberately uses `set -uo pipefail` WITHOUT `-e`.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT" 2>/dev/null || exit 0

log() { echo "[cc-session-bootstrap] $*" >&2; }

# --- 1. dependencies ---
if [ ! -d node_modules ]; then
  if [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
    log "node_modules absent → npm ci ($(basename "$ROOT"))"
    npm ci >&2 || log "WARN: npm ci failed (continuing; install manually)"
  else
    log "WARN: node_modules absent and no package-lock.json/npm available — skipping install"
  fi
fi

# --- 2. unique port (worktree only) ---
# true (0) iff this is the MAIN checkout (its git-dir == the shared common-dir)
is_main_worktree() {
  local gd gcd
  gd=$(git rev-parse --absolute-git-dir 2>/dev/null) || return 0
  gcd=$(cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P) || return 0
  [ "$gd" = "$gcd" ]
}

if ! is_main_worktree; then
  if ! grep -qs '^PORT=' .env.local 2>/dev/null; then
    task=$(basename "$ROOT")
    port=""
    if [ -x scripts/cc-session.sh ]; then
      port=$(bash scripts/cc-session.sh port "$task" 2>/dev/null || echo "")
    fi
    if [ -n "$port" ]; then
      printf 'PORT=%s\n' "$port" >> .env.local
      log "assigned PORT=$port → .env.local (worktree: $task)"
    else
      log "WARN: could not allocate a port (skipping; set PORT manually if needed)"
    fi
  fi
fi

exit 0
