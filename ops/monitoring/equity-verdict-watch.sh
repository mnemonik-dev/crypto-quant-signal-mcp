#!/usr/bin/env bash
# EQUITIES-ENGINE-W1 C5 — zero-verdict watchdog (host-side consumer of send_telegram.sh).
#
# Fires ONE OPS_EQUITY_ZERO_VERDICT alert ONLY when the equity verdict producer
# has been silent for 3+ sessions (0 verdict-sessions in the last 7 calendar
# days) WHILE the system is provisioned (bars exist). Everything else is silent
# + forensic. The wrapper owns severity-gate + 24h cooldown + DRY_RUN_TG +
# fail-open; this consumer MUST NOT re-implement those gates (monitoring runbook).
#
# Installed to /opt/algovault-monitoring/ via SSH (repo copy here is paths-ignored
# in deploy.yml, so it never triggers a prod image rebuild).
set -uo pipefail

C=crypto-quant-signal-mcp-mcp-server-1
WRAPPER=/opt/algovault-monitoring/send_telegram.sh
LOG=/var/log/equity-verdict-watch.log
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Probe (runs in /app so require('pg') resolves): "<bars> <recent_verdict_sessions>"
OUT=$(docker exec "$C" node -e '
const{Pool}=require("pg");const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query("SELECT (SELECT count(*) FROM equity_bars_daily) bars,(SELECT count(DISTINCT session_date) FROM equity_verdicts WHERE session_date > CURRENT_DATE - 7) vs")
 .then(r=>{console.log((r.rows[0].bars||0)+" "+(r.rows[0].vs||0));process.exit(0)})
 .catch(()=>{console.log("ERR ERR");process.exit(1)})' 2>/dev/null) || { echo "$(ts) probe_failed" >> "$LOG"; exit 0; }

BARS=$(echo "$OUT" | awk '{print $1}')
VSESS=$(echo "$OUT" | awk '{print $2}')
echo "$(ts) bars=$BARS recent_verdict_sessions=$VSESS" >> "$LOG"

# Numeric guard + condition: provisioned (bars>0) AND zero recent verdict-sessions.
case "$BARS$VSESS" in
  *[!0-9]*) exit 0 ;;   # non-numeric (ERR) → fail-open silent
esac
if [ "$BARS" -gt 0 ] && [ "$VSESS" -eq 0 ]; then
  BODY=$(printf '🛑 OPS_EQUITY_ZERO_VERDICT\n\nNo equity verdicts written for 3+ sessions (0 verdict-sessions in the last 7 days; %s bars present).\nContext: nightly seed-equities is producing zero verdicts — check Databento availability, the universe, or the verdict engine.\n\nAction: dispatch OPS-EQUITIES-ENGINE-W{NEXT} via Cowork → Claude Code\nAudit shape: audits/EQUITIES-ENGINE-W1-endpoint-truth.md\nSeed log: /var/log/seed-equities.log' "$BARS")
  echo "$BODY" | "$WRAPPER" "OPS_EQUITY_ZERO_VERDICT" CRITICAL_PERSISTENT - || true
fi
exit 0
