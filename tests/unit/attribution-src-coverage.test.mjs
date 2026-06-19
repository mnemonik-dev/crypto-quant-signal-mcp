/**
 * ATTRIBUTION-SRC-COVERAGE-W1 — gate the acquisition "untagged connect URL" class.
 *
 * Every in-repo MCP connection URL (JSON `"url":`, `mcp-remote`/`claude mcp add` CLI, the UI
 * paste line, the mcp-clients.ts string constants) must carry a non-empty `?src=<slug>` whose
 * slug is a member of ATTRIBUTION_SOURCES — otherwise that channel's connections bucket as
 * `unknown` in /api/admin/funnel-snapshot.by_source with no error. Run by the pre-push
 * test-gate (node --test) + deploy.yml. See scripts/check-attribution-src-coverage.mjs for
 * the scan scope + documented FP-exclusions (raw-curl diagnostic, bare-hostname prose,
 * smithery install-only page, out-of-scope README/manifests/rendered-HTML).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditAttributionSrcCoverage, loadEnumSlugs } from '../../scripts/check-attribution-src-coverage.mjs';

test('attribution `?src=` coverage — every in-repo connection URL is source-tagged (no silent `unknown` bucket)', () => {
  const { untagged, invalidSlug, scanned } = auditAttributionSrcCoverage();

  assert.ok(scanned > 0, 'expected ≥1 connection URL in scope; found 0 — did the scan scope move (SCAN_FILES / docs/integrations/mcp-clients/*.md)?');

  assert.equal(
    untagged.length,
    0,
    'Connection URLs missing a `?src=` slug (append `?src=<slug>` then re-render via ' +
      '`node scripts/render-integrations.mjs` or `npm run build:landing`):\n' +
      untagged.map((u) => `  ${u.file}: ${u.snippet}`).join('\n'),
  );

  assert.equal(
    invalidSlug.length,
    0,
    'Connection URLs whose `?src=` slug is NOT in src/lib/attribution-sources.ts ATTRIBUTION_SOURCES ' +
      '(would resolve `unknown` at runtime):\n' +
      invalidSlug.map((b) => `  ${b.file}: ?src=${b.slug}   ${b.snippet}`).join('\n'),
  );
});

test('enum extraction — ATTRIBUTION_SOURCES is read exhaustively from the SoT (not hard-coded)', () => {
  const slugs = loadEnumSlugs();
  assert.ok(slugs.size >= 10, `expected the full ATTRIBUTION_SOURCES enum (≥10 slugs); parsed ${slugs.size}`);
  // Spot-check the two slugs this wave depends on are present in the SoT.
  assert.ok(slugs.has('docs'), '`docs` slug missing from ATTRIBUTION_SOURCES');
  assert.ok(slugs.has('smithery'), '`smithery` slug missing from ATTRIBUTION_SOURCES');
});
