/**
 * GEO-AUTOPILOT-W1 (C2) — eligibility-first inputs + look-alike-domain watch.
 *
 * READ-ONLY + PURE. No search-engine re-crawl / write calls (those belong to the
 * separate Tier-1 fix-gemini wave) — only transforms over signals the probe produced.
 *
 *  - getLookalikeWatch: cited domains in the /algovault/ namespace that are NOT our
 *    own host are SUSPECT (brand-confusion / citation-theft), never trusted. Reuses
 *    `isOwnHost` (the 2d0576d look-alike attribution fix) so cite-attribution and the
 *    watch can't drift — single shared predicate.
 *  - buildEligibilityReport: the priority-gate's top-tier input. REUSES the existing
 *    presence-tier `computeIndexPresence` (Q4 — single-derivation; no second `site:`
 *    probe) for index status; crawler-hit deltas are graceful-empty until access-
 *    logging exists (no live source today — /var/log/caddy is empty).
 */
import { isOwnHost } from './geo-extractor.js';
import type { IndexPresence } from './geo-digest.js';

export interface SuspectDomain {
  domain: string;
  attributed_to: string | null;
  cites: number;
}

/** A geo_source_citations row projection (source_domain + optional attribution/count). */
export interface CitationRow {
  source_domain: string;
  attributed_to?: string | null;
  cites?: number;
}

/**
 * Look-alike watch — flag cited domains matching /algovault/i that are NOT our own
 * host as SUSPECT. `isOwnHost` (algovault.com / *.algovault.com, spoof-safe) draws
 * the trusted line; everything else in the namespace (algovault.io, algovaults.com,
 * *.algovaultstrategies.com, *.algovaultai.com, evil-algovault.com) is SUSPECT.
 * Pure; aggregates cites per domain; sorted desc.
 */
export function getLookalikeWatch(citations: CitationRow[]): SuspectDomain[] {
  const byDomain = new Map<string, SuspectDomain>();
  for (const c of citations ?? []) {
    const domain = (c.source_domain || '').trim().toLowerCase();
    if (!domain) continue;
    if (!/algovault/i.test(domain)) continue; // only the look-alike namespace
    if (isOwnHost(domain)) continue; // algovault.com / *.algovault.com = OURS
    const cur = byDomain.get(domain) ?? { domain, attributed_to: c.attributed_to ?? null, cites: 0 };
    cur.cites += c.cites ?? 1;
    byDomain.set(domain, cur);
  }
  return [...byDomain.values()].sort((a, b) => b.cites - a.cites);
}

/** Engine → retrieval substrate (mirror of geo-digest ENGINE_SUBSTRATE; stable display). */
const ENGINE_SUBSTRATE: Record<string, string> = {
  chatgpt: 'Bing',
  'claude-web': 'Brave',
  gemini: 'Google',
  perplexity: 'own',
};

/** Display label (claude-web → claude), matching the digest's presence line. */
function engineLabel(engine: string): string {
  return engine === 'claude-web' ? 'claude' : engine;
}

export interface EngineEligibility {
  engine: string;
  substrate: string;
  indexed: boolean;
  /** ISO/relative last AI-crawler hit; null until access-logging exists (graceful). */
  lastCrawlerHit: string | null;
}

export interface EligibilityReport {
  engines: EngineEligibility[];
  /** ≥1 engine not indexed → blocked-eligibility (priority-gate tier 1). */
  blocked: boolean;
  missing: string[];
  suspects: SuspectDomain[];
}

/**
 * Build the eligibility report. PURE: derives the index signal from the EXISTING
 * presence-tier `IndexPresence` (computeIndexPresence) rather than re-probing —
 * single-derivation, so the gate and the digest banner can't disagree. Crawler-hit
 * deltas are graceful-empty (`{}` default → `lastCrawlerHit: null`) until an access-
 * log source exists. Look-alike suspects attached from the citation map.
 */
export function buildEligibilityReport(
  indexPresence: IndexPresence,
  citations: CitationRow[] = [],
  crawlerHits: Record<string, string> = {},
): EligibilityReport {
  const engines: EngineEligibility[] = indexPresence.engines.map((e) => {
    const label = engineLabel(e.engine);
    return {
      engine: label,
      substrate: e.substrate || ENGINE_SUBSTRATE[e.engine] || '',
      indexed: e.present,
      lastCrawlerHit: crawlerHits[label] ?? crawlerHits[e.engine] ?? null,
    };
  });
  return {
    engines,
    blocked: indexPresence.blocked,
    missing: indexPresence.missing,
    suspects: getLookalikeWatch(citations),
  };
}
