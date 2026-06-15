/**
 * GEO-CONTENT-W1 C1 — invariants canary for the answer/comparison pages (Build Rule 10).
 *
 * Network-free, runs over rendered-HTML fixtures (the committed landing/<slug>.html).
 * Globs the 8 answer-page slugs so C2/C3 pages auto-enter coverage as they ship.
 * Run via:  node --test tests/unit/geo_answer_page_invariants.test.mjs
 *
 * Asserts per page: question-form H1 with mint accent · answer-first lede ·
 * Article|TechArticle + FAQPage + Organization @id ref · aggregateRating/Review ABSENT ·
 * >=1 data-tr-field · no UPPER placeholder / SLOT leak · no prose signal(s) (identifiers
 * exempt) · >=2 internal cross-links · external links carry rel=noopener noreferrer ·
 * numeric-anchoring (inline-fix #1, replaces the absent numerical-fact-density canary):
 * metric-shaped numbers (%, comma-grouped, 4+ digit) must be inside data-tr-field spans.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANDING = path.resolve(__dirname, '..', '..', 'landing');

const ANSWER_SLUGS = [
  'best-mcp-servers-crypto-trading',
  'ai-agents-crypto-trade-calls',
  'build-crypto-trading-agent-python',
  'claude-crypto-trading-stack',
  'trade-calls-for-python-backtesting',
  'algovault-vs-raw-indicator-tools',
  'build-vs-buy-trading-model',
  'single-venue-vs-cross-venue-mcp',
  // GEO-CONTENT-W2 — 8 niche/knowledge answer pages (coverage list; existsSync below
  // gates which exist per chapter, so the full array is safe from C1 onward).
  'crewai-crypto-trade-call-tools',
  'langchain-crypto-trade-calls',
  'llamaindex-quant-trading-stack',
  'composite-cross-exchange-trade-calls',
  'cross-venue-funding-rate-arbitrage',
  'crypto-market-regime-detection-api',
  'crypto-signal-providers-verifiable-track-record',
  'crypto-trade-call-api-for-ai-agents',
];
const PAGES = ANSWER_SLUGS.filter((s) => existsSync(path.join(LANDING, s + '.html')));

const read = (slug) => readFileSync(path.join(LANDING, slug + '.html'), 'utf-8');

function jsonldBlocks(html) {
  const out = [];
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); } catch { out.push({ __parse_error: true }); }
  }
  return out;
}

// Visible prose: strip script/style/pre/code/comments + tags. Then strip known IDENTIFIER
// strings so the calls-not-signals check exempts them (Build Rule 5).
function prose(html, { stripTrSpans = false } = {}) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<code[\s\S]*?<\/code>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  if (stripTrSpans) h = h.replace(/<span[^>]*data-tr-field[^>]*>[\s\S]*?<\/span>/g, ' ');
  return h.replace(/<[^>]+>/g, ' ');
}

const IDENTIFIERS = /crypto-quant-signal-mcp|get_trade_signal|signal-performance|signal_performance|verify-signal/g;

// GEO-CONTENT-W2: two architect-approved query-echo exceptions — the buyer's literal
// measured-query category phrase, NEVER AlgoVault's own output (still "calls" everywhere).
// Slug-scoped + phrase-scoped: the global prose-"signal" check stays HARD on all other
// pages, and any OTHER stray "signal" on these two still fails (only the exact phrase strips).
const QUERY_ECHO_EXEMPT = {
  'crypto-signal-providers-verifiable-track-record': /\bsignal providers?\b/gi,
  'crypto-trade-call-api-for-ai-agents': /\bcrypto signal API\b/gi,
};

test('GEO-CONTENT-W1: at least one answer page present', () => {
  assert.ok(PAGES.length >= 1, 'no answer pages found under landing/');
});

for (const slug of PAGES) {
  test(`${slug}: question-form H1 with mint accent span`, () => {
    const m = read(slug).match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(m, 'no <h1>');
    assert.match(m[1], /\?/, 'H1 is not a question');
    assert.match(m[1], /<span[^>]*(?:#5BEEB3|text-mint)[^>]*>/i, 'H1 missing mint accent span on the final noun');
  });

  test(`${slug}: answer-first lede block`, () => {
    assert.match(read(slug), /class="lede"/, 'no .lede answer block');
  });

  test(`${slug}: allowed JSON-LD types; aggregateRating/Review absent`, () => {
    const html = read(slug);
    const blocks = jsonldBlocks(html);
    assert.ok(blocks.length >= 2, 'expected >=2 JSON-LD blocks (Article + FAQPage)');
    assert.ok(!blocks.some((b) => b.__parse_error), 'a JSON-LD block does not parse');
    const types = blocks.map((b) => b['@type']).filter(Boolean);
    assert.ok(types.includes('FAQPage'), 'no FAQPage JSON-LD');
    assert.ok(types.includes('Article') || types.includes('TechArticle'), 'no Article/TechArticle JSON-LD');
    assert.match(html, /"@id":\s*"https:\/\/algovault\.com\/#organization"/, 'no Organization @id reference');
    assert.equal((html.match(/aggregateRating/g) || []).length, 0, 'aggregateRating present (forbidden — spam risk)');
    assert.equal((html.match(/"Review"|claimReviewed/g) || []).length, 0, 'Review/claimReviewed present (forbidden)');
  });

  test(`${slug}: >=1 data-tr-field span`, () => {
    assert.ok((read(slug).match(/data-tr-field=/g) || []).length >= 1, 'no data-tr-field span');
  });

  test(`${slug}: no UPPER placeholder / SLOT leak`, () => {
    const html = read(slug);
    assert.equal((html.match(/<[A-Z_]{3,}>/g) || []).length, 0, 'UPPER placeholder leak');
    assert.doesNotMatch(html, /SLOT:/, 'unfilled SLOT marker leaked from template');
  });

  test(`${slug}: no prose "signal(s)" (identifiers + approved query-echo exempt)`, () => {
    let p = prose(read(slug)).replace(IDENTIFIERS, ' ');
    const echo = QUERY_ECHO_EXEMPT[slug];
    if (echo) p = p.replace(echo, ' ');
    const hits = p.match(/\bsignals?\b/gi) || [];
    assert.equal(hits.length, 0, `prose contains "signal(s)": ${hits.slice(0, 3).join(', ')}`);
  });

  test(`${slug}: >=2 internal cross-links`, () => {
    const n = (read(slug).match(/href="https:\/\/algovault\.com\/[a-z]/g) || []).length;
    assert.ok(n >= 2, `only ${n} internal cross-links (need >=2)`);
  });

  test(`${slug}: external target=_blank links carry rel=noopener noreferrer`, () => {
    const ext = read(slug).match(/<a [^>]*target="_blank"[^>]*>/g) || [];
    for (const a of ext) assert.match(a, /rel="noopener noreferrer"/, `external link missing rel: ${a.slice(0, 90)}`);
  });

  test(`${slug}: numeric-anchoring — metric-shaped numbers must be data-tr-field spans`, () => {
    // inline-fix #1 (numerical-fact-density canary absent). Strip code/script/style/comments
    // + the data-tr-field spans (anchored numbers OK), then forbid metric-shaped figures:
    // percentages, comma-grouped (1,234+), and 4+-digit runs. Fixed constants (100, 5, $9.99)
    // and years (20xx) are allowed.
    const p = prose(read(slug), { stripTrSpans: true });
    const metrics = (p.match(/\d+(?:\.\d+)?%|\d{1,3}(?:,\d{3})+|\d{4,}/g) || []).filter((n) => !/^20\d\d$/.test(n));
    assert.equal(metrics.length, 0, `unanchored metric-shaped number(s) in prose: ${metrics.slice(0, 5).join(', ')}`);
  });
}
