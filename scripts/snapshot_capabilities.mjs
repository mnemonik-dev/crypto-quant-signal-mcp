#!/usr/bin/env node
/**
 * snapshot_capabilities.mjs — AUTO-TRACE-W1
 *
 * Refreshes static-metadata capability counters across all surfaces that
 * cannot use the live `/api/performance-public` proxy (no JS context: HTML
 * meta tags, JSON-LD descriptions, plaintext docs, JSON manifest fields).
 *
 * SOURCE OF TRUTH for counts:
 *   - exchange_count, timeframe_count → src/lib/capabilities.ts (constants;
 *     imported from compiled dist after `npm run build`)
 *   - asset_count → live /api/performance-public when --live is passed,
 *     otherwise SNAPSHOT_ASSET_COUNT_FALLBACK below (curated). prepublishOnly
 *     should pass --live so freshly published tarballs carry the latest
 *     live count.
 *
 * Marker conventions:
 *   1) Inline `<!-- SNAPSHOT-LINE -->` (HTML/Markdown). Place at the END of
 *      the line that contains the counter literal(s) you want auto-managed.
 *      The script regex-rewrites `\b\d+ exchanges?\b`, `\b\d+\+ assets?\b`,
 *      `\b\d+ timeframes?\b` patterns ONLY on those marked lines. Other
 *      occurrences of those patterns elsewhere in the file are untouched.
 *
 *      Example:
 *        <meta name="description" content="...across 5 exchanges..."> <!-- SNAPSHOT-LINE -->
 *
 *   2) Plaintext-equivalent comment for .txt files: `# SNAPSHOT-LINE` at end
 *      of the line (works for .txt + .md too, but `<!--` style is preferred
 *      in Markdown for consistency with HTML).
 *
 *   3) JSON files (no comment syntax): the script reads + regex-rewrites the
 *      `.description` string value only. Other JSON fields are untouched.
 *      Manifest files declare what to update via the JSON_TARGETS list below.
 *
 * CI canary (tests/unit/copy-consistency.test.ts) excludes lines tagged
 * `SNAPSHOT-LINE` and excludes `description` strings inside listed JSON
 * targets, so the canary stays safe.
 *
 * Usage:
 *   node scripts/snapshot_capabilities.mjs            — write if drift, no-op if in-sync
 *   node scripts/snapshot_capabilities.mjs --check    — exit 1 on drift, 0 if in-sync (CI guard)
 *   node scripts/snapshot_capabilities.mjs --live     — fetch asset_count from live API
 *
 * Idempotent: SHA256 of new vs current per file. files=0 if no change.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CAPABILITIES_DIST = path.join(REPO_ROOT, 'dist', 'lib', 'capabilities.js');

// Curated fallback when --live is not passed. Refresh on each prepublishOnly
// run. Live source of truth: https://api.algovault.com/api/performance-public
// → .asset_count (or .byAsset key-count if the field is missing).
const SNAPSHOT_ASSET_COUNT_FALLBACK = 718;

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const liveMode = args.includes('--live');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function fetchLiveAssetCount() {
  try {
    const r = await fetch('https://api.algovault.com/api/performance-public', {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j.asset_count === 'number' && j.asset_count >= 100) {
      return j.asset_count;
    }
    if (j.byAsset && typeof j.byAsset === 'object') {
      const n = Object.keys(j.byAsset).length;
      if (n >= 100) return n;
    }
    throw new Error('asset_count missing/invalid in live response');
  } catch (err) {
    console.warn(
      `snapshot_capabilities: --live fetch failed (${err.message}), ` +
      `using fallback ${SNAPSHOT_ASSET_COUNT_FALLBACK}`,
    );
    return SNAPSHOT_ASSET_COUNT_FALLBACK;
  }
}

/**
 * Apply counter-literal regex rewrites to a single string. Mutates only
 * standalone integer-prefix-counter patterns; surrounding prose is preserved
 * verbatim.
 */
function rewriteCountersInString(s, valueMap, counter) {
  let next = s;
  next = next.replace(/\b(\d+)( exchanges?)\b/g, (_m, _d, suffix) => {
    counter.replacedCount += 1;
    return `${valueMap.exchange_count}${suffix}`;
  });
  // FLOOR counter is monotonic-grow: never downgrade a published count already
  // at/above the floor (e.g. live-sourced 740+ must NOT regress to the conservative
  // fallback floor 710+). Only rewrite UP. (CLAUDE.md Data Integrity — FLOOR fires on
  // SoT regression, it does not auto-reduce public counts.)
  next = next.replace(/\b(\d+)\+( assets?)\b/g, (_m, d, suffix) => {
    const kept = Math.max(Number(d), Number(valueMap.asset_count_floored));
    if (kept !== Number(d)) counter.replacedCount += 1;
    return `${kept}+${suffix}`;
  });
  next = next.replace(/\b(\d+)( timeframes?)\b/g, (_m, _d, suffix) => {
    counter.replacedCount += 1;
    return `${valueMap.timeframe_count}${suffix}`;
  });
  return next;
}

