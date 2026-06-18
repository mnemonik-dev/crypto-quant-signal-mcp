#!/usr/bin/env bash
# OPS-VITEST-SUITE-REPAIR-W1 / C4 — installer for the local pre-push test-gate.
#
# Wires scripts/check_test_baseline.sh into .git/hooks/pre-push so every push is
# checked against the committed green baseline (substitutes for the flag-disabled
# push-triggered CI). Mirrors scripts/install_system_map_hook.sh: standard
# .git/hooks path, NO custom core.hooksPath.
#
# COMPOSABLE — if a pre-push hook already exists, this APPENDS a guarded marker
# block (idempotent) instead of overwriting, so a later wave (e.g.
# OPS-AOE-PREPUSH-RESTORE-W1's main-branch protection) can add its own block to
# the SAME hook. Re-running is a no-op once the marker is present.
#
# WORKTREE-SAFE — resolves the hooks dir via `git rev-parse --git-common-dir`,
# which is the shared $GIT_COMMON_DIR. .git/hooks lives there, so the hook
# governs EVERY linked worktree — install once per clone, not per worktree.
#
# NOT invoked from CI — developer-onboarding utility. Run once per fresh clone:
#   bash scripts/install_test_gate_hook.sh
set -euo pipefail

COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
HOOKS_DIR="$COMMON_DIR/hooks"
HOOK_PATH="$HOOKS_DIR/pre-push"
MARKER_BEGIN='# >>> algovault test-gate (OPS-VITEST-SUITE-REPAIR-W1) >>>'
MARKER_END='# <<< algovault test-gate <<<'

# The guarded block. Resolves the repo root at hook-run time so it works from
# any worktree; honours ALGOVAULT_TEST_GATE (block|warn) read by the gate script.
read -r -d '' BLOCK <<EOF || true
$MARKER_BEGIN
# Local greenness gate — substitutes for the flag-disabled push-triggered CI.
# Blocks a push that introduces a NEW test failure vs the committed baseline
# (audits/test-baseline-known-failures.txt). Override (report-only):
#   ALGOVAULT_TEST_GATE=warn git push
"\$(git rev-parse --show-toplevel)/scripts/check_test_baseline.sh" || exit 1
$MARKER_END
EOF

mkdir -p "$HOOKS_DIR"

if [ -f "$HOOK_PATH" ]; then
  if grep -qF "$MARKER_BEGIN" "$HOOK_PATH"; then
    echo "[test-gate hook] already installed in $HOOK_PATH (idempotent no-op)"
    exit 0
  fi
  # Composable append — preserve the existing hook (do NOT overwrite).
  printf '\n%s\n' "$BLOCK" >>"$HOOK_PATH"
  chmod +x "$HOOK_PATH"
  echo "[test-gate hook] appended guarded block to existing $HOOK_PATH (composable)"
  exit 0
fi

# Fresh hook.
printf '%s\n\n%s\n' '#!/usr/bin/env bash' "$BLOCK" >"$HOOK_PATH"
chmod 0755 "$HOOK_PATH"
echo "[test-gate hook] installed at $HOOK_PATH (mode 755)"
