/**
 * FOOTER-UNIFY-W1 — footer-drift CI canary.
 *
 * Makes the 7→1 collapse structurally permanent: the brand footer markup lives in exactly
 * ONE place (src/lib/footer-content.ts renderBrandFooter), and the 4-place hand-sync that
 * PH-BADGE-COMPACT-W1 suffered cannot re-emerge. Pairs with `node scripts/inject-footer.mjs
 * --check` (asserts the committed static brand files match the SoT).
 *
 * Run: node --test tests/unit/footer-unify-canary.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const count = (hay, needle) => hay.split(needle).length - 1;

// The distinctive brand-footer style literal. After unification it is PARAMETERIZED inside
// the SoT (background:${BRAND_FOOTER_BG_SIGNATURE}), so it must appear as a verbatim literal
// in ZERO source files — any re-appearance = a re-inlined footer (drift).
const FOOTER_STYLE_LITERAL = 'border-top:1px solid var(--line);background:oklch(0.13 0.012 265);display:flex';

const SOURCE_CONSUMERS = [
  'src/index.ts',
  'src/lib/account-handlers.ts',
  'scripts/render-jsx-static.mjs',
  'scripts/render-integrations.mjs',
];

const STATIC_BRAND_SURFACES = [
  { file: 'landing/index.html', minMarkers: 2 },      // apex dual-render
  { file: 'landing/how-it-works.html', minMarkers: 2 }, // dual-render
  { file: 'landing/integrations/binance.html', minMarkers: 1 },
  { file: 'landing/integrations/okx.html', minMarkers: 1 },
  { file: 'landing/integrations/bybit.html', minMarkers: 1 },
  { file: 'landing/integrations/bitget.html', minMarkers: 1 },
];

// Intentionally-different footer TYPES (Mr.1 ruling Q2=A) — must NOT carry the brand marker.
const NON_BRAND_SURFACES = ['landing/faq.html', 'landing/glossary.html', 'landing/skills.html'];

test('no inline brand-footer style literal survives outside the SoT', async () => {
  for (const f of SOURCE_CONSUMERS) {
    const src = await read(f);
    assert.strictEqual(count(src, FOOTER_STYLE_LITERAL), 0,
      `${f} contains an inline brand-footer literal — it must render from renderBrandFooter() instead`);
  }
});

test('the Follow badge (follow.svg) is defined exactly once, in the SoT', async () => {
  const sot = await read('src/lib/footer-content.ts');
  assert.strictEqual(count(sot, 'follow.svg'), 1, 'SoT must define the Follow badge exactly once');
  for (const f of SOURCE_CONSUMERS) {
    assert.strictEqual(count(await read(f), 'follow.svg'), 0, `${f} must not contain its own follow.svg badge copy`);
  }
});

test('the retired footer identifiers no longer define footers', async () => {
  const acct = await read('src/lib/account-handlers.ts');
  assert.strictEqual(count(acct, 'const ACCOUNT_FOOTER_HTML ='), 0, 'ACCOUNT_FOOTER_HTML literal must be retired');
  const rjs = await read('scripts/render-jsx-static.mjs');
  assert.strictEqual(count(rjs, 'function injectFooterBadge'), 0, 'injectFooterBadge() must be retired');
  assert.ok(rjs.includes("renderBrandFooter(mobile ? 'mobile' : 'desktop')"),
    'render-jsx-static must render the apex footer from the SoT');
  const rint = await read('scripts/render-integrations.mjs');
  assert.ok(rint.includes("renderBrandFooter('desktop')"), 'render-integrations must render the footer from the SoT');
});

test('every static BRAND surface renders the shared-footer marker', async () => {
  for (const { file, minMarkers } of STATIC_BRAND_SURFACES) {
    const html = await read(file);
    assert.ok(count(html, 'data-av-brand-footer') >= minMarkers,
      `${file} must carry ≥${minMarkers} data-av-brand-footer marker(s)`);
    assert.ok(count(html, 'follow.svg') >= minMarkers, `${file} must render the Follow badge`);
  }
});

test('non-brand footer types (faq/glossary/skills) are left untouched — no brand marker', async () => {
  for (const f of NON_BRAND_SURFACES) {
    const html = await read(f);
    assert.strictEqual(count(html, 'data-av-brand-footer'), 0,
      `${f} is a different footer TYPE (Q2=A) and must NOT carry the brand-footer marker`);
  }
});
