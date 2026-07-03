#!/usr/bin/env bash
# check_mobile_nav_parity.sh — CI parity canary (mobile-nav-header waves).
#
# Invariant: every surface that ships the DESKTOP nav-links container
#   (`hidden sm:flex items-center gap-6`) MUST also ship the mobile-nav
#   equivalent — a `data-mobile-nav-toggle` hamburger AND a `#mobile-menu`
#   (a.k.a. `data-mobile-nav-panel`) slide-down panel. Makes "shipped a desktop
#   nav without a mobile replacement" structurally impossible for any FUTURE
#   page: the check fails the build.
#
# Scope:
#   - RECURSIVE over landing/**/*.html — static pages incl. landing/integrations/*.html
#     (MOBILE-NAV-HEADER-LANDING).
#   - RECURSIVE over src/**/*.ts — FUNCTION-RENDERED navs; currently the shared
#     src/lib/site-nav.ts generator feeding /track-record + /account
#     (LANDING-MOBILE-NAV-FUNCTION-RENDERED-W1). Any future rendered page that
#     inlines a nav instead of calling renderSiteNav() is caught here.
#
# Exit 0 = clean; exit 1 = ≥1 surface has the desktop nav but no mobile nav.
#
# Standalone run:  bash scripts/check_mobile_nav_parity.sh
# Pre-commit-hook candidate: wire into scripts/install_*_hook.sh alongside the
#   system-map gate; the shared .git/hooks path governs every worktree.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_SIG='hidden sm:flex items-center gap-6'
TOGGLE_SIG='data-mobile-nav-toggle'
PANEL_SIG_A='id="mobile-menu"'
PANEL_SIG_B='data-mobile-nav-panel'

fail=0
offenders=()

# A file "ships a nav" if it contains the desktop nav-links signature; if so it
# MUST also contain the mobile toggle + panel. Modifies globals fail/offenders.
check_file() {
  local f="$1"
  if grep -qaF "$DESKTOP_SIG" "$f"; then
    local has_toggle=0 has_panel=0
    if grep -qaF "$TOGGLE_SIG" "$f"; then has_toggle=1; fi
    if grep -qaF "$PANEL_SIG_A" "$f" || grep -qaF "$PANEL_SIG_B" "$f"; then has_panel=1; fi
    if [ "$has_toggle" -ne 1 ] || [ "$has_panel" -ne 1 ]; then
      local miss=""
      [ "$has_toggle" -ne 1 ] && miss="${miss} [missing hamburger: ${TOGGLE_SIG}]"
      [ "$has_panel" -ne 1 ] && miss="${miss} [missing panel: ${PANEL_SIG_A} | ${PANEL_SIG_B}]"
      offenders+=("${f#"$ROOT"/} —${miss}")
      fail=1
    fi
  fi
}

# Process substitution (not a pipe) so the while loop runs in the current shell
# and check_file's updates to fail/offenders persist.
scan_dir() {
  local dir="$1" pattern="$2"
  [ -d "$dir" ] || return 0
  while IFS= read -r f; do check_file "$f"; done < <(find "$dir" -type f -name "$pattern" | sort)
}

scan_dir "$ROOT/landing" '*.html'
scan_dir "$ROOT/src" '*.ts'

if [ "$fail" -ne 0 ]; then
  echo "✗ mobile-nav parity FAILED — desktop nav present, mobile nav missing:" >&2
  for o in "${offenders[@]}"; do echo "  - $o" >&2; done
  echo "" >&2
  echo "Fix (static landing/*.html): add the hamburger <button data-mobile-nav-toggle …>" >&2
  echo "  inside the nav's justify-between row + a <div id=\"mobile-menu\" data-mobile-nav-panel …>" >&2
  echo "  panel as the last child of <nav> + the shared controller <script> IIFE." >&2
  echo "Fix (function-rendered): render the nav via the shared src/lib/site-nav.ts renderSiteNav()" >&2
  echo "  generator instead of inlining a <nav> literal." >&2
  exit 1
fi

echo "✓ mobile-nav parity OK — every landing page + function-rendered nav ships a mobile nav."
