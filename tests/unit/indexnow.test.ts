import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs deploy script, no type decls (CLI helper)
import { buildIndexNowPayload } from '../../scripts/indexnow-ping.mjs';

// AI-CRAWLER-ACCESS-W2 R3 — IndexNow payload builder.
describe('indexnow-ping buildIndexNowPayload', () => {
  it('builds a valid IndexNow payload from the live landing/ + sitemap', () => {
    const p = buildIndexNowPayload();
    expect(p).not.toBeNull();
    expect(p.host).toBe('algovault.com');
    // key = 32-hex, single source of truth = the landing/<key>.txt file
    expect(p.key).toMatch(/^[0-9a-f]{32}$/);
    expect(p.keyLocation).toBe(`https://algovault.com/${p.key}.txt`);
    expect(Array.isArray(p.urlList)).toBe(true);
    expect(p.urlList.length).toBeGreaterThan(10);
    // homepage present; verified-404 pages must NOT be submitted
    expect(p.urlList).toContain('https://algovault.com/');
    expect(p.urlList.some((u: string) => u.includes('/pricing'))).toBe(false);
    expect(p.urlList.some((u: string) => u.includes('/integrations/hyperliquid'))).toBe(false);
    // every URL is an https apex URL (no www, no http)
    for (const u of p.urlList) {
      expect(u.startsWith('https://algovault.com/')).toBe(true);
    }
  });

  it('returns null when no key file is present (fail-open contract)', () => {
    const p = buildIndexNowPayload({ landingDir: '/tmp/nonexistent-indexnow-dir-xyz-123' });
    expect(p).toBeNull();
  });
});
