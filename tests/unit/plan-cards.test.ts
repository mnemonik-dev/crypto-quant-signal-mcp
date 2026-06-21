/**
 * REFERRAL-WEB-FIX-W1 — renderPlanCards is the single-sourced plan-card MARKUP shared
 * by getSignupPageHtml() (api /signup) and the apex /join page. The byte-identity of
 * /signup is proven live (before/after curl diff at deploy); these guard the link-base
 * contract that makes /join work while keeping /signup relative (byte-identical).
 */
import { describe, it, expect } from 'vitest';
import { renderPlanCards } from '../../src/lib/signup-flow.js';

describe('renderPlanCards — REFERRAL-WEB-FIX-W1', () => {
  it('default base="" → RELATIVE links (byte-preserves the api /signup inline block)', () => {
    const c = renderPlanCards();
    expect(c).toContain('href="/signup?plan=starter"');
    expect(c).toContain('href="/signup?plan=pro"');
    expect(c).toContain('href="/signup?plan=enterprise"');
    expect(c).not.toContain('https://'); // the relative variant carries no absolute URL
  });

  it('base set → ABSOLUTE api links (for the apex /join; /signup is api-canonical, not apex-proxied)', () => {
    const c = renderPlanCards('https://api.algovault.com');
    expect(c).toContain('href="https://api.algovault.com/signup?plan=starter"');
    expect(c).toContain('href="https://api.algovault.com/signup?plan=pro"');
    expect(c).toContain('href="https://api.algovault.com/signup?plan=enterprise"');
  });

  it('renders all 3 plans + the SoT exchange count (no card drift between surfaces)', () => {
    const c = renderPlanCards();
    expect(c).toContain('<h2>Starter</h2>');
    expect(c).toContain('<h2>Pro</h2>');
    expect(c).toContain('<h2>Enterprise</h2>');
    expect(c).toMatch(/data-tr-field="exchange_count">\d+</);
  });
});
