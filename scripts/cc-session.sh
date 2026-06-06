#!/usr/bin/env bash
# cc-session.sh — per-session git-worktree isolation for parallel Claude Code sessions.
# Part of CC-PARALLEL-SESSION-ISOLATION-W1. See docs/RUNBOOK-PARALLEL-SESSIONS.md.
#
#   new <task>      create/launch an isolated worktree session
#                   (native `claude -w` if available, else a `git worktree add` fallback)
#   list            show every worktree: path, branch, ahead/behind, dirty, assigned port
#   clean [--force] safely reclaim merged+clean+pushed worktrees (DRY-RUN unless --force)
#   port <task>     print the deterministic port a task would use (used by the SessionStart hook)
#
# Each worktree has its OWN index + working tree, so cross-session `git add` capture and
# `reset --hard` wipes are structurally impossible. Deps + port are provisioned by the
# SessionStart hook (scripts/cc-session-bootstrap.sh).
#
# Portable to macOS bash 3.2: no associative/empty arrays under `set -u`, no `realpath`.
set -euo pipefail

# --- config ---
PORT_BASE=3100                 # avoids server 3000 / facilitator 4022 / landing 5500
PORT_RANGE=400                 # candidate window 3100..3499
WT_SUBDIR=".claude/worktrees"  # native `claude -w` location; fallback mirrors it

# --- helpers ---
die() { echo "cc-session: $*" >&2; exit 1; }

repo_root() { git rev-parse --show-toplevel 2>/dev/null; }

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9._-'
}

port_in_use() {
  local p="$1"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w1 127.0.0.1 "$p" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
  else
    return 1   # cannot check → assume free
  fi
}

# deterministic base port from task name, bumped past any in-use port
alloc_port() {
  local task="$1" h p tries=0
  h=$(printf '%s' "$task" | cksum | awk '{print $1}')
  p=$(( PORT_BASE + (h % PORT_RANGE) ))
  while port_in_use "$p"; do
    p=$(( p + 1 ))
    [ "$p" -ge $(( PORT_BASE + PORT_RANGE )) ] && p="$PORT_BASE"
    tries=$(( tries + 1 ))
    [ "$tries" -ge 50 ] && break
  done
  printf '%s\n' "$p"
}

# true (0) iff $1 is the MAIN checkout (its git-dir == the shared common-dir)
is_main_worktree() {
  local p="$1" gd gcd
  gd=$(git -C "$p" rev-parse --absolute-git-dir 2>/dev/null) || return 0
  gcd=$(cd "$p" && cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P) || return 0
  [ "$gd" = "$gcd" ]
}

native_worktree_supported() {
  claude --help 2>/dev/null | grep -q -- '--worktree'
}

# --- subcommands ---
cmd_new() {
  [ $# -ge 1 ] || die "usage: cc-session.sh new <task>"
  local root task wt branch port f
  root=$(repo_root) || die "not in a git repository"
  task=$(slugify "$1"); [ -n "$task" ] || die "empty task name after slugify"
  cd "$root"

  if native_worktree_supported; then
    echo "cc-session: native isolated session → claude --worktree $task" >&2
    exec claude --worktree "$task"
  fi

  # fallback: manual git worktree (older Claude Code without -w)
  wt="$WT_SUBDIR/$task"; branch="worktree-$task"
  echo "cc-session: native -w unavailable; fallback → git worktree add $wt -b $branch" >&2
  git worktree add "$wt" -b "$branch"
  for f in .env .env.local; do
    if [ -f "$f" ]; then cp "$f" "$wt/$f"; echo "cc-session: copied $f" >&2; fi
  done
  port=$(alloc_port "$task")
  if ! grep -qs '^PORT=' "$wt/.env.local" 2>/dev/null; then
    printf 'PORT=%s\n' "$port" >> "$wt/.env.local"
    echo "cc-session: assigned PORT=$port → $wt/.env.local" >&2
  fi
  ( cd "$wt" && { [ -d node_modules ] || npm ci; } )
  echo "cc-session: launching claude in $wt" >&2
  ( cd "$wt" && exec claude )
}

list_row() {
  local path="$1" branch="$2" base ab dirty port
  if git -C "$path" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    base='@{upstream}'
  else
    base='main'
  fi
  ab=$(git -C "$path" rev-list --left-right --count "$base"...HEAD 2>/dev/null | awk '{print $2"/"$1}' || true)
  [ -n "$ab" ] || ab="0/0"
  if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then dirty="Y"; else dirty="N"; fi
  port=$(grep -hs '^PORT=' "$path/.env.local" 2>/dev/null | head -1 | cut -d= -f2 || true)
  [ -n "$port" ] || port="-"
  printf '%-46s %-26s %-9s %-5s %-6s\n' "$path" "$branch" "$ab" "$dirty" "$port"
}

cmd_list() {
  local root path branch
  root=$(repo_root) || die "not in a git repository"
  printf '%-46s %-26s %-9s %-5s %-6s\n' "WORKTREE" "BRANCH" "AHEAD/BEH" "DIRTY" "PORT"
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) path="${line#worktree }" ;;
      branch\ *)   branch="${line#branch refs/heads/}"; list_row "$path" "$branch" ;;
      detached)    list_row "$path" "(detached)" ;;
    esac
  done < <(git -C "$root" worktree list --porcelain)
}

