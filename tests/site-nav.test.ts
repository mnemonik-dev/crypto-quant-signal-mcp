// LANDING-MOBILE-NAV-FUNCTION-RENDERED-W1 — renderSiteNav() shared generator.
// Guards (a) DESKTOP byte-equivalence vs the frozen pre-extraction navs (so the
// "desktop unchanged" AC can never silently regress), and (b) the mobile
// hamburger/#mobile-menu controller behavior via jsdom.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { renderSiteNav, type SiteNavOptions } from '../src/lib/site-nav.js';

const fx = (n: string): string => readFileSync(join(process.cwd(), 'tests', 'fixtures', n), 'utf8');
const TR: SiteNavOptions = { active: 'track-record', trackRecordHref: '/track-record' };
const AC: SiteNavOptions = { active: 'account', trackRecordHref: 'https://algovault.com/track-record' };
const NAV_OPEN =
  '<nav class="fixed top-0 w-full z-50 border-b border-white/5" style="background:rgba(6,10,20,0.85);backdrop-filter:blur(12px)">';
const BRAND =
  '<a href="https://algovault.com/" class="flex items-center gap-2.5" aria-label="AlgoVault home">';

describe('renderSiteNav — desktop byte-equivalence (frozen oracle)', () => {
  it('/track-record desktop links container is byte-identical to the pre-extraction inline nav', () => {
    expect(renderSiteNav(TR)).toContain(fx('site-nav-desktop-track-record.html'));
  });
  it('/account desktop links container is byte-identical to the pre-extraction ACCOUNT_NAV_HTML', () => {
    expect(renderSiteNav(AC)).toContain(fx('site-nav-desktop-account.html'));
  });
  it('nav wrapper + brand block preserved verbatim on both surfaces', () => {
    for (const o of [TR, AC]) {
      expect(renderSiteNav(o)).toContain(NAV_OPEN);
      expect(renderSiteNav(o)).toContain(BRAND);
    }
  });
});

describe('renderSiteNav — mobile chrome present + per-page links', () => {
  it('carries the hamburger toggle + #mobile-menu panel + controller on both variants', () => {
    for (const o of [TR, AC]) {
      const html = renderSiteNav(o);
      expect(html).toContain('data-mobile-nav-toggle');
      expect(html).toContain('id="mobile-menu"');
      expect(html).toContain('data-mobile-nav-panel');
      expect(html).toContain('aria-controls="mobile-menu"');
      expect(html).toContain('mobile-nav-header controller');
      expect(html).toMatch(/w-11 h-11/); // ≥44px WCAG 2.5.5 touch target
      expect(html).toContain('bg-mint-500/15'); // Signup CTA reuses the mint accent
    }
  });
  it('mobile panel mirrors the page-specific Track Record href (relative vs cross-origin)', () => {
    expect(renderSiteNav(TR)).toMatch(/id="mobile-menu"[\s\S]*href="\/track-record"[\s\S]*Track Record/);
    expect(renderSiteNav(AC)).toMatch(
      /id="mobile-menu"[\s\S]*href="https:\/\/algovault\.com\/track-record"[\s\S]*Track Record/,
    );
  });
});

function mount(o: SiteNavOptions) {
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e: Error) => errors.push(e.message));
  const dom = new JSDOM(`<!doctype html><html><body>${renderSiteNav(o)}</body></html>`, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window: w } = dom;
  const d = w.document;
  const toggle = d.querySelector('[data-mobile-nav-toggle]') as HTMLElement;
  const panel = d.getElementById('mobile-menu') as HTMLElement;
  const click = (el: Element): void => {
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  };
  return { w, d, toggle, panel, errors, click, isOpen: () => !panel.classList.contains('hidden') };
}

describe('renderSiteNav — controller behavior (jsdom, both surfaces)', () => {
  for (const [name, o] of [['track-record', TR], ['account', AC]] as const) {
    it(`${name}: toggle opens/closes, syncs aria + icon, closes on Escape / outside / link`, () => {
      const { w, d, toggle, panel, errors, click, isOpen } = mount(o);
      const iconOpen = toggle.querySelector('[data-mobile-nav-icon-open]') as HTMLElement;
      const iconClose = toggle.querySelector('[data-mobile-nav-icon-close]') as HTMLElement;

      expect(isOpen()).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(iconOpen.classList.contains('hidden')).toBe(false);
      expect(iconClose.classList.contains('hidden')).toBe(true);

      click(toggle); // open
      expect(isOpen()).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Close menu');
      expect(iconOpen.classList.contains('hidden')).toBe(true);
      expect(iconClose.classList.contains('hidden')).toBe(false);

      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); // Escape closes
      expect(isOpen()).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      click(toggle);
      expect(isOpen()).toBe(true);
      click(d.body); // outside-nav click closes
      expect(isOpen()).toBe(false);

      click(toggle);
      expect(isOpen()).toBe(true);
      click(panel.querySelector('a') as Element); // panel-link click closes
      expect(isOpen()).toBe(false);

      expect(errors).toEqual([]);
    });
  }
});