/**
 * Markdown tier-comparison-table mode. On lines explicitly tagged
 * `SNAPSHOT-LINE-TABLE`, rewrite naked-integer cell patterns:
 *   "| Exchanges | All 5 | ..."   → updates each `All 5` → `All ${EXCHANGE_COUNT}`
 *   "| Assets | All 716+ | ..."   → updates each `All 716+` → `All ${ASSET_COUNT_FLOORED}+`
 *   "| Timeframes | All 11 | ..." → updates each `All 11` → `All ${TIMEFRAME_COUNT}`
 *
 * Triggered ONLY by a per-line `SNAPSHOT-LINE-TABLE` HTML comment marker so
 * we don't false-positive against prose like "All 5 of these factors..."
 * elsewhere. The marker maps to one of three counter targets via the row's
 * leading label cell.
 */
function rewriteTableCells(content, valueMap, counter) {
  const TABLE_MARK = /<!--\s*SNAPSHOT-LINE-TABLE\s*-->/;
  const lines = content.split('\n');
  let markerCount = 0;
  const out = lines.map((line) => {
    if (!TABLE_MARK.test(line)) return line;
    markerCount += 1;
    let next = line;
    // Use lookahead `(?=\s*\|)` for the trailing pipe so the regex engine
    // doesn't consume it — otherwise adjacent cells in the same row are
    // skipped on every other match.
    if (/\|\s*Exchanges?\s*\|/i.test(line)) {
      next = next.replace(/(\|\s*All\s+)(\d+)(?=\s*\|)/g, (_m, p1) => {
        counter.replacedCount += 1;
        return `${p1}${valueMap.exchange_count}`;
      });
    } else if (/\|\s*Assets?\s*\|/i.test(line)) {
      // Monotonic FLOOR: keep the higher of published vs floor (never downgrade).
      next = next.replace(/(\|\s*All\s+)(\d+)\+(?=\s*\|)/g, (_m, p1, d) => {
        const kept = Math.max(Number(d), Number(valueMap.asset_count_floored));
        if (kept !== Number(d)) counter.replacedCount += 1;
        return `${p1}${kept}+`;
      });
    } else if (/\|\s*Timeframes?\s*\|/i.test(line)) {
      next = next.replace(/(\|\s*All\s+)(\d+)(?=\s*\|)/g, (_m, p1) => {
        counter.replacedCount += 1;
        return `${p1}${valueMap.timeframe_count}`;
      });
    }
    return next;
  });
  return { content: out.join('\n'), markerCount };
}

/**
 * For inline JSON-LD blocks (`<script type="application/ld+json">...</script>`)
 * inside HTML files: rewrite counter literals inside `description` and `text`
 * string values only. JSON-LD blocks cannot use HTML comments because the
 * script content must be valid JSON — so we treat JSON-LD as a structured
 * region and rewrite specific keys.
 */