clean_consider() {
  local root="$1" path="$2" branch="$3" force="$4" reasons="" head
  is_main_worktree "$path" && return 1   # never the main checkout
  if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then reasons="$reasons dirty"; fi
  head=$(git -C "$path" rev-parse HEAD 2>/dev/null || echo "")
  if [ -z "$head" ] || ! git -C "$root" merge-base --is-ancestor "$head" main 2>/dev/null; then
    reasons="$reasons unmerged"
  fi
  if git -C "$path" rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    if [ -n "$(git -C "$path" rev-list '@{upstream}'..HEAD 2>/dev/null)" ]; then reasons="$reasons unpushed"; fi
  fi
  if [ -z "$reasons" ]; then
    if [ "$force" -eq 1 ]; then
      git -C "$root" worktree remove "$path" && echo "REMOVED       $path ($branch)"
    else
      echo "WOULD-REMOVE  $path ($branch)"
    fi
    return 0
  fi
  echo "KEEP          $path ($branch) —$reasons"
  return 1
}

cmd_clean() {
  local force=0 root path branch removed=0
  [ "${1:-}" = "--force" ] && force=1
  root=$(repo_root) || die "not in a git repository"
  echo "cc-session clean: $([ $force -eq 1 ] && echo APPLY || echo 'DRY-RUN (use --force to apply)')"
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) path="${line#worktree }" ;;
      branch\ *)
        branch="${line#branch refs/heads/}"
        if clean_consider "$root" "$path" "$branch" "$force"; then removed=$(( removed + 1 )); fi
        ;;
    esac
  done < <(git -C "$root" worktree list --porcelain)
  if [ "$force" -eq 1 ]; then
    git -C "$root" worktree prune
    echo "cc-session clean: pruned admin entries; removed $removed worktree(s)."
  fi
}

cmd_port() {
  [ $# -ge 1 ] || die "usage: cc-session.sh port <task>"
  alloc_port "$(slugify "$1")"
}

usage() {
  cat >&2 <<'EOF'
cc-session.sh — per-session git-worktree isolation for parallel Claude Code sessions
  cc-session.sh new <task>       create/launch an isolated worktree session
  cc-session.sh list             list worktrees (path, branch, ahead/behind, dirty, port)
  cc-session.sh clean [--force]  reclaim merged+clean+pushed worktrees (DRY-RUN default)
  cc-session.sh port <task>      print the deterministic port for a task
See docs/RUNBOOK-PARALLEL-SESSIONS.md
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    new)   cmd_new "$@" ;;
    list)  cmd_list "$@" ;;
    clean) cmd_clean "$@" ;;
    port)  cmd_port "$@" ;;
    ''|-h|--help|help) usage ;;
    *) die "unknown command: $cmd (try --help)" ;;
  esac
}

main "$@"
