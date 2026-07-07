#!/usr/bin/env bash
# ops/cron/seed-coverage-canary.sh — OPS-SEED-COVERAGE-CANARY-CRON-W1 (2026-07-08)
#
# 11th consumer of /opt/algovault-monitoring/send_telegram.sh. Continuously guards the
# producer<->monitor source-of-truth invariant that OPS-SEED-PROMOTED-RAMP-W1 established:
# every `status='promoted'` venue MUST have a <45min seed line in the live crontab.
#
# If a seed line reverts to a hardcoded --exchange-list (e.g. someone re-runs the
# superseded host-only seed-orchestrator-crontab.sh --apply, whose block-rebuild drops
# the 7 non-fast promoted venues ASTER/BINGX/GATE/HTX/KUCOIN/MEXC/PHEMEX), those venues
# silently lose fast coverage and lapse past the 45m SLA — the "Seed OUTAGE" bug class.
# This canary detects that at the CONFIG level and names the specific fix, rather than
# waiting for the downstream symptom alert.
#
# Contract (Claude files/monitoring-runbook.md ## Operator-action-required alert contract):
# this consumer ships ONLY the pure alert branch (severity hardcoded CRITICAL_PERSISTENT,
# contract body shape with recommended wave id). send_telegram.sh OWNS the severity gate,
# 24h-per-alert_id cooldown, OPS-<CLASS>-W{NEXT} resolution, DRY_RUN_TG gate, and fail-open.
# This script itself is ALSO fail-open: every infra error logs and exits 0, never bouncing
# the cron.
set -uo pipefail

PG_CTR="${SEED_COV_PG_CTR:-crypto-quant-signal-mcp-postgres-1}"
CANARY="${SEED_COV_CANARY:-/opt/crypto-quant-signal-mcp/scripts/check-seed-coverage.mjs}"
SEND="${SEED_COV_SEND:-/opt/algovault-monitoring/send_telegram.sh}"
NODE_BIN="${SEED_COV_NODE:-/usr/bin/node}"
LOG="${SEED_COV_LOG:-/var/log/seed-coverage-canary.log}"
ALERT_ID="SEED_COVERAGE_GAP"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [$ALERT_ID] $*" >> "$LOG"; }

# Promoted set from the venues table — the SAME SoT the monitor reads. Fail-open.
PROM=$(docker exec "$PG_CTR" psql -U algovault -d signal_performance -tAc \
  "SELECT string_agg(exchange_id, ',' ORDER BY exchange_id) FROM venues WHERE status = 'promoted'" 2>>"$LOG" \
  | tr -d '[:space:]') || { log "FAIL_OPEN: promoted-set query failed"; exit 0; }
[ -n "$PROM" ] || { log "FAIL_OPEN: empty promoted set (venues table unreachable/empty)"; exit 0; }
[ -r "$CANARY" ] || { log "FAIL_OPEN: canary script not found at $CANARY"; exit 0; }
[ -x "$NODE_BIN" ] || { log "FAIL_OPEN: node not executable at $NODE_BIN"; exit 0; }

OUT=$("$NODE_BIN" "$CANARY" --promoted "$PROM" 2>&1); RC=$?

if [ "$RC" -eq 0 ]; then log "OK: $OUT"; exit 0; fi
if [ "$RC" -ne 1 ]; then log "FAIL_OPEN: canary rc=$RC (not a coverage verdict) out=$OUT"; exit 0; fi

# RC=1 → a promoted venue has no fast seed line. Emit the operator-action alert.
log "COVERAGE_GAP: $OUT"
GAP=$(printf '%s' "$OUT" | grep -oE 'NO fast \(<45min\) seed line: \[[^]]*\]' || printf '%s' "$OUT")
printf '🛑 %s [seed-coverage]\n\n%s\n\nThe producer<->monitor source-of-truth invariant broke: a promoted venue has no <45min seed line, so it will lapse past the 45m monitor SLA (the daily "Seed OUTAGE" bug class). Likely cause: a seed cron line reverted to a hardcoded --exchange-list (e.g. the superseded seed-orchestrator-crontab.sh --apply). Fix: re-point the affected timeframe line(s) to --status promoted --exclude HL via ops/cron/seed-promoted-ramp.sh --apply.\n\nAction: dispatch OPS-SEED-COVERAGE-RESTORE-W{NEXT} via Cowork -> Claude Code\nAudit shape: audits/OPS-SEED-PROMOTED-RAMP-W1-coverage-invariant.md\n\nSource log: %s\n' \
  "$ALERT_ID" "$GAP" "$LOG" | "$SEND" "$ALERT_ID" CRITICAL_PERSISTENT -
exit 0
