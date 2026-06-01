#!/usr/bin/env bash
#
# commit-funnel-snapshot.sh
#
# Wrapper invoked by the systemd unit algovault-funnel-snapshot.service (or
# manually for testing). Runs the activation-funnel snapshot writer, then,
# if new files were produced, git-adds / commits / pushes them to origin.
#
# Exit codes:
#   0  — success (either new snapshot committed + pushed, or nothing to do)
#   2  — DATABASE_URL missing (see ops/systemd/README.md for the env file)
#   3  — git push still failed after bounded fetch+rebase+retry (commit left
#         intact for manual recovery; fires the OnFailure Telegram alert)
#   *  — any other error propagates via `set -e`
#
# Invocation: the systemd unit sets WorkingDirectory=/opt/crypto-quant-signal-mcp,
# so `cd` at the top is primarily a safety net for manual runs (e.g.
# `/opt/crypto-quant-signal-mcp/scripts/commit-funnel-snapshot.sh`).

set -euo pipefail

# ── 0. Move to repo root (wrapper lives in scripts/, so `..` from its dir).
cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# ── 1. Load env file if present. The systemd unit also loads it via
# EnvironmentFile=, but we source it here too so manual runs from a shell
# behave identically to the timer-driven path.
if [ -f /etc/algovault/funnel-snapshot.env ]; then
  # shellcheck disable=SC1091
  source /etc/algovault/funnel-snapshot.env
fi

# ── 2. Trap: always log a completion line on exit, whatever the cause.
EXIT_STATUS=0
trap 'echo "[commit-funnel-snapshot] done status=${EXIT_STATUS} repo=${REPO_ROOT} ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)"' EXIT

# ── 3. Health check: refuse to run without DATABASE_URL. The snapshot writer
# needs it; failing loudly here is much clearer than failing inside tsx.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[commit-funnel-snapshot] ERROR: DATABASE_URL is not set." >&2
  echo "[commit-funnel-snapshot] Expected it to come from /etc/algovault/funnel-snapshot.env" >&2
  echo "[commit-funnel-snapshot] See ops/systemd/README.md for the env file template and" >&2
  echo "[commit-funnel-snapshot] the one-line docker-compose.yml change required to expose" >&2
  echo "[commit-funnel-snapshot] Postgres on 127.0.0.1:5432 (BLOCKER-1)." >&2
  EXIT_STATUS=2
  exit 2
fi

echo "[commit-funnel-snapshot] starting ts=$(date -u +%Y-%m-%dT%H:%M:%SZ) repo=${REPO_ROOT}"
echo "[commit-funnel-snapshot] DATABASE_URL=${DATABASE_URL%%@*}@<redacted>"

# ── 4. Run the snapshot writer. `npx -y tsx` fetches tsx on demand into the
# npm cache without a permanent devDependency install on the host. First run
# is slow (~30s), subsequent runs are <2s. See BLOCKER-2 in README.md.
echo "[commit-funnel-snapshot] running snapshot writer"
npx -y tsx scripts/write-funnel-snapshot.ts --tag auto 2>&1

# ── 5. Clear stale staged state from prior failed runs (e.g. a run that
# git-added files but then failed at commit time due to missing git
# identity). This is safe because the wrapper only touches
# activation-funnel/ — it won't unstage unrelated work.
git -C "${REPO_ROOT}" reset HEAD -- activation-funnel/snapshots/ activation-funnel/README.md 2>/dev/null || true

# ── 6. Detect new, modified, OR stale-staged files under
# activation-funnel/snapshots/. The previous pattern only matched `??`
# (untracked) and missed `A ` / `AM` (staged from a prior failed run).
# Now we catch all non-empty statuses: untracked (`??`), added (`A `),
# modified (`M `, ` M`, `AM`), etc.
SNAPSHOT_STATUS="$(git -C "${REPO_ROOT}" status --porcelain activation-funnel/snapshots/ | grep -E '^\?\?|^A |^AM|^ M|^M ' || true)"
MODIFIED_README="$(git -C "${REPO_ROOT}" status --porcelain activation-funnel/README.md | grep -E '^\?\?|^A |^AM|^ M|^M ' || true)"

if [ -z "${SNAPSHOT_STATUS}" ] && [ -z "${MODIFIED_README}" ]; then
  echo "[commit-funnel-snapshot] no new snapshot — perhaps already run today"
  EXIT_STATUS=0
  exit 0
fi

echo "[commit-funnel-snapshot] new snapshot files:"
echo "${SNAPSHOT_STATUS}" | awk '{print "  " $2}'
if [ -n "${MODIFIED_README}" ]; then
  echo "[commit-funnel-snapshot] activation-funnel/README.md also modified (ledger row)"
fi

