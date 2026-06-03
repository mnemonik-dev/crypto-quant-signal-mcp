/**
 * GEO-MEASUREMENT-W1 (C3) — geo-dashboard unit tests.
 *
 * Empty-state graceful, WoW banner appears only when wowDrops.length > 0.
 */
import { describe, it, expect } from 'vitest';
import { renderGeoDashboardHtml, type GeoDashboardData } from '../../src/lib/geo-dashboard.js';

const EMPTY: GeoDashboardData = {
  weekly: [],
  perQuery: [],
  competitors: [],
  wowDrops: [],
  latestRun: null,
};

describe('geo-dashboard: renderGeoDashboardHtml', () => {
  it('renders empty-state HTML without crashing', () => {
    const html = renderGeoDashboardHtml(EMPTY);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('GEO Weekly Probe');
    expect(html).toContain('No weekly data yet');
    expect(html).toContain('No runs yet');
  });

  it('does NOT render WoW banner when wowDrops is empty', () => {
    const html = renderGeoDashboardHtml(EMPTY);
    expect(html).not.toContain('WoW mention-rate drop');
  });

  it('renders WoW banner when wowDrops has entries', () => {
    const html = renderGeoDashboardHtml({
      ...EMPTY,
      wowDrops: [{ model: 'claude-haiku-4-5-20251001', this_week: 3, last_week: 10, drop_pct: 70.0 }],
    });
    expect(html).toContain('WoW mention-rate drop');
    expect(html).toContain('70.0%');
    expect(html).toContain('claude-haiku-4-5-20251001');
  });

  it('renders weekly trend rows when weekly is populated', () => {
    const html = renderGeoDashboardHtml({
      ...EMPTY,
      weekly: [
        {
          week_utc: '2026-05-19',
          model: 'claude-haiku-4-5-20251001',
          query_count: 15,
          mention_count: 8,
          mention_rate_pct: 53.3,
          avg_position: 2.5,
          avg_sentiment: 0.4,
        },
      ],
    });
    expect(html).toContain('53.3%');
    expect(html).toContain('8/15');
    expect(html).toContain('2.5');
  });

  it('renders latest run section when latestRun is populated', () => {
    const html = renderGeoDashboardHtml({
      ...EMPTY,
      latestRun: {
        run_id: 'aaaaaaaabbbbbbbbccccccccdddddddd',
        ran_at: '2026-05-19 08:00:00',
        query_count: 15,
        error_count: 0,
      },
    });
    expect(html).toContain('aaaaaaaa');
    expect(html).toContain('2026-05-19 08:00:00');
  });

  it('renders per-query gap rows + competitor table when populated', () => {
    const html = renderGeoDashboardHtml({
      ...EMPTY,
      perQuery: [
        { query_id: 'q1', model: 'm', runs: 4, mention_rate_pct: 25.0, avg_position: 3.0 },
      ],
      competitors: [{ competitor: 'vectorbt', co_mention_count: 12 }],
    });
    expect(html).toContain('q1');
    expect(html).toContain('25.0%');
    expect(html).toContain('vectorbt');
    expect(html).toContain('12');
  });

  it('R5: index-presence section — empty-state when no presence data', () => {
    const html = renderGeoDashboardHtml(EMPTY);
    expect(html).toContain('9. Index presence');
    expect(html).toContain('No presence data yet');
    expect(html).not.toContain('BLOCKED ELIGIBILITY');
  });

  it('R5: index-presence section renders ✓/✗ + blocked banner when a substrate is missing', () => {
    const html = renderGeoDashboardHtml({
      ...EMPTY,
      presence: [
        { model: 'gpt-4.1-mini', present: true },
        { model: 'claude-haiku-4-5-20251001', present: false },
        { model: 'gemini-2.5-flash', present: true },
        { model: 'sonar', present: true },
      ],
    });
    expect(html).toContain('🔴 BLOCKED ELIGIBILITY — not indexed on claude');
    expect(html).toContain('chatgpt ✓ (Bing) · claude ✗ (Brave) · gemini ✓ (Google) · perplexity ✓');
  });
});