function rewriteJsonLdBlocks(content, valueMap, counter) {
  const blockRe = /(<script\s+type=["']application\/ld\+json["']\s*>)([\s\S]*?)(<\/script>)/g;
  return content.replace(blockRe, (_full, open, body, close) => {
    let nextBody = body;
    // Match string values for `description` or `text` keys. Single-line only
    // (consistent with the current source convention).
    const keyRe = /("(?:description|text)"\s*:\s*")([^"\n]*)(")/g;
    nextBody = nextBody.replace(keyRe, (_m, prefix, val, suffix) => {
      const rewritten = rewriteCountersInString(val, valueMap, counter);
      return `${prefix}${rewritten}${suffix}`;
    });
    return `${open}${nextBody}${close}`;
  });
}

/**
 * For HTML / Markdown / plaintext: rewrite counter literals on lines that
 * carry the `SNAPSHOT-LINE` marker. Returns { content, replacedCount,
 * markerCount }.
 */
function rewriteMarkedLines(content, valueMap) {
  const SNAPSHOT_MARK = /(<!--\s*SNAPSHOT-LINE\s*-->|#\s*SNAPSHOT-LINE\b)/;
  const lines = content.split('\n');
  let markerCount = 0;
  const counter = { replacedCount: 0 };
  const out = lines.map((line) => {
    if (!SNAPSHOT_MARK.test(line)) return line;
    markerCount += 1;
    return rewriteCountersInString(line, valueMap, counter);
  });
  return { content: out.join('\n'), replacedCount: counter.replacedCount, markerCount };
}

/**
 * For JSON files: rewrite counter literals inside the `description` string
 * value only. We do NOT JSON.parse + re-stringify (that loses comments-style
 * formatting and key ordering on some serializers); instead we regex-extract
 * the description line, rewrite it, and substitute back. Single-line
 * descriptions only — matches existing manifest.json / server.json layout.
 */
function rewriteJsonDescription(content, valueMap) {
  const counter = { replacedCount: 0 };
  const re = /("description"\s*:\s*")([^"\n]*)(")/;
  const next = content.replace(re, (_m, prefix, body, suffix) => {
    const rewritten = rewriteCountersInString(body, valueMap, counter);
    return `${prefix}${rewritten}${suffix}`;
  });
  return { content: next, replacedCount: counter.replacedCount };
}

const HTML_LIKE_TARGETS = [
  'README.md',
  'landing/index.html',
  'landing/llms.txt',
  'landing/llms-full.txt',
];

const JSON_TARGETS = [
  'manifest.json',
  'server.json',
];

async function main() {
  if (!fs.existsSync(CAPABILITIES_DIST)) {
    console.error(`snapshot_capabilities: ${CAPABILITIES_DIST} not found. Run \`npm run build\` (tsc) first.`);
    process.exit(2);
  }

  const { EXCHANGE_COUNT, TIMEFRAME_COUNT, floorRoundTo10 } = await import(CAPABILITIES_DIST);
  const liveAssetCount = liveMode ? await fetchLiveAssetCount() : SNAPSHOT_ASSET_COUNT_FALLBACK;
  const flooredAssets = floorRoundTo10(liveAssetCount);

  const valueMap = {
    asset_count_floored: String(flooredAssets),
    exchange_count: String(EXCHANGE_COUNT),
    timeframe_count: String(TIMEFRAME_COUNT),
  };

  console.log(
    `snapshot_capabilities: source=${liveMode ? 'live API' : 'fallback'} ` +
    `asset_count=${liveAssetCount}→floor10=${flooredAssets}+ ` +
    `exchange_count=${EXCHANGE_COUNT} timeframe_count=${TIMEFRAME_COUNT}`,
  );

  const driftFiles = [];
  let totalReplacements = 0;
  let totalMarkers = 0;

  for (const rel of HTML_LIKE_TARGETS) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`snapshot_capabilities: skipping missing target ${rel}`);
      continue;
    }
    const before = fs.readFileSync(abs, 'utf8');
    // Stage 1: rewrite SNAPSHOT-LINE marked lines (HTML body, plaintext).
    const stage1 = rewriteMarkedLines(before, valueMap);
    // Stage 2: rewrite inline JSON-LD `description`/`text` keys inside any
    // `<script type="application/ld+json">` blocks (no markers — JSON has no
    // comment syntax). Only applies to HTML files; .md / .txt have no script
    // tags so the regex no-ops.
    const jsonLdCounter = { replacedCount: 0 };
    const stage2 = rewriteJsonLdBlocks(stage1.content, valueMap, jsonLdCounter);
    // Stage 3: rewrite SNAPSHOT-LINE-TABLE marked rows in markdown tier-
    // comparison tables (naked-integer cells `| All <N> |`).
    const tableCounter = { replacedCount: 0 };
    const stage3 = rewriteTableCells(stage2, valueMap, tableCounter);
    const after = stage3.content;
    const replacedCount = stage1.replacedCount + jsonLdCounter.replacedCount + tableCounter.replacedCount;
    totalReplacements += replacedCount;
    totalMarkers += stage1.markerCount + stage3.markerCount;
    if (sha256(before) !== sha256(after)) {
      driftFiles.push(rel);
      if (!checkMode) fs.writeFileSync(abs, after, 'utf8');
    }
  }

  for (const rel of JSON_TARGETS) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`snapshot_capabilities: skipping missing target ${rel}`);
      continue;
    }
    const before = fs.readFileSync(abs, 'utf8');
    const { content: after, replacedCount } = rewriteJsonDescription(before, valueMap);
    totalReplacements += replacedCount;
    if (sha256(before) !== sha256(after)) {
      driftFiles.push(rel);
      if (!checkMode) fs.writeFileSync(abs, after, 'utf8');
    }
  }

  if (totalMarkers === 0) {
    console.warn(
      'snapshot_capabilities: WARNING — zero `SNAPSHOT-LINE` markers found in HTML-like targets. ' +
      'Class B surfaces have no markers; future onboardings will not auto-update them.',
    );
  }

  if (checkMode) {
    if (driftFiles.length === 0) {
      console.log(
        `snapshot_capabilities: in-sync (--check) — ` +
        `${totalMarkers} marked lines + ${JSON_TARGETS.length} JSON descriptions checked, ` +
        `${totalReplacements} counter literals validated`,
      );
      process.exit(0);
    } else {
      console.error(
        `snapshot_capabilities: DRIFT detected in ${driftFiles.length} file(s): ` +
        `[${driftFiles.join(', ')}]. Run \`npm run snapshot:capabilities\` and commit.`,
      );
      process.exit(1);
    }
  }

  if (driftFiles.length === 0) {
    console.log(
      `snapshot_capabilities: files=0 (idempotent canary green; ` +
      `${totalMarkers} marked lines × ${totalReplacements} counter literals)`,
    );
  } else {
    console.log(`snapshot_capabilities: files=${driftFiles.length} (updated: ${driftFiles.join(', ')})`);
  }
}

main().catch((err) => {
  console.error('snapshot_capabilities: fatal:', err);
  process.exit(2);
});
