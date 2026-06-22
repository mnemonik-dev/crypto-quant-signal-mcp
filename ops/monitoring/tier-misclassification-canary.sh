#!/usr/bin/env bash
# OPS-TIER-CLASSIFIER-XVENUE-W1 C3 — cross-venue tier-misclassification canary.
#
# READ-ONLY. Pulls live /api/performance-public `byAsset`, and for every asset the
# dashboard renders as Tier 4, asks the SAME cross-venue asset-class engine
# (src/lib/asset-class-detection.ts → dist) whether any venue authoritatively tags it
# TradFi (via its own field OR the cross-venue union). Anything Tier-4-but-TradFi
# (minus the crypto deny-list, which the engine already applies) is an operator-review
# item: a new venue/listing the detectors don't yet cover, or a price-sanity gap.
# Makes silent Tier-4 drift impossible as venues are added.
#
# Mirrors equity-verdict-watch.sh: the host wrapper owns severity-gate + 24h cooldown
# + DRY_RUN_TG + fail-open — this consumer MUST NOT re-implement those gates. The
# review list is the only thing piped in. Idempotent; never writes.
#
# Engine access (no logic duplication): runs the engine inside the container in prod;
# in DRY_RUN (or when the container is absent, e.g. the local C3 gate) runs host-side
# `node` against the local built dist. Requires `npm run build` (dist/) beforehand.
#
# Limitation (v1): the registry/union cross-check catches every venue-tagged stock
# incl. the no-field OKX/Aster (union). A stock NO venue tags and that only
# PRICE-correlates to a known equity is deferred to OPS-TIER-CLASSIFIER-DECODE-W2
# (price-correlation pass). Installed to /opt/algovault-monitoring/ via SSH; the repo
# copy is paths-ignored in deploy.yml so it never triggers a prod image rebuild.
set -uo pipefail

C=crypto-quant-signal-mcp-mcp-server-1
WRAPPER=/opt/algovault-monitoring/send_telegram.sh
LOG=/var/log/tier-misclassification-canary.log
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Inline engine probe (heredoc → no quote-escaping). Resolves ./dist relative to cwd
# (repo root host-side, /app in the container). Fail-open: any error → empty output,
# exit 0. Silent when nothing is misclassified. One `<coin> -> <class>` line each.
read -r -d '' JS <<'NODE' || true
(async () => {
  try {
    const { warmAssetClasses, getTradFiClass } = require('./dist/lib/asset-class-detection.js');
    const ctrl = AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined;
    const res = await fetch('https://algovault.com/api/performance-public', ctrl ? { signal: ctrl } : {});
    if (!res || !res.ok) { process.exit(0); }            // upstream unreachable → fail-open
    const data = await res.json();
    const byAsset = (data && data.byAsset) || {};
    await warmAssetClasses();                             // independent cross-venue snapshot
    const flagged = [];
    for (const [coin, info] of Object.entries(byAsset)) {
      if (!info || info.tier !== 4) continue;            // only dashboard-Tier-4 assets
      const cls = getTradFiClass(coin);                  // engine union lookup; deny-list already applied
      if (cls) flagged.push(coin + ' -> ' + cls + ' (n=' + (info.count || 0) + ')');
    }
    flagged.sort();
    if (flagged.length) console.log(flagged.join('\n'));  // empty ⇒ no output ⇒ silent
    process.exit(0);
  } catch (_e) { process.exit(0); }                       // fail-open on ANY error
})();
NODE

# Choose runner: container in prod; host-side dist in DRY_RUN / no-container.
if [ "${DRY_RUN:-0}" = "1" ] || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${C}$"; then
  OUT=$(cd "$(dirname "$0")/../.." 2>/dev/null && node -e "$JS" 2>/dev/null) || OUT=""
else
  OUT=$(docker exec "$C" node -e "$JS" 2>/dev/null) || OUT=""
fi

# Silent when empty (no review items).
if [ -z "$OUT" ]; then
  { echo "$(ts) clean — no Tier-4 assets tagged TradFi by any venue"; } >> "$LOG" 2>/dev/null || true
  [ "${DRY_RUN:-0}" = "1" ] && echo "[DRY_RUN] clean — no misclassified Tier-4 assets (silent exit 0)"
  exit 0
fi

{ echo "$(ts) flagged:"; echo "$OUT"; } >> "$LOG" 2>/dev/null || true

# DRY_RUN: print what WOULD be sent; do not call the wrapper.
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "[DRY_RUN] would send OPS_TIER_MISCLASSIFICATION operator-review list:"
  echo "$OUT"
  exit 0
fi

# Operator-action-required review list (wrapper severity-gates + cooldowns + fail-opens).
# recommended_wave is the OPS-<CLASS>-W{NEXT} template form — send_telegram.sh resolves
# {NEXT} at send-time via status.md (never a hardcoded literal).
BODY=$(printf '⚠️ OPS_TIER_MISCLASSIFICATION\n\nTier-4 assets that the cross-venue asset-class registry tags TradFi (should render Tier 3):\n%s\n\nContext: a venue lists these as tokenized stocks/indices/commodities but /api/performance-public still renders them Tier 4 — likely a new venue/listing the detectors do not yet cover, or a price-sanity gap.\n\nAction: dispatch OPS-TIER-CLASSIFIER-DECODE-W{NEXT} via Cowork → Claude Code\nAudit shape: audits/OPS-TIER-CLASSIFIER-XVENUE-W1-endpoint-truth.md' "$OUT")
echo "$BODY" | "$WRAPPER" "OPS_TIER_MISCLASSIFICATION" CRITICAL_PERSISTENT - || true
exit 0
