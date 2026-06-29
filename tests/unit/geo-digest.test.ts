/**
 * GEO-MEASUREMENT-W4 — geo-digest unit tests.
 *
 *   - computeMomentum: gaining/holding/slipping + the single-source invariant
 *     (header emoji + headline word BOTH derive from `verdict`, can't contradict).
 *   - computeAttribution: worked / too-early / no-move + skips gaps <7d old.
 *   - buildDigest: golden-format check (target output) + graceful empty-state.
 *   - WoW fold: a >20%-drop fixture forces the `slipping` verdict (R6).
 */
import { describe, it, expect } from 'vitest';
import {
  computeMomentum,
  computeAttribution,
  computeIndexPresence,
  buildDigest,
  buildBySourceSection,
  type Verdict,
  type MomentumDeltas,
  type AttributionGap,
  type GeoDigestData,
  type BySourceData,
} from '../../src/lib/geo-digest.js';

const VERDICT_EMOJI: Record<Verdict, string> = { gaining: '🟢', holding: '🟡', slipping: '🔴' };
const VERDICT_WORD: Record<Verdict, string> = { gaining: 'GAINING', holding: 'HOLDING', slipping: 'SLIPPING' };

const baseDeltas = (): MomentumDeltas => ({
  citationsThisWeek: 0,
  citationsLastWeek: 0,
  newTrustedDomains: [],
  sovThisWeek: 0,
  sovLastWeek: 0,
  mentionRateThisWeek: 0,
  mentionRateLastWeek: 0,
  wowDropCount: 0,
  wowDropSummary: '',
});

describe('computeMomentum', () => {
  it('single-source invariant: emoji + headline word both derive from verdict', () => {
    const fixtures: MomentumDeltas[] = [
      { ...baseDeltas(), citationsThisWeek: 3, citationsLastWeek: 1, newTrustedDomains: ['github'] }, // gaining
      baseDeltas(), // holding
      { ...baseDeltas(), citationsThisWeek: 6, citationsLastWeek: 8, weeklyCitations: [6, 8, 10] }, // slipping (sustained)
    ];
    for (const d of fixtures) {
      const m = computeMomentum(d);
      expect(m.emoji).toBe(VERDICT_EMOJI[m.verdict]);
      expect(m.headline.startsWith(VERDICT_WORD[m.verdict])).toBe(true);
    }
  });

  it('gaining when leading indicators move up', () => {
    const m = computeMomentum({ ...baseDeltas(), citationsThisWeek: 3, citationsLastWeek: 1, newTrustedDomains: ['github'] });
    expect(m.verdict).toBe('gaining');
    expect(m.emoji).toBe('🟢');
    expect(m.drivers.length).toBeGreaterThan(0);
  });

  it('holding for a flat pre-visibility week', () => {
    const m = computeMomentum(baseDeltas());
    expect(m.verdict).toBe('holding');
    expect(m.headline).toContain('pre-visibility');
  });

  // OPS-GEO-PROBE-SIGNIFICANCE-GATE-W1 — SLIPPING is now significance-gated.
  it('slipping ONLY on a sustained, significant citation decline (≥2 consecutive ≥20%, n≥5)', () => {
    const m = computeMomentum({
      ...baseDeltas(),
      citationsThisWeek: 6,
      citationsLastWeek: 8,
      weeklyCitations: [6, 8, 10],
      wowDropCount: 2,
      wowDropSummary: 'chatgpt -64%, claude-web -25%',
    });
    expect(m.verdict).toBe('slipping');
    expect(m.emoji).toBe('🔴');
    expect(m.headline).toContain('sustained');
    expect(m.headline).toContain('chatgpt -64%'); // raw per-engine numbers still surfaced
  });

  // Regression: the exact Mon-29 false alarm — a 2→0 citation move on n=2 with a per-engine
  // mention wobble. Pre-fix this fired 🔴 SLIPPING; the gate now holds it as low-sample noise.
  it('a low-sample 2→0 citation drop is HOLDING (low sample), never SLIPPING', () => {
    const m = computeMomentum({
      ...baseDeltas(),
      citationsThisWeek: 0,
      citationsLastWeek: 2,
      weeklyCitations: [0, 2],
      wowDropCount: 1,
      wowDropSummary: 'chatgpt -64%',
    });
    expect(m.verdict).toBe('holding');
    expect(m.emoji).toBe('🟡');
    expect(m.headline).toContain('low sample');
  });

  it('a single 30% down-week with n≥5 is HOLDING (1 down-week, watching), not yet SLIPPING', () => {
    const m = computeMomentum({
      ...baseDeltas(),
      citationsThisWeek: 7,
      citationsLastWeek: 10,
      weeklyCitations: [7, 10, 10],
    });
    expect(m.verdict).toBe('holding');
    expect(m.headline).toContain('1 down-week');
  });
});

