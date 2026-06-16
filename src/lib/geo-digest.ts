/**
 * GEO-MEASUREMENT-W4 — results-driving weekly digest builder.
 *
 * PURE module (no DB, no Telegram, no Date): the cron fetches the data + passes
 * it in; this turns the probe from a metric-dump scoreboard into a flywheel —
 * a momentum VERDICT (one source of truth → emoji + words can't contradict),
 * an ATTRIBUTION loop (did the gap we shipped move that query?), leading-
 * indicators-first, a competitor placement map, and ONE queued move.
 *
 * Fires NOTHING itself (the cron owns the single digest send + the preserved WoW
 * warning alert). No schema change — reads already-existing geo_* fields.
 */

export type Verdict = 'gaining' | 'holding' | 'slipping';

const VERDICT_META: Record<Verdict, { emoji: string; word: string }> = {
  gaining: { emoji: '🟢', word: 'GAINING' },
  holding: { emoji: '🟡', word: 'HOLDING' },
  slipping: { emoji: '🔴', word: 'SLIPPING' },
};

export interface Momentum {
  verdict: Verdict;
  emoji: string;
  headline: string;
  drivers: string[];
}

export interface MomentumDeltas {
  citationsThisWeek: number;
  citationsLastWeek: number;
  /** algovault-attributed source_domains appearing this week but not in the prior 4w. */
  newTrustedDomains: string[];
  sovThisWeek: number;
  sovLastWeek: number;
  mentionRateThisWeek: number; // %
  mentionRateLastWeek: number; // %
  wowDropCount: number; // # models with >20% WoW mention-rate drop
  wowDropSummary: string; // e.g. "claude-web -25%"
}

/**
 * R1 — momentum verdict. ONE source of truth: emoji + headline word BOTH derive
 * from `verdict` (single-source invariant, locked by the unit test). Stage-aware:
 * while mention-rate ≈ 0 the leading indicators (citations, new domains) carry it.
 */
export function computeMomentum(d: MomentumDeltas): Momentum {
  const drivers: string[] = [];
  const citDelta = d.citationsThisWeek - d.citationsLastWeek;
  const sovDelta = d.sovThisWeek - d.sovLastWeek;
  const mentionDelta = d.mentionRateThisWeek - d.mentionRateLastWeek;

  let up = 0;
  let down = 0;
  if (citDelta > 0) {
    up++;
    drivers.push(`citations ↑ ${d.citationsLastWeek}→${d.citationsThisWeek}`);
  } else if (citDelta < 0) {
    down++;
    drivers.push(`citations ↓ ${d.citationsLastWeek}→${d.citationsThisWeek}`);
  }
  if (d.newTrustedDomains.length > 0) {
    up++;
    drivers.push(`new domain: ${d.newTrustedDomains[0]}`);
  }
  if (sovDelta > 0.005) up++;
  else if (sovDelta < -0.005) down++;
  if (mentionDelta > 1) {
    up++;
    drivers.push(`mention ↑ ${d.mentionRateLastWeek.toFixed(0)}→${d.mentionRateThisWeek.toFixed(0)}%`);
  } else if (mentionDelta < -1) {
    down++;
  }

  let verdict: Verdict;
  let reason: string;
  if (d.wowDropCount > 0) {
    verdict = 'slipping';
    reason = `mention rate dropped >20% (${d.wowDropSummary})`;
  } else if (up > down) {
    verdict = 'gaining';
    reason = `${up} leading signal${up === 1 ? '' : 's'} moved up`;
  } else if (down > up) {
    verdict = 'slipping';
    reason = `${down} leading signal${down === 1 ? '' : 's'} moved down`;
  } else {
    // up === down (incl. 0/0): holding — stage-aware framing keeps it honest + motivating
    verdict = 'holding';
    if (d.citationsThisWeek > 0 || d.newTrustedDomains.length > 0) {
      reason =
        `pre-visibility, but ${d.citationsThisWeek} citation${d.citationsThisWeek === 1 ? '' : 's'} live` +
        (d.newTrustedDomains.length ? ` + ${d.newTrustedDomains.length} new domain` : '');
    } else if (up === 0) {
      reason = 'pre-visibility, no movement this week';
    } else {
      reason = `pre-visibility, mixed signals (${up} up, ${down} down)`;
    }
  }

  const meta = VERDICT_META[verdict];
  return { verdict, emoji: meta.emoji, headline: `${meta.word} — ${reason}.`, drivers };
}

export type AttributionStatus = 'worked' | 'too_early' | 'no_move';

const ATTR_EMOJI: Record<AttributionStatus, string> = { worked: '✅', too_early: '⏳', no_move: '➖' };

