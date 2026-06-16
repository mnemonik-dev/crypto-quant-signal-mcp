/**
 * GEO-AUTOPILOT-W1 (C1) — geo-decide unit tests (test-first).
 *
 * The scorer ranks the week's candidate moves through the HARD priority gate
 * (eligibility → third-party → owned-content) and renders the decision brief.
 *
 * Invariants under test:
 *   - PRIORITY GATE IS HARD: a blocked-eligibility engine ALWAYS outranks any
 *     owned-content move, regardless of raw score (the central AC).
 *   - within the top unlocked tier, score = lift × revenue_proximity ×
 *     automatability ÷ effort, ordered desc; branded(0.8) > niche(0.6).
 *   - chosen move carries its drafted action spec when the objective maps it.
 *   - renderDecisionBrief emits a valid brief (sections + candidate-action line)
 *     and degrades gracefully on an empty week.
 *   - loadObjective parses the real landing/Prompt/geo-objective.yaml + the
 *     ratified weights / gate order, with zero hardcoded live numbers.
 */
import { describe, it, expect } from 'vitest';
import {
  scoreWeek,
  renderDecisionBrief,
  loadObjective,
  type Objective,
  type ScoreInput,
} from '../../src/lib/geo-decide.js';

// Fixture objective — mirrors the ratified landing/Prompt/geo-objective.yaml.
const OBJ: Objective = {
  version: 1,
  priority_gate: ['eligibility', 'third_party', 'owned_content'],
  revenue_proximity: { head: 1.0, branded: 0.8, niche: 0.6 },
  score_formula: 'expected_lift * revenue_proximity * automatability / effort',
  action_types: {
    eligibility: { tier: 1, channel: 'deterministic_or_operator', automatability: 0.9, effort: 0.3 },
    third_party: { tier: 2, channel: 'draft_for_operator', automatability: 0.4, effort: 0.6 },
    owned_content: { tier: 3, channel: 'cowork_authored_code_wave', automatability: 0.7, effort: 1.0 },
  },
  known_action_specs: { 'eligibility:gemini': 'Prompt/fix-gemini-google-index-presence-w1.md' },
};

/** An open head gap with maximal lift (sov 0) — the adversarial owned-content tempter. */
const OPEN_HEAD_GAP = {
  query_id: 'best-mcp-trading',
  query_tier: 'head',
  sov: 0,
  top_competitor: null,
  top_competitor_domain: null,
};

describe('scoreWeek — HARD priority gate', () => {
  it('a blocked-eligibility engine ALWAYS outranks any owned-content move', () => {
    const input: ScoreInput = {
      eligibility: { blocked: true, missing: ['gemini'] },
      // a max-lift open head query would be a high-scoring owned move on its own…
      gaps: [OPEN_HEAD_GAP],
    };
    const d = scoreWeek(input, OBJ);

    expect(d.priority_tier).toBe('eligibility');
    expect(d.chosen?.tier).toBe('eligibility');
    expect(d.chosen?.engine).toBe('gemini');
    // …but it is GATED: ranked holds only the active tier; the owned move exists but is excluded.
    expect(d.ranked.every((c) => c.tier === 'eligibility')).toBe(true);
    expect(d.all.owned_content.length).toBeGreaterThan(0);
    expect(d.ranked.some((c) => c.tier === 'owned_content')).toBe(false);
  });

  it('with no engine blocked, third-party leads and owned-content is gated below', () => {
    const input: ScoreInput = {
      eligibility: { blocked: false, missing: [] },
      gaps: [
        { query_id: 'best-mcp-trading', query_tier: 'head', sov: 0.1, top_competitor: 'altfins', top_competitor_domain: 'altfins.com' },
        OPEN_HEAD_GAP, // owned-content tempter, same tier/lift
      ],
    };
    const d = scoreWeek(input, OBJ);

    expect(d.priority_tier).toBe('third_party');
    expect(d.chosen?.tier).toBe('third_party');
    expect(d.chosen?.domain).toBe('altfins.com');
    expect(d.ranked.every((c) => c.tier === 'third_party')).toBe(true);
    expect(d.all.owned_content.length).toBeGreaterThan(0);
  });

  it('with no eligibility block and no competitor, owned-content is the tier', () => {
    const input: ScoreInput = {
      eligibility: { blocked: false, missing: [] },
      gaps: [OPEN_HEAD_GAP],
    };
    const d = scoreWeek(input, OBJ);
    expect(d.priority_tier).toBe('owned_content');
    expect(d.chosen?.tier).toBe('owned_content');
  });
});