describe('computeAttribution', () => {
  const gap = (over: Partial<AttributionGap>): AttributionGap => ({
    query_id: 'q',
    recommended_action: 'do x',
    injected_at: '2026-05-20T00:00:00Z',
    days_since_injected: 13,
    post_data_days: 13,
    cited_before: 0,
    cited_after: 0,
    mention_before: 0,
    mention_after: 0,
    ...over,
  });

  it('worked: citations rose after the move', () => {
    const [a] = computeAttribution([gap({ cited_before: 0, cited_after: 2 })]);
    expect(a.status).toBe('worked');
    expect(a.emoji).toBe('✅');
    expect(a.text).toContain('worked');
  });

  it('too_early: <7d of post-data', () => {
    const [a] = computeAttribution([gap({ post_data_days: 3 })]);
    expect(a.status).toBe('too_early');
    expect(a.emoji).toBe('⏳');
  });

  it('no_move: no change after the move', () => {
    const [a] = computeAttribution([gap({ cited_before: 1, cited_after: 1 })]);
    expect(a.status).toBe('no_move');
    expect(a.emoji).toBe('➖');
  });

  it('skips gaps <7d old', () => {
    expect(computeAttribution([gap({ days_since_injected: 3 })])).toHaveLength(0);
  });
});

describe('buildDigest', () => {
  const data: GeoDigestData = {
    dateLabel: 'Mon 9 Jun',
    dashboardUrl: 'https://api.algovault.com/admin/geo-dashboard',
    momentumDeltas: {
      citationsThisWeek: 3,
      citationsLastWeek: 1,
      newTrustedDomains: ['github awesome-quant'],
      sovThisWeek: 0.08,
      sovLastWeek: 0.08,
      mentionRateThisWeek: 8,
      mentionRateLastWeek: 8,
      wowDropCount: 0,
      wowDropSummary: '',
    },
    perEngineMention: [{ model: 'claude-haiku-4-5-20251001', mention_rate_pct: 8, cited_rate_pct: 20 }],
    attributionGaps: [
      {
        query_id: 'agent-signal-api',
        recommended_action: 'dev.to post',
        injected_at: '2026-06-01T00:00:00Z',
        days_since_injected: 8,
        post_data_days: 8,
        cited_before: 0,
        cited_after: 1,
        mention_before: 0,
        mention_after: 0,
      },
    ],
    contested: [
      { query_id: 'best-python-backtester', leader: 'vectorbt', domains: ['github.com', 'vectorbt.dev'], citations: 4 },
      { query_id: 'best-mcp-trading', leader: null, domains: [], citations: 0 },
    ],
    topGap: {
      query_id: 'best-mcp-trading',
      query_tier: 'head',
      recommended_action: 'ChatGPT cites mcp.so + an r/algotrading thread',
      top_competitor: 'mcp.so',
      top_competitor_domain: 'mcp.so',
    },
    indexPresence: computeIndexPresence([
      { model: 'gpt-4.1-mini', present: true },
      { model: 'claude-haiku-4-5-20251001', present: true },
      { model: 'gemini-2.5-flash', present: true },
      { model: 'sonar', present: true },
    ]),
  };

  it('golden: assembles the target format with verdict header + 4 sections + link', () => {
    const out = buildDigest(data).join('\n');
    expect(out).toContain('📊 *GEO Weekly — Mon 9 Jun*');
    expect(out).toContain('🟢 *GAINING'); // citations up + new domain
    expect(out).toContain('*WHAT MOVED* (vs last week)');
    expect(out).toContain('3 answers linked algovault.com (↑ from 1)');
    expect(out).toContain('github awesome-quant ✅');
    expect(out).toContain('8% on claude-web');
    expect(out).toContain("DID LAST WEEK'S MOVE WORK?");
    expect(out).toContain('✅ agent-signal-api: citations 0→1 after the move → it worked');
    expect(out).toContain("WHO'S WINNING WHAT WE WANT");
    expect(out).toContain('best-python-backtester → vectorbt, cited via github.com + vectorbt.dev (4 citations)');
    expect(out).toContain('best-mcp-trading → no leader yet — OPEN');
    expect(out).toContain("THIS WEEK'S ONE MOVE");
    expect(out).toContain('best-mcp-trading (head): ChatGPT cites mcp.so');
    expect(out).toContain('Get AlgoVault a placement/answer on mcp.so');
    expect(out).toContain('Full numbers ↗ https://api.algovault.com/admin/geo-dashboard?key=<admin-key>');
    // R5 — index-presence line present; all ✓ → no blocked banner
    expect(out).toContain('Cited by engine: chatgpt ✓ (Bing) · claude ✓ (Brave) · gemini ✓ (Google) · perplexity ✓');
    expect(out).not.toContain('BLOCKED ELIGIBILITY');
  });

  it('header verdict matches body (no contradiction) — emoji == verdict', () => {
    const lines = buildDigest(data);
    const header = lines.find((l) => l.includes('GAINING') || l.includes('HOLDING') || l.includes('SLIPPING'))!;
    const m = computeMomentum(data.momentumDeltas);
    expect(header).toContain(m.emoji);
    expect(header).toContain(VERDICT_WORD[m.verdict]);
  });

  it('empty-state degrades gracefully (pre-first-probe)', () => {
    const empty: GeoDigestData = {
      dateLabel: 'Mon 9 Jun',
      dashboardUrl: 'https://api.algovault.com/admin/geo-dashboard',
      momentumDeltas: baseDeltas(),
      perEngineMention: [],
      attributionGaps: [],
      contested: [],
      topGap: null,
      indexPresence: computeIndexPresence([]),
    };
    const out = buildDigest(empty).join('\n');
    expect(out).toContain('🟡 *HOLDING');
    expect(out).toContain('no data yet');
    expect(out).toContain('No content moves are ≥7d old yet');
    expect(out).toContain('every query is OPEN');
    expect(out).toContain('No move queued');
    // R5 — index presence graceful pre-first-probe, no banner
    expect(out).toContain('Cited by engine: no data yet — first probe Mon');
    expect(out).not.toContain('BLOCKED ELIGIBILITY');
  });

  it('R5 (fast-follow): an AUTHORITATIVE notIndexed substrate fires the 🔴 BLOCKED ELIGIBILITY banner', () => {
    const blocked: GeoDigestData = { ...data, eligibilityNotIndexed: ['gemini'] };
    const out = buildDigest(blocked).join('\n');
    expect(out).toContain('🔴 *BLOCKED ELIGIBILITY* — not indexed on gemini.');
    expect(out).toContain('🟢 *GAINING'); // distinct from the authority verdict
  });

  it('R5 (fast-follow): a presence MISS while INDEXED is a soft citation gap, NOT the red banner', () => {
    // INDEXED != CITED — claude not retrieved this week but IS indexed (absent from
    // eligibilityNotIndexed) → no re-crawl alarm, just the soft authority-gap note.
    const citationGap: GeoDigestData = {
      ...data,
      indexPresence: computeIndexPresence([
        { model: 'gpt-4.1-mini', present: true },
        { model: 'claude-haiku-4-5-20251001', present: false },
        { model: 'gemini-2.5-flash', present: true },
        { model: 'sonar', present: true },
      ]),
      citationGapEngines: ['claude'],
    };
    const out = buildDigest(citationGap).join('\n');
    expect(out).not.toContain('BLOCKED ELIGIBILITY'); // the core correction
    expect(out).toContain('claude: indexed ✓ but not yet citing us');
    expect(out).toContain('chatgpt ✓ (Bing) · claude ✗ (Brave)'); // retrieval line still shows ✗
  });

  // GEO-AUTOPILOT-W1 (C3) — the scored decision handoff replaces the naive ONE MOVE.
  it('renders the DECISION READY handoff when a decision is present (replaces ONE MOVE)', () => {
    const withDecision: GeoDigestData = {
      ...data,
      decision: {
        priorityTier: 'eligibility',
        gateLabel: 'ELIGIBILITY (gate 1/3)',
        move: "gemini can't retrieve algovault.com — fix the re-crawl before any authority work",
        knownActionSpec: 'Prompt/fix-gemini-google-index-presence-w1.md',
        candidateCount: 1,
        briefName: 'geo-decision-2026-06-22',
        suspects: ['algovault.io', 'algovaults.com'],
      },
    };
    const out = buildDigest(withDecision).join('\n');
    expect(out).toContain('🎯 *DECISION READY*');
    expect(out).toContain('Priority: ELIGIBILITY (gate 1/3)');
    expect(out).toContain('candidate action: Prompt/fix-gemini-google-index-presence-w1.md');
    expect(out).toContain('geo-decision-2026-06-22');
    expect(out).toContain('In Cowork:');
    expect(out).toContain('algovault.io'); // look-alike watch line
    expect(out).not.toContain("THIS WEEK'S ONE MOVE"); // replaced, not duplicated
  });

  it('falls back to the W4 ONE MOVE when no decision is set (additive / backward-compatible)', () => {
    const out = buildDigest(data).join('\n'); // `data` carries no `decision`
    expect(out).toContain("THIS WEEK'S ONE MOVE");
    expect(out).not.toContain('DECISION READY');
  });
});