export interface AttributionGap {
  query_id: string;
  recommended_action: string | null;
  injected_at: string; // ISO
  days_since_injected: number;
  /** days of geo_mentions data AFTER injected_at (0 if no post-probe yet). */
  post_data_days: number;
  cited_before: number;
  cited_after: number;
  mention_before: number;
  mention_after: number;
}

export interface AttributionLine {
  query_id: string;
  status: AttributionStatus;
  emoji: string;
  text: string;
}

/**
 * R2 — the attribution loop (centerpiece). For each injected gap ≥7d old, compare
 * the query's citation/mention BEFORE vs AFTER injected_at → worked / too-early / no-move.
 */
export function computeAttribution(gaps: AttributionGap[]): AttributionLine[] {
  const out: AttributionLine[] = [];
  for (const g of gaps) {
    if (g.days_since_injected < 7) continue;
    let status: AttributionStatus;
    let text: string;
    if (g.post_data_days < 7) {
      status = 'too_early';
      text = `${g.query_id}: shipped, only ${Math.round(g.post_data_days)}d of post-data — too early to call.`;
    } else if (g.cited_after > g.cited_before || g.mention_after > g.mention_before) {
      status = 'worked';
      const what =
        g.cited_after > g.cited_before
          ? `citations ${g.cited_before}→${g.cited_after}`
          : `mentions ${g.mention_before}→${g.mention_after}`;
      text = `${g.query_id}: ${what} after the move → it worked, do more.`;
    } else {
      status = 'no_move';
      text = `${g.query_id}: no movement (cited ${g.cited_before}→${g.cited_after}) → try a different angle.`;
    }
    out.push({ query_id: g.query_id, status, emoji: ATTR_EMOJI[status], text });
  }
  return out;
}

/** Friendly engine name from the stored model string (claude-haiku → claude-web, etc.). */
export function shortEngine(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.startsWith('claude')) return 'claude-web';
  if (m.startsWith('sonar')) return 'perplexity';
  if (m.startsWith('gpt') || m.startsWith('chatgpt')) return 'chatgpt';
  if (m.startsWith('gemini')) return 'gemini';
  return model;
}

// ── R5 (AI-CRAWLER-ACCESS-W2): per-engine index-presence ──────────────────────

/** One engine's index-presence input (from the presence-tier probe). */
export interface IndexPresenceRow {
  model: string; // stored model string (claude-haiku… / sonar / gpt-4.1-mini / gemini-2.5-flash)
  present: boolean; // majority mention_found for query_tier='presence' (engine retrieved algovault.com)
}

/** Each engine → its retrieval substrate (the index ChatGPT/Claude/Gemini draw from). */
const ENGINE_SUBSTRATE: Record<string, string> = {
  chatgpt: 'Bing',
  'claude-web': 'Brave',
  gemini: 'Google',
  perplexity: 'own',
};
/** Stable display order: ChatGPT (largest reach) → Claude → Gemini → Perplexity. */
const PRESENCE_ORDER = ['chatgpt', 'claude-web', 'gemini', 'perplexity'];

export interface IndexPresence {
  engines: Array<{ engine: string; present: boolean; substrate: string }>;
  /** ≥1 engine NOT indexed → blocked-eligibility (🔴 fix-now, distinct from low authority). */
  blocked: boolean;
  /** engine display names that are ✗ (e.g. ["claude"]). */
  missing: string[];
  hasData: boolean;
  /** one-line summary, e.g. "chatgpt ✓ (Bing) · claude ✗ (Brave) · gemini ✓ (Google) · perplexity ✓". */
  line: string;
}

/** Display label (claude-web → claude; others unchanged). */
function presenceLabel(engine: string): string {
  return engine === 'claude-web' ? 'claude' : engine;
}

/**
 * Per-engine index presence — a DIFFERENT metric class from authority. A ✗ means
 * that engine's substrate hasn't indexed algovault.com, so a 0% mention there reads
 * "not indexed" (🔴 fix-now), NOT "not authoritative". Empty input → graceful
 * pre-first-probe state (no data yet). Reuses `shortEngine` for model→engine.
 */
