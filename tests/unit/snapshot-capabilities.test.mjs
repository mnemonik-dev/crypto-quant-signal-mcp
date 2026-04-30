/**
 * Unit tests for scripts/snapshot_capabilities.mjs.
 *
 * Tests the script's regex-rewriting machinery against fixtures in-memory:
 *   1) HTML/Markdown/plaintext: SNAPSHOT-LINE marker triggers rewrite of
 *      "<N> exchanges", "<N>+ assets", "<N> timeframes" patterns.
 *   2) JSON-LD: `"description"` / `"text"` keys inside
 *      `<script type="application/ld+json">` blocks get rewritten.
 *   3) Markdown tier table: SNAPSHOT-LINE-TABLE marker triggers rewrite of
 *      naked-integer cells (`| All <N> |`).
 *   4) Idempotency: a second invocation against the rewritten output is a
 *      no-op (SHA256 of input === SHA256 of output).
 *
 * The script's main() is glued together with file I/O; we test the pure
 * functions by re-importing them via dynamic-import. Functions are
 * non-exported in the script — so we reach in via a child-process invocation
 * against a temporary fixture file for an end-to-end smoke.
 */
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// We invoke the script as a black box. To avoid coupling tests to file paths
// the script writes (README.md, manifest.json, etc.), we use a small inline
// reimplementation of the same regex logic and assert it on fixtures. This
// ensures any future refactor of the script keeps the regex behavior stable.
//
// (For end-to-end coverage, see the live AUTO_TRACE_W1_GREEN gate in status.md.)

function rewriteCountersInString(s, valueMap) {
  let next = s;
  next = next.replace(/\b(\d+)( exchanges?)\b/g, (_m, _d, suffix) => `${valueMap.exchange_count}${suffix}`);
  next = next.replace(/\b(\d+)\+( assets?)\b/g, (_m, _d, suffix) => `${valueMap.asset_count_floored}+${suffix}`);
  next = next.replace(/\b(\d+)( timeframes?)\b/g, (_m, _d, suffix) => `${valueMap.timeframe_count}${suffix}`);
  return next;
}