describe('computeIndexPresence (R5)', () => {
  it('all engines indexed → not blocked, ordered chatgpt→claude→gemini→perplexity', () => {
    const ip = computeIndexPresence([
      { model: 'sonar', present: true },
      { model: 'gemini-2.5-flash', present: true },
      { model: 'gpt-4.1-mini', present: true },
      { model: 'claude-haiku-4-5-20251001', present: true },
    ]);
    expect(ip.blocked).toBe(false);
    expect(ip.missing).toEqual([]);
    expect(ip.hasData).toBe(true);
    expect(ip.line).toBe('chatgpt ✓ (Bing) · claude ✓ (Brave) · gemini ✓ (Google) · perplexity ✓');
  });

  it('a missing substrate → blocked, named in missing[], ✗ in the line', () => {
    const ip = computeIndexPresence([
      { model: 'gpt-4.1-mini', present: true },
      { model: 'claude-haiku-4-5-20251001', present: false },
      { model: 'gemini-2.5-flash', present: true },
      { model: 'sonar', present: false },
    ]);
    expect(ip.blocked).toBe(true);
    expect(ip.missing).toEqual(['claude', 'perplexity']);
    expect(ip.line).toContain('claude ✗ (Brave)');
    expect(ip.line).toContain('perplexity ✗');
  });

  it('empty input → graceful pre-first-probe state', () => {
    const ip = computeIndexPresence([]);
    expect(ip.hasData).toBe(false);
    expect(ip.blocked).toBe(false);
    expect(ip.line).toBe('no data yet — first probe Mon');
  });
});

