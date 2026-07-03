/**
 * OPS-ANALYTICS-GENUINE-VS-AUTOMATED-SPLIT-W1 (2026-07-03): pure renderer for the daily
 * Telegram digest's "🤖 Agent Activity" section.
 *
 * Extracted from `src/scripts/monitor.ts` (which runs `main()` on import → not
 * test-importable) so the layout is golden-testable in isolation. Consumes the
 * `getUsageStats()` / `/analytics` payload and renders the genuine-vs-automated split:
 *   🟢 Genuine agent/user  = paid (always genuine) + free-nonbot
 *   🤖 Automated / crawler  = free-tier bots (is_automated) only
 *   🔁 Internal bot         = algovault-bot loopback (is_bot_internal)
 * Top assets are the GENUINE slice (so bot-BTC-polling never dominates the list).
 *
 * Graceful-degrade: any absent field → '—'; `topAssetsGenuine` falls back to the legacy
 * `topAssets` so a digest fired during the rollout window (before the /analytics deploy
 * lands) still renders sensibly instead of throwing.
 */
export function formatAgentActivity(a: Record<string, unknown>): string {
  const num = (v: unknown, fallback: number | string = '—'): number | string =>
    typeof v === 'number' ? v : fallback;
  const nested24h = (raw: unknown): number | string => {
    if (typeof raw === 'object' && raw !== null) {
      const o = raw as Record<string, unknown>;
      return (o.last24h ?? o.allTime ?? '—') as number | string;
    }
    return (raw ?? '—') as number | string;
  };
  const genuine = (a.externalGenuine ?? {}) as Record<string, unknown>;
  const automated = (a.externalAutomated ?? {}) as Record<string, unknown>;
  const concentration = (a.externalConcentration ?? {}) as Record<string, unknown>;
  const internalCalls = nested24h(a.totalCallsInternal);
  const topAssets = a.topAssetsGenuine ?? a.topAssets ?? a.top_assets;
  const assetList =
    Array.isArray(topAssets) && topAssets.length > 0
      ? topAssets
          .slice(0, 5)
          .map((t: Record<string, unknown>) => t.asset ?? t.coin ?? t.symbol)
          .join(', ')
      : '—';
  return [
    '🤖 *Agent Activity (24h)*',
    `• 🟢 Genuine agent/user: ${num(genuine.total)}  (free ${num(genuine.free)} · paid ${num(genuine.paid)})`,
    `• 🤖 Automated / crawler: ${num(automated.total)}`,
    `• 🔁 Internal bot: ${internalCalls}`,
    `• 👥 Genuine sessions: ${num(genuine.sessions)}   (top IP ${num(concentration.top1_pct)}%)`,
    `• Top assets (genuine, 24h): ${assetList}`,
  ].join('\n');
}
