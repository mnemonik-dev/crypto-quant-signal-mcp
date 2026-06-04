#!/usr/bin/env bash
# EQUITY-LAUNCH-READINESS-W1 R3 — one-shot equity launch-readiness decision latch.
#
# Fires ONE operator-action-required Telegram (8th consumer of send_telegram.sh)
# when the first PFE cohort has matured into a presentable sample, telling Mr.1
# to dispatch EQUITY-CALIBRATION-AUDIT-W1 (the launch decision). Latched: fires
# ONCE, re-fires only if the latch file is removed manually. This is a decision
# alert with a named dispatch (NOT a completion ping) — complies with the
# no-TG-on-completion LAW. The wrapper owns severity-gate / 24h cooldown /
# DRY_RUN_TG / fail-open; this consumer MUST NOT re-implement those.
#
# Repo copy under ops/monitoring/** (deploy.yml paths-ignore → no prod restart),
# installed to /opt/algovault-monitoring/ via scp. Cron: 47 10 * * 2-6 (off-:00,
# after the 09:41 outcomes backfill completes).
#
# Test seams:
#   DRY_RUN_TG=1      → wrapper runs all gates but skips the real TG POST.
#   READINESS_FORCE=1 → bypass the n/s gate (force the fire path).
#   In EITHER test mode the latch is written to a TMP path — the real production
#   latch is never touched by a smoke.
set -uo pipefail

PGCTR=crypto-quant-signal-mcp-postgres-1
WRAP=/opt/algovault-monitoring/send_telegram.sh
LOG=/var/log/equity-launch-readiness.log
ALERT_ID=EQUITY_LAUNCH_READINESS
LATCH=/var/lib/algovault-monitoring/equity-launch-readiness.fired

# ── Gate thresholds (rationale inline) ──
N_THRESHOLD=150   # min matured BUY/SELL PFE outcomes — below this the calibration audit sample is noise, not signal
S_THRESHOLD=3     # min distinct matured sessions — guards against a single-session fluke driving the launch decision

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [equity-launch-readiness] $*" >> "$LOG" 2>/dev/null || true; }

# Test mode → TMP latch (production latch untouched by smokes).
if [ "${DRY_RUN_TG:-0}" = "1" ] || [ "${READINESS_FORCE:-0}" = "1" ]; then
  LATCH=/tmp/equity-launch-readiness.fired.test
fi
mkdir -p "$(dirname "$LATCH")" 2>/dev/null || true

PGUSER=$(docker exec "$PGCTR" printenv POSTGRES_USER 2>/dev/null || echo postgres)

# Read-only metrics (psql avoids node-quoting through ssh+docker).
M=$(docker exec "$PGCTR" psql -U "$PGUSER" -d signal_performance -tA -F'|' -c "
SELECT
  count(*) FILTER (WHERE outcome_filled_at IS NOT NULL),
  count(DISTINCT session_date) FILTER (WHERE outcome_filled_at IS NOT NULL),
  count(*) FILTER (WHERE outcome_filled_at IS NOT NULL AND ((call='BUY' AND pfe_pct>0) OR (call='SELL' AND pfe_pct<0))),
  (SELECT count(*) FROM equity_symbol_misses WHERE requested_at > now() - interval '7 days')
FROM equity_verdicts WHERE call IN ('BUY','SELL');" 2>>"$LOG") || { log "FAIL_DB_PROBE — fail-open"; echo "WOULD_FIRE=error"; exit 0; }

IFS='|' read -r N S WINS MISS <<< "$M"
N=${N:-0}; S=${S:-0}; WINS=${WINS:-0}; MISS=${MISS:-0}
if [ "$N" -gt 0 ]; then WR=$(awk "BEGIN{printf \"%.1f\", $WINS/$N*100}"); else WR="n/a"; fi
BUCKETS=$(docker exec "$PGCTR" psql -U "$PGUSER" -d signal_performance -tA -c "
SELECT string_agg(bucket||':'||round(coalesce(pfe_win_rate,0)*100,1)||'%('||matured_calls||')', ' ' ORDER BY bucket)
FROM equity_pfe_by_rank_bucket;" 2>>"$LOG" || echo "")

# Latch already fired → never re-fire.
if [ -f "$LATCH" ]; then
  log "NO_FIRE_LATCHED (latch present: $LATCH) n=$N s=$S"
  echo "NO_FIRE_LATCHED n=$N s=$S wr=$WR% miss7d=$MISS buckets=[$BUCKETS]"
  exit 0
fi

WOULD_FIRE=no
if [ "${READINESS_FORCE:-0}" = "1" ] || { [ "$N" -ge "$N_THRESHOLD" ] && [ "$S" -ge "$S_THRESHOLD" ]; }; then
  WOULD_FIRE=yes
fi
echo "WOULD_FIRE=$WOULD_FIRE n=$N s=$S wr=$WR% miss7d=$MISS buckets=[$BUCKETS]"
log "WOULD_FIRE=$WOULD_FIRE n=$N (>=$N_THRESHOLD) s=$S (>=$S_THRESHOLD) wr=$WR miss7d=$MISS"

if [ "$WOULD_FIRE" = "yes" ]; then
  BODY=$(printf 'EQUITY LAUNCH READINESS\n\nFirst PFE cohort has matured: n=%s matured BUY/SELL outcomes (gate >=%s), s=%s distinct matured sessions (gate >=%s), overall PFE WR=%s%%.\nPer-rank-bucket WR (matured): %s\nOut-of-universe requests (7d): %s\n\nAction: dispatch EQUITY-CALIBRATION-AUDIT-W1 (launch decision due; public-copy HOLD stays until Mr.1 flips post-audit).\nReadiness log: %s' \
    "$N" "$N_THRESHOLD" "$S" "$S_THRESHOLD" "$WR" "${BUCKETS:-n/a}" "$MISS" "$LOG")
  echo "$BODY" | "$WRAP" "$ALERT_ID" CRITICAL_PERSISTENT - || true
  TMP=$(mktemp 2>/dev/null) && printf '%s fired n=%s s=%s wr=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$N" "$S" "$WR" > "$TMP" && mv -f "$TMP" "$LATCH"
  log "FIRED + latched ($LATCH)"
fi
exit 0