// OPS-WEEKLY-GROWTH-DIGEST-W1 — the folded ACQUISITION (by_source) section.
describe('buildBySourceSection (acquisition fold)', () => {
  const populated: BySourceData = {
    rows: [
      { source: 'chatgpt', connects: 12, connectsLastWeek: 8, firstCall: 9, conversion: 1 },
      { source: 'docs', connects: 5, connectsLastWeek: 7, firstCall: 3, conversion: 2 },
      { source: 'unknown', connects: 4, connectsLastWeek: 0, firstCall: 1, conversion: 0 },
    ],
    totalConnectsThisWeek: 21,
    totalConnectsLastWeek: 15,
    // A4: best CONVERTER is `docs` (2 paid) even though `chatgpt` has the most CONNECTS — value, not volume.
    topConverter: { source: 'docs', conversion: 2, connects: 5 },
    topMover: { source: 'chatgpt', from: 8, to: 12 },
  };

  it('undefined / null → no section (back-compat for pre-W1 callers)', () => {
    expect(buildBySourceSection(undefined)).toEqual([]);
    expect(buildBySourceSection(null)).toEqual([]);
  });

  it('empty (0 connects this week) → "attribution collecting" line', () => {
    const out = buildBySourceSection({
      rows: [],
      totalConnectsThisWeek: 0,
      totalConnectsLastWeek: 0,
      topMover: null,
      topConverter: null,
    }).join('\n');
    expect(out).toContain('*📈 ACQUISITION*');
    expect(out).toContain('attribution collecting — 0 connects captured this week so far');
  });

  it('populated: per-source connects with WoW arrows + first-call + paid', () => {
    const out = buildBySourceSection(populated).join('\n');
    expect(out).toContain('chatgpt: 12 connects (↑ from 8) · 9 first-call · 1 paid');
    expect(out).toContain('docs: 5 connects (↓ from 7) · 3 first-call · 2 paid');
    expect(out).toContain('unknown: 4 connects (new) · 1 first-call · 0 paid');
  });

  it('A4: highlights the best CONVERTER (value), not the highest connect-volume source', () => {
    const out = buildBySourceSection(populated).join('\n');
    // docs converts (2 paid from 5 → 40%), chatgpt has more connects but fewer paid.
    expect(out).toContain('💰 Best converter: docs — 2 paid from 5 connects (40%)');
    expect(out).not.toContain('Best converter: chatgpt');
  });

  it('flags the biggest WoW connect mover', () => {
    const out = buildBySourceSection(populated).join('\n');
    expect(out).toContain('🚀 Biggest mover: chatgpt +4 (8→12) connects');
  });

  it('no conversions this week → explicit "no conversions" line', () => {
    const out = buildBySourceSection({
      rows: [{ source: 'chatgpt', connects: 3, connectsLastWeek: 0, firstCall: 1, conversion: 0 }],
      totalConnectsThisWeek: 3,
      totalConnectsLastWeek: 0,
      topMover: { source: 'chatgpt', from: 0, to: 3 },
      topConverter: null,
    }).join('\n');
    expect(out).toContain('💰 Best converter: no conversions captured yet this week');
    expect(out).toContain('🚀 Biggest mover: chatgpt new this week connects');
  });

  it('buildDigest folds the section in when bySource is set, and stays byte-stable when omitted', () => {
    const base: GeoDigestData = {
      dateLabel: 'Mon 9 Jun',
      dashboardUrl: 'https://api.algovault.com/admin/geo-dashboard',
      momentumDeltas: baseDeltas(),
      perEngineMention: [],
      attributionGaps: [],
      contested: [],
      topGap: null,
      indexPresence: computeIndexPresence([]),
    };
    const without = buildDigest(base).join('\n');
    expect(without).not.toContain('ACQUISITION');

    const withSrc = buildDigest({ ...base, bySource: populated }).join('\n');
    expect(withSrc).toContain('*📈 ACQUISITION* (by source · vs last week)');
    expect(withSrc).toContain('chatgpt: 12 connects (↑ from 8)');
    // folded BETWEEN "WHAT MOVED" and "DID LAST WEEK'S MOVE WORK"
    expect(withSrc.indexOf('WHAT MOVED')).toBeLessThan(withSrc.indexOf('ACQUISITION'));
    expect(withSrc.indexOf('ACQUISITION')).toBeLessThan(withSrc.indexOf("DID LAST WEEK'S MOVE WORK"));
    // GEO sections still intact (fold is additive)
    expect(withSrc).toContain("THIS WEEK'S ONE MOVE");
  });
});