# ── 7. Stage explicitly — never `git add -A` or `git add .` (CLAUDE.md rule:
# risks committing secrets / build artifacts). We add the snapshots subdir
# and the funnel README (which may have a new Snapshot Ledger row appended
# by the writer) and nothing else.
git -C "${REPO_ROOT}" add activation-funnel/snapshots/
if [ -n "${MODIFIED_README}" ]; then
  git -C "${REPO_ROOT}" add activation-funnel/README.md
fi

# Guard: if nothing is actually staged after git add (e.g. files were
# identical to HEAD), exit cleanly rather than failing at `git commit`.
if git -C "${REPO_ROOT}" diff --cached --quiet; then
  echo "[commit-funnel-snapshot] nothing staged after git add — skipping commit"
  EXIT_STATUS=0
  exit 0
fi

COMMIT_MSG="chore(funnel): auto-snapshot $(date -u +%Y-%m-%d)"
echo "[commit-funnel-snapshot] committing: ${COMMIT_MSG}"
git -C "${REPO_ROOT}" commit -m "${COMMIT_MSG}"

# ── 8. Sync-then-push with bounded retry. origin/main advances constantly
# (daily releases + code waves + paths-ignored commits that move origin WITHOUT
# redeploying this host), so by the time the weekly snapshot commits, the host
# checkout is routinely behind — a plain `git push` then races into a
# non-fast-forward rejection. Per CLAUDE.md Automation-first recovery
# (Detect → Recover → Alert → Escalate): detect the rejection, recover by
# fetch+rebase of our snapshot commit onto origin/main and retry with backoff,
# and escalate to the OnFailure Telegram alert (exit 3) ONLY after the retry
# budget is exhausted — i.e. a GENUINE stuck push, not the transient race that
# self-heals here.
#
# Self-contained on purpose: this is currently the only host-side commit-and-push
# cron, so per the CLAUDE.md 3-example-threshold rule we do NOT pre-extract a
# shared safe-git-push.sh — but the routine is written extraction-ready for when
# a 2nd/3rd host-side pusher appears (WIS-flagged).
push_with_resync() {
  local backoffs=(5 15 45) attempt
  for attempt in 0 1 2; do
    if [ "${attempt}" -gt 0 ]; then
      echo "[commit-funnel-snapshot] resync+push retry ${attempt} (after ${backoffs[$((attempt-1))]}s)"
      sleep "${backoffs[$((attempt-1))]}"
    fi
    # Discard the ephemeral deploy-injected working-tree edits (README.md +
    # landing/*.html, rewritten on every deploy by scripts/snapshot-landing-data.mjs;
    # deploy.yml does `git reset --hard origin/main` before re-injecting, so the
    # tree is disposable by construction, and Caddy serves a SEPARATE copy under
    # /var/www/algovault/ that this cron never touches). A clean tree means the
    # rebase has nothing to autostash → it can NEVER leave conflict markers in the
    # served landing/*.html.
    git -C "${REPO_ROOT}" checkout -- . 2>/dev/null || true
    # Fetch origin/main + rebase our snapshot commit onto it, atomically. Same
    # remote ("origin" = the github-funnel: SSH alias) as the push below, so auth
    # is identical. --autostash is a belt-and-suspenders no-op on the now-clean
    # tree. On any rebase conflict: abort + log + retry from a clean fetch rather
    # than leaving a half-rebased state.
    if ! git -C "${REPO_ROOT}" pull --rebase --autostash origin main; then
      echo "[commit-funnel-snapshot] WARN: pull --rebase failed/conflicted — aborting this attempt" >&2
      git -C "${REPO_ROOT}" rebase --abort 2>/dev/null || true
      continue
    fi
    if git -C "${REPO_ROOT}" push origin main; then
      return 0
    fi
    echo "[commit-funnel-snapshot] WARN: push rejected (origin advanced mid-run) — re-syncing" >&2
  done
  return 1
}

echo "[commit-funnel-snapshot] pushing to origin main (resync-aware)"
if ! push_with_resync; then
  echo "[commit-funnel-snapshot] ERROR: push failed after bounded fetch+rebase+retry." >&2
  echo "[commit-funnel-snapshot] Local commit is intact — this is a GENUINE stuck push" >&2
  echo "[commit-funnel-snapshot] (origin unreachable, auth/ref-lock, or repeated rebase conflict)," >&2
  echo "[commit-funnel-snapshot] not the transient non-ff race. Investigate host git/network, then" >&2
  echo "[commit-funnel-snapshot] re-run the unit or push manually once origin is reachable." >&2
  EXIT_STATUS=3
  exit 3
fi

echo "[commit-funnel-snapshot] push succeeded"
EXIT_STATUS=0
exit 0
