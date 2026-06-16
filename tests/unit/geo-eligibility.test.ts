/**
 * GEO-AUTOPILOT-W1 (C2) — geo-eligibility unit tests (test-first).
 *
 *   - getLookalikeWatch: flags cited domains in the /algovault/ namespace that are
 *     NOT our own host (reuses isOwnHost from the 2d0576d look-alike fix) as SUSPECT,
 *     never trusted. Fixture = the live FROZEN pre-fix pollution rows.
 *   - buildEligibilityReport: REUSES computeIndexPresence (Q4 — single-derivation, no
 *     second site: probe); 4-engine shape; gemini blocked; crawler-hit graceful-null.
 *   - read-only: no GSC/IndexNow/submit write actions (separate gate grep).
 */
import { describe, it, expect } from 'vitest';
import { computeIndexPresence } from '../../src/lib/geo-digest.js';
import { getLookalikeWatch, buildEligibilityReport, type CitationRow } from '../../src/lib/geo-eligibility.js';

// The live FROZEN pre-fix geo_source_citations pollution (probed 2026-06-15).
const CITES: CitationRow[] = [
  { source_domain: 'algovault.io', attributed_to: 'algovault', cites: 9 },
  { source_domain: 'www.algovaultstrategies.com', attributed_to: 'algovault', cites: 5 },
  { source_domain: 'algovault.com', attributed_to: 'algovault', cites: 4 },
  { source_domain: 'newsletter.algovaultai.com', attributed_to: 'algovault', cites: 4 },
  { source_domain: 'algovaults.com', attributed_to: 'algovault', cites: 3 },
  { source_domain: 'www.algovault.com', attributed_to: 'algovault', cites: 3 },
  { source_domain: 'altfins.com', attributed_to: 'competitor', cites: 11 },
];

describe('getLookalikeWatch', () => {
  it('flags the 4 look-alike domains as SUSPECT, never our own host', () => {
    const domains = getLookalikeWatch(CITES).map((s) => s.domain).sort();
    expect(domains).toEqual([
      'algovault.io',
      'algovaults.com',
      'newsletter.algovaultai.com',
      'www.algovaultstrategies.com',
    ]);
    // own hosts (isOwnHost) are NOT suspect; a competitor domain is out of namespace.
    expect(domains).not.toContain('algovault.com');
    expect(domains).not.toContain('www.algovault.com');
    expect(domains).not.toContain('altfins.com');
  });

  it('ranks suspects by cite count desc', () => {
    const suspects = getLookalikeWatch(CITES);
    expect(suspects[0].domain).toBe('algovault.io');
    expect(suspects[0].cites).toBe(9);
  });

  it('no algovault look-alikes → empty watch', () => {
    expect(
      getLookalikeWatch([
        { source_domain: 'altfins.com', cites: 3 },
        { source_domain: 'github.com', cites: 5 },
      ]),
    ).toEqual([]);
  });

  it('prefix-spoof (evil-algovault.com) is SUSPECT, not own', () => {
    expect(getLookalikeWatch([{ source_domain: 'evil-algovault.com', cites: 1 }]).map((s) => s.domain)).toEqual([
      'evil-algovault.com',
    ]);
  });
});

describe('buildEligibilityReport', () => {
  // mirrors the live presence-tier probe: gemini's Google substrate hasn't indexed us.
  const ip = computeIndexPresence([
    { model: 'gpt-4.1-mini', present: true },
    { model: 'claude-haiku-4-5', present: true },
    { model: 'gemini-2.5-flash', present: false },
    { model: 'sonar', present: true },
  ]);

  it('reuses computeIndexPresence: 4-engine shape, gemini blocked, crawler-hit graceful-null', () => {
    const r = buildEligibilityReport(ip, CITES);
    expect(r.engines).toHaveLength(4);
    expect(r.blocked).toBe(true);
    expect(r.missing).toContain('gemini');
    const gemini = r.engines.find((e) => e.engine === 'gemini')!;
    expect(gemini.indexed).toBe(false);
    expect(gemini.substrate).toBe('Google');
    expect(r.engines.every((e) => e.lastCrawlerHit === null)).toBe(true);
  });

  it('attaches the look-alike suspects from the citation map', () => {
    expect(buildEligibilityReport(ip, CITES).suspects.map((s) => s.domain)).toContain('algovault.io');
  });

  it('graceful on no presence data (pre-first-probe) + no citations', () => {
    const r = buildEligibilityReport(computeIndexPresence([]), []);
    expect(r.engines).toEqual([]);
    expect(r.blocked).toBe(false);
    expect(r.suspects).toEqual([]);
  });

  it('crawler-hit deltas surface when an access-log source provides them (forward-compatible)', () => {
    const r = buildEligibilityReport(ip, [], { gemini: 'last-week' });
    expect(r.engines.find((e) => e.engine === 'gemini')!.lastCrawlerHit).toBe('last-week');
  });
});
