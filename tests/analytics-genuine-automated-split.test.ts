/**
 * OPS-ANALYTICS-GENUINE-VS-AUTOMATED-SPLIT-W1 (2026-07-03): golden-output tests for the
 * digest renderer `formatAgentActivity` (pure fn — no DB, always runs).
 *
 * The DB-dependent tests (logRequest is_automated stamp + getUsageStats split math)
 * live in tests/analytics-external-only.test.ts — the repo's SINGLE external-row-writing
 * file — so they run sequentially there and never race the shared SQLite DB (adding a
 * second parallel request_log writer would flake that file's global-delta assertions).
 */
import { describe, expect, it } from 'vitest';
import { formatAgentActivity } from '../src/lib/agent-activity-format.js';

describe('formatAgentActivity — digest renderer golden output', () => {
  it('renders the genuine-vs-automated split layout', () => {
    const payload = {
      totalCallsInternal: { last24h: 2036 },
      externalGenuine: { total: 104, free: 100, paid: 4, sessions: 61 },
      externalAutomated: { total: 965 },
      externalConcentration: { top1_pct: 10.8, top5_pct: 46.9 },
      topAssetsGenuine: [
        { asset: 'BTC', calls: 40 },
        { asset: 'ETH', calls: 12 },
        { asset: 'SOL', calls: 8 },
      ],
    };
    expect(formatAgentActivity(payload)).toBe(
      [
        '🤖 *Agent Activity (24h)*',
        '• 🟢 Genuine agent/user: 104  (free 100 · paid 4)',
        '• 🤖 Automated / crawler: 965',
        '• 🔁 Internal bot: 2036',
        '• 👥 Genuine sessions: 61   (top IP 10.8%)',
        '• Top assets (genuine, 24h): BTC, ETH, SOL',
      ].join('\n'),
    );
  });

  it('graceful-degrades to em-dash + legacy topAssets when new fields are absent', () => {
    const legacy = { totalCallsInternal: { last24h: 5 }, topAssets: [{ asset: 'BTC', calls: 3 }] };
    const out = formatAgentActivity(legacy);
    expect(out).toContain('• 🟢 Genuine agent/user: —  (free — · paid —)');
    expect(out).toContain('• 🤖 Automated / crawler: —');
    expect(out).toContain('• 🔁 Internal bot: 5');
    expect(out).toContain('• Top assets (genuine, 24h): BTC');
  });

  it('renders 0 (not em-dash) for a genuine zero count', () => {
    const out = formatAgentActivity({
      totalCallsInternal: { last24h: 0 },
      externalGenuine: { total: 0, free: 0, paid: 0, sessions: 0 },
      externalAutomated: { total: 0 },
      externalConcentration: { top1_pct: 0 },
      topAssetsGenuine: [],
    });
    expect(out).toContain('• 🟢 Genuine agent/user: 0  (free 0 · paid 0)');
    expect(out).toContain('• 🤖 Automated / crawler: 0');
    expect(out).toContain('• Top assets (genuine, 24h): —');
  });
});