describe('scoreWeek — within-tier scoring', () => {
  it('orders by revenue_proximity at equal lift: head > branded > niche', () => {
    const input: ScoreInput = {
      eligibility: { blocked: false, missing: [] },
      gaps: [
        { query_id: 'cross-venue-funding', query_tier: 'niche', sov: 0.2, top_competitor: 'coinglass', top_competitor_domain: 'coinglass.com' },
        { query_id: 'composite-quant-signal', query_tier: 'branded', sov: 0.2, top_competitor: 'messari', top_competitor_domain: 'messari.io' },
        { query_id: 'best-mcp-trading', query_tier: 'head', sov: 0.2, top_competitor: 'altfins', top_competitor_domain: 'altfins.com' },
      ],
    };
    const d = scoreWeek(input, OBJ);
    expect(d.ranked.map((c) => c.query_tier)).toEqual(['head', 'branded', 'niche']);
    // branded (0.8) must beat niche (0.6) — the ratified weight lift.
    const branded = d.ranked.find((c) => c.query_tier === 'branded')!;
    const niche = d.ranked.find((c) => c.query_tier === 'niche')!;
    expect(branded.score).toBeGreaterThan(niche.score);
  });

  it('chosen move carries its drafted action spec when the objective maps it', () => {
    const d = scoreWeek({ eligibility: { blocked: true, missing: ['gemini'] }, gaps: [] }, OBJ);
    expect(d.chosen?.known_action_spec).toBe('Prompt/fix-gemini-google-index-presence-w1.md');
  });

  it('empty week → no candidate, no throw', () => {
    const d = scoreWeek({ eligibility: { blocked: false, missing: [] }, gaps: [] }, OBJ);
    expect(d.chosen).toBeNull();
    expect(d.ranked).toEqual([]);
  });
});

describe('renderDecisionBrief', () => {
  it('renders a valid brief with the move, candidate-action line, gap table, and research scope', () => {
    const input: ScoreInput = {
      eligibility: { blocked: true, missing: ['gemini'] },
      gaps: [{ query_id: 'best-mcp-trading', query_tier: 'head', sov: 0.1, top_competitor: 'altfins', top_competitor_domain: 'altfins.com' }],
    };
    const d = scoreWeek(input, OBJ);
    const md = renderDecisionBrief(d, input.gaps, 'Mon 22 Jun');

    expect(md).toContain('# GEO decision brief');
    expect(md).toContain('Mon 22 Jun');
    expect(md.toLowerCase()).toContain('eligibility');
    expect(md).toContain('candidate action: Prompt/fix-gemini-google-index-presence-w1.md');
    expect(md).toContain('best-mcp-trading'); // gap table row
    expect(md.toLowerCase()).toContain('research scope');
  });

  it('empty week renders a no-candidate brief without throwing', () => {
    const d = scoreWeek({ eligibility: { blocked: false, missing: [] }, gaps: [] }, OBJ);
    const md = renderDecisionBrief(d, [], 'Mon 22 Jun');
    expect(md).toContain('# GEO decision brief');
    expect(md.toLowerCase()).toMatch(/no (candidate|move)/);
  });
});

describe('loadObjective — parses the real SoT', () => {
  it('parses landing/Prompt/geo-objective.yaml with the ratified weights + gate order', () => {
    const obj = loadObjective();
    expect(obj.priority_gate).toEqual(['eligibility', 'third_party', 'owned_content']);
    expect(obj.revenue_proximity.head).toBe(1.0);
    expect(obj.revenue_proximity.branded).toBe(0.8);
    expect(obj.revenue_proximity.niche).toBe(0.6);
    // branded must be weighted above niche (the architect's expected-value lift).
    expect(obj.revenue_proximity.branded).toBeGreaterThan(obj.revenue_proximity.niche);
  });
});
