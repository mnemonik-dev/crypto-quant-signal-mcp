#!/usr/bin/env bash
# OPS-SHADOW-PIPELINE-W1 V2 (2026-06-05) — 48h post-parity-cron CPU re-probe gate.
#
# Host-side monitoring script. Installed to /opt/algovault-monitoring/ via SSH
# (ops/monitoring/** is paths-ignored from deploy). Scheduled as a one-shot
# transient timer:
#   systemd-run --on-active=48h --unit=shadow-cpu-gate-48h \
#     /opt/algovault-monitoring/shadow-cpu-gate-48h.sh
#
# Re-checks normalized CPU 48h after the 12 shadow venues went to PROMOTED-PARITY
# cadence (full matrix + 3m) on the upgraded CPX42 (8 vCPU). Classifies G/Y/R
# (normalized to nproc); on RED posts an operator-action-required Telegram via
# the send_telegram.sh wrapper (CRITICAL_PERSISTENT severity). Fail-open: always
# exits 0; forensic to journal, alert only on sustained RED.
#
# Rollback (restore the pre-parity crontab — removes the parity matrix lines):
#   crontab /opt/crontab.bak-20260605T064541Z
set -uo pipefail
NPROC=$(nproc)
LOAD=$(awk '{print $2}' /proc/loadavg)            # 5-min load average
NORM=$(awk -v l="$LOAD" -v n="$NPROC" 'BEGIN{printf "%.0f",(l/n)*100}')
WRAP=/opt/algovault-monitoring/send_telegram.sh
TS=$(date -u +%FT%TZ)
if   [ "$NORM" -ge 70 ]; then CLASS=R
elif [ "$NORM" -ge 55 ]; then CLASS=Y
else CLASS=G; fi
echo "[$TS] shadow-cpu-gate-48h(V2) nproc=$NPROC load5=$LOAD normalized=${NORM}% class=$CLASS"
if [ "$CLASS" = "R" ]; then
  MSG="🔴 OPS-SHADOW-PIPELINE-W1 V2 48h CPU gate RED — normalized CPU ${NORM}% (load5 ${LOAD} / ${NPROC} vCPU) after the 12 shadow venues went to promoted-parity cadence on CPX42. Rollback (restore pre-parity crontab): crontab /opt/crontab.bak-20260605T064541Z. Recommended wave: OPS-CPU-W{NEXT}."
  if [ -x "$WRAP" ]; then "$WRAP" gate-shadow-cpu CRITICAL_PERSISTENT - <<<"$MSG" || echo "[$TS] WARN send_telegram.sh nonzero"; else echo "[$TS] WARN send_telegram.sh missing"; fi
fi
exit 0