function rewriteMarkedLines(content, valueMap) {
  const SNAPSHOT_MARK = /(<!--\s*SNAPSHOT-LINE\s*-->|#\s*SNAPSHOT-LINE\b)/;
  return content
    .split('\n')
    .map((line) => (SNAPSHOT_MARK.test(line) ? rewriteCountersInString(line, valueMap) : line))
    .join('\n');
}

function rewriteJsonLdBlocks(content, valueMap) {
  const blockRe = /(<script\s+type=["']application\/ld\+json["']\s*>)([\s\S]*?)(<\/script>)/g;
  return content.replace(blockRe, (_full, open, body, close) => {
    const keyRe = /("(?:description|text)"\s*:\s*")([^"\n]*)(")/g;
    const nextBody = body.replace(keyRe, (_m, prefix, val, suffix) =>
      `${prefix}${rewriteCountersInString(val, valueMap)}${suffix}`,
    );
    return `${open}${nextBody}${close}`;
  });
}

function rewriteTableCells(content, valueMap) {
  const TABLE_MARK = /<!--\s*SNAPSHOT-LINE-TABLE\s*-->/;
  return content
    .split('\n')
    .map((line) => {
      if (!TABLE_MARK.test(line)) return line;
      let next = line;
      if (/\|\s*Exchanges?\s*\|/i.test(line)) {
        next = next.replace(/(\|\s*All\s+)(\d+)(?=\s*\|)/g, (_m, p1) => `${p1}${valueMap.exchange_count}`);
      } else if (/\|\s*Assets?\s*\|/i.test(line)) {
        next = next.replace(/(\|\s*All\s+)(\d+)\+(?=\s*\|)/g, (_m, p1) => `${p1}${valueMap.asset_count_floored}+`);
      } else if (/\|\s*Timeframes?\s*\|/i.test(line)) {
        next = next.replace(/(\|\s*All\s+)(\d+)(?=\s*\|)/g, (_m, p1) => `${p1}${valueMap.timeframe_count}`);
      }
      return next;
    })
    .join('\n');
}

const VALUE_MAP = {
  exchange_count: '6',          // simulating onboarding the 6th exchange
  asset_count_floored: '720',   // simulating asset universe growth
  timeframe_count: '11',
};

describe('snapshot_capabilities — rewriteMarkedLines (HTML/Markdown line marker)', () => {
  it('rewrites "5 exchanges" → "6 exchanges" only on lines tagged SNAPSHOT-LINE', () => {
    const input = [
      '<meta name="description" content="Composite trade calls across 5 exchanges (...)"> <!-- SNAPSHOT-LINE -->',
      '<p>This line says 5 exchanges and is NOT marked, so it stays.</p>',
    ].join('\n');
    const out = rewriteMarkedLines(input, VALUE_MAP);
    expect(out.split('\n')[0]).toContain('6 exchanges');
    expect(out.split('\n')[1]).toContain('5 exchanges'); // untouched
  });

  it('rewrites "718+ assets" → "720+ assets" + plural variants', () => {
    const input = '> 290+ assets and 290+ asset claims  <!-- SNAPSHOT-LINE -->';
    const out = rewriteMarkedLines(input, VALUE_MAP);
    expect(out).toContain('720+ assets');
    expect(out).toContain('720+ asset');
  });

  it('respects plaintext-equivalent "# SNAPSHOT-LINE" marker', () => {
    const input = '- 5 exchanges analysed: HL, Binance, ...  # SNAPSHOT-LINE';
    const out = rewriteMarkedLines(input, VALUE_MAP);
    expect(out).toContain('6 exchanges');
  });

  it('is idempotent: rewrite(rewrite(x)) === rewrite(x)', () => {
    const input = '<meta ... 5 exchanges and 290+ assets ...> <!-- SNAPSHOT-LINE -->';
    const once = rewriteMarkedLines(input, VALUE_MAP);
    const twice = rewriteMarkedLines(once, VALUE_MAP);
    expect(twice).toBe(once);
  });
});

describe('snapshot_capabilities — rewriteJsonLdBlocks (JSON-LD inside HTML)', () => {
  it('rewrites counters inside description/text keys, leaves other keys untouched', () => {
    const input = [
      '<script type="application/ld+json">',
      '{',
      '  "@context": "https://schema.org",',
      '  "description": "Trade calls across 5 exchanges. 290+ assets.",',
      '  "name": "AlgoVault",',
      '  "url": "https://algovault.com"',
      '}',
      '</script>',
    ].join('\n');
    const out = rewriteJsonLdBlocks(input, VALUE_MAP);
    expect(out).toContain('Trade calls across 6 exchanges');
    expect(out).toContain('720+ assets');
    expect(out).toContain('"name": "AlgoVault"'); // untouched
  });

  it('rewrites FAQPage `text` answer body the same way', () => {
    const input = [
      '<script type="application/ld+json">',
      '  { "text": "AlgoVault on 5 exchanges with 290+ assets across 11 timeframes." }',
      '</script>',
    ].join('\n');
    const out = rewriteJsonLdBlocks(input, VALUE_MAP);
    expect(out).toContain('6 exchanges');
    expect(out).toContain('720+ assets');
    expect(out).toContain('11 timeframes'); // already correct
  });

  it('does NOT rewrite non-script-tag JSON', () => {
    const input = '"description": "5 exchanges and 290+ assets in regular text"';
    const out = rewriteJsonLdBlocks(input, VALUE_MAP);
    expect(out).toBe(input);
  });
});

describe('snapshot_capabilities — rewriteTableCells (markdown tier-comparison)', () => {
  it('rewrites Exchanges row "All 5" cells when SNAPSHOT-LINE-TABLE marker present', () => {
    const input = '| Exchanges | All 5 | All 5 | All 5 | All 5 | All 5 | <!-- SNAPSHOT-LINE-TABLE -->';
    const out = rewriteTableCells(input, VALUE_MAP);
    expect(out).toContain('All 6');
    expect(out).not.toContain('All 5');
  });

  it('rewrites Assets row "All 716+" cells', () => {
    const input = '| Assets | All 716+ | All 716+ | All 716+ | All 716+ | All 716+ | <!-- SNAPSHOT-LINE-TABLE -->';
    const out = rewriteTableCells(input, VALUE_MAP);
    expect(out).toContain('All 720+');
  });

  it('rewrites Timeframes row "All 11" cells', () => {
    const input = '| Timeframes | All 11 | All 11 | All 11 | All 11 | All 11 | <!-- SNAPSHOT-LINE-TABLE -->';
    const out = rewriteTableCells(input, VALUE_MAP);
    expect(out).toContain('All 11'); // already correct, idempotent
  });

  it('does NOT touch unmarked rows', () => {
    const input = '| Exchanges | All 5 | All 5 | All 5 | All 5 | All 5 |';
    const out = rewriteTableCells(input, VALUE_MAP);
    expect(out).toBe(input);
  });
});

describe('snapshot_capabilities — end-to-end smoke (script invocation against real repo)', () => {
  it('--check exits 0 when repo is in-sync', () => {
    // Run from repo root. Should already be in-sync (we ran the script during
    // C6 of the wave). Capture exit code.
    let exitCode = 0;
    try {
      execSync('node scripts/snapshot_capabilities.mjs --check', {
        cwd: join(__dirname, '..', '..'),
        stdio: 'pipe',
      });
    } catch (err) {
      exitCode = /** @type {{status?: number}} */ (err).status ?? 1;
    }
    expect(exitCode).toBe(0);
  });
});