export function computeIndexPresence(rows: IndexPresenceRow[]): IndexPresence {
  if (!rows || rows.length === 0) {
    return { engines: [], blocked: false, missing: [], hasData: false, line: 'no data yet — first probe Mon' };
  }
  const engines = rows
    .map((r) => {
      const engine = shortEngine(r.model);
      return { engine, present: !!r.present, substrate: ENGINE_SUBSTRATE[engine] ?? '' };
    })
    .sort((a, b) => {
      const ia = PRESENCE_ORDER.indexOf(a.engine);
      const ib = PRESENCE_ORDER.indexOf(b.engine);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const missing = engines.filter((e) => !e.present).map((e) => presenceLabel(e.engine));
  const line = engines
    .map((e) => {
      const tick = e.present ? '✓' : '✗';
      const sub = e.substrate && e.substrate !== 'own' ? ` (${e.substrate})` : '';
      return `${presenceLabel(e.engine)} ${tick}${sub}`;
    })
    .join(' · ');
  return { engines, blocked: missing.length > 0, missing, hasData: true, line };
}

export interface EnginePlacement {
  query_id: string;
  /** competitor_name leading this query, or null = OPEN (no clear leader). */
  leader: string | null;
  domains: string[];
  citations: number;
}

export interface TopGapBrief {
  query_id: string;
  query_tier: string | null;
  recommended_action: string | null;
  top_competitor: string | null;
  top_competitor_domain: string | null;
}

/**
 * GEO-AUTOPILOT-W1 (C3) — the scored decision handoff (one per cycle). Built by the
 * cron from geo-decide's RankedDecision + geo-eligibility's look-alike suspects;
 * REPLACES the naive W4 "ONE MOVE" line. The cron persists the full decision to
 * `geo_decisions`; this is just the digest projection. Pure data — no Date / DB.
 */
export interface DecisionHandoff {
  priorityTier: 'eligibility' | 'third_party' | 'owned_content';
  /** e.g. "ELIGIBILITY (gate 1/3)". */
  gateLabel: string;
  move: string;
  /** drafted action-spec path (Q3 fast-path), when the objective maps the move. */
  knownActionSpec?: string;
  candidateCount: number;
  /** e.g. "geo-decision-2026-06-22" — Cowork materializes the vault file by this name. */
  briefName: string;
  /** look-alike domains cited but not ours (SUSPECT) — the digest watch line. */
  suspects: string[];
}

export interface GeoDigestData {
  dateLabel: string; // e.g. "Mon 9 Jun" (cron-supplied; keeps this module Date-free)
  dashboardUrl: string;
  momentumDeltas: MomentumDeltas;
  /** per-engine named-in-answers + citation rate, this week. */
  perEngineMention: Array<{ model: string; mention_rate_pct: number; cited_rate_pct: number }>;
  attributionGaps: AttributionGap[];
  contested: EnginePlacement[];
  topGap: TopGapBrief | null;
  /** R5 — per-engine index-presence (presence-tier probe; excluded from all authority aggregates). */
  indexPresence: IndexPresence;
  /** GEO-AUTOPILOT-W1 — the scored decision handoff; when set it REPLACES the ONE MOVE line. */
  decision?: DecisionHandoff | null;
  /**
   * GEO-AUTOPILOT-W1 fast-follow (2026-06-16) — eligibility is INDEX status, GSC-authoritative,
   * NOT the presence probe. `eligibilityNotIndexed` = substrates genuinely not indexed (the ONLY
   * 🔴 hard-banner trigger). `citationGapEngines` = engines indexed ✓ but un-retrieved (a soft
   * authority-gap note, never a re-crawl alarm — indexed != cited).
   */
  eligibilityNotIndexed?: string[];
  citationGapEngines?: string[];
}

/**
 * R7 — assemble the full digest. PURE: derives momentum + attribution from the
 * same data so the header can't contradict the body. Section order:
 * verdict header → WHAT MOVED → DID LAST WEEK'S MOVE WORK → WHO'S WINNING → ONE MOVE → link.
 */
export function buildDigest(data: GeoDigestData): string[] {
  const m = computeMomentum(data.momentumDeltas);
  const attr = computeAttribution(data.attributionGaps);
  const d = data.momentumDeltas;
  const L: string[] = [];

  const ip = data.indexPresence;

  L.push(`📊 *GEO Weekly — ${data.dateLabel}*`);
  L.push('');
  L.push(`${m.emoji} *${m.headline}*`);

  // GEO-AUTOPILOT-W1 fast-follow (2026-06-16): eligibility = INDEX status, GSC-authoritative.
  // The 🔴 hard banner fires ONLY on an authoritatively NOT-INDEXED substrate (objective.
  // eligibility) — NOT on the LLM presence probe, which measures CITATION/retrieval and once
  // lagged a parking-snapshot cache → false "gemini not indexed". An indexed-but-un-retrieved
  // engine is a citation/authority gap, surfaced soft in WHAT MOVED below.
  const notIndexed = data.eligibilityNotIndexed ?? [];
  if (notIndexed.length > 0) {
    L.push('');
    L.push(`🔴 *BLOCKED ELIGIBILITY* — not indexed on ${notIndexed.join(', ')}. Fix the re-crawl before chasing authority.`);
  }

  // WHAT MOVED — leading indicators first
  L.push('');
  L.push('*WHAT MOVED* (vs last week)');
  L.push(`• Cited by engine: ${ip.line}`);
  // INDEXED != CITED — a ✗ above means "not yet cited" (authority gap), NOT "not indexed".
  const citationGaps = (data.citationGapEngines ?? []).filter((e) => !notIndexed.includes(e));
  if (citationGaps.length > 0) {
    L.push(`  ⓘ ${citationGaps.join(', ')}: indexed ✓ but not yet citing us — authority/content gap, not a re-crawl.`);
  }
  const citArrow =
    d.citationsThisWeek > d.citationsLastWeek
      ? `↑ from ${d.citationsLastWeek}`
      : d.citationsThisWeek < d.citationsLastWeek
        ? `↓ from ${d.citationsLastWeek}`
        : `flat at ${d.citationsLastWeek}`;
  L.push(`• Engine citations: ${d.citationsThisWeek} answer${d.citationsThisWeek === 1 ? '' : 's'} linked algovault.com (${citArrow})`);
  L.push(`• New trusted domains: ${d.newTrustedDomains.length ? `${d.newTrustedDomains.join(', ')} ✅` : 'none new this week'}`);
  const named = data.perEngineMention.filter((e) => e.mention_rate_pct > 0);
  if (data.perEngineMention.length === 0) {
    L.push('• Named in answers: no data yet — first probe Mon');
  } else if (named.length === 0) {
    L.push('• Named in answers: not yet named on any engine (pre-visibility)');
  } else {
    L.push(`• Named in answers: ${named.map((e) => `${Math.round(e.mention_rate_pct)}% on ${shortEngine(e.model)}`).join(', ')}`);
  }

  // DID LAST WEEK'S MOVE WORK? — the attribution loop
  L.push('');
  if (attr.length === 0) {
    L.push("*✅ DID LAST WEEK'S MOVE WORK?*");
    L.push('• No content moves are ≥7d old yet — first attribution next cycle.');
  } else {
    L.push("*DID LAST WEEK'S MOVE WORK?*");
    for (const a of attr) L.push(`${a.emoji} ${a.text}`);
  }

  // WHO'S WINNING — competitor placement map
  L.push('');
  L.push("*🥊 WHO'S WINNING WHAT WE WANT*");
  if (data.contested.length === 0) {
    L.push('• No competitor citations yet — every query is OPEN, your best shot.');
  } else {
    for (const c of data.contested) {
      if (!c.leader) {
        L.push(`• ${c.query_id} → no leader yet — OPEN, your best shot`);
      } else {
        const via = c.domains.slice(0, 2).join(' + ') || 'multiple sources';
        L.push(`• ${c.query_id} → ${c.leader}, cited via ${via} (${c.citations} citation${c.citations === 1 ? '' : 's'})`);
      }
    }
  }

  // DECISION (GEO-AUTOPILOT-W1) — the scored, priority-gated handoff replaces the
  // naive W4 ONE MOVE when present; otherwise the ONE MOVE renders (additive,
  // backward-compatible). ONE operator-action block; no execution/completion TG.
  L.push('');
  if (data.decision) {
    const dec = data.decision;
    L.push('🎯 *DECISION READY* — open Cowork to act');
    L.push(`Priority: ${dec.gateLabel}  ·  Move: ${dec.move}`);
    if (dec.knownActionSpec) L.push(`candidate action: ${dec.knownActionSpec} (already drafted)`);
    L.push(
      `Brief: ${dec.briefName} · ${dec.candidateCount} candidate${dec.candidateCount === 1 ? '' : 's'} scored through the priority gate`,
    );
    L.push('→ In Cowork: "write the GEO action from this week\'s brief" → research → approve → dispatch to Code');
    if (dec.suspects.length) {
      L.push(`⚠️ Look-alike watch: ${dec.suspects.join(', ')} cited but NOT ours (SUSPECT, not trusted).`);
    }
  } else {
    L.push("*🎯 THIS WEEK'S ONE MOVE* (auto-queued · 12h to veto)");
    if (!data.topGap) {
      L.push('• No move queued this week (no gap computed yet).');
    } else {
      const g = data.topGap;
      L.push(`${g.query_id}${g.query_tier ? ` (${g.query_tier})` : ''}: ${g.recommended_action ?? `low share-of-voice on ${g.query_id}`}`);
      if (g.top_competitor_domain) L.push(`→ Get AlgoVault a placement/answer on ${g.top_competitor_domain}.`);
    }
  }

  L.push('');
  L.push(`Full numbers ↗ ${data.dashboardUrl}?key=<admin-key>`);
  return L;
}
