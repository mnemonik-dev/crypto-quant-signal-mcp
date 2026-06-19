/**
 * OPS-CADDY-ROUTE-PARITY-W1 — gate the apex-Caddy "allowlist gap" 404 class.
 *
 * Every RELATIVE server-route reference on an apex-served landing page (href/src/action/fetch/
 * proxy URL constant) must resolve on algovault.com — either via a `handle … reverse_proxy`
 * in the apex Caddyfile block OR a static file. A ref that resolves to neither silently 404s
 * on algovault.com (works on api.algovault.com). Run by the pre-push test-gate (node --test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditApexRouteParity, handleMatches } from '../../scripts/check-caddy-route-parity.mjs';

test('apex Caddy route parity — every relative landing ref resolves on algovault.com (no silent 404s)', () => {
  const { unroutable } = auditApexRouteParity();
  assert.equal(
    unroutable.length,
    0,
    'Relative landing refs that would 404 on algovault.com (add a `handle <path>` to the ' +
      'algovault.com block in Caddyfile, OR make the ref absolute https://api.algovault.com<path>):\n' +
      unroutable.map((u) => `  ${u.path}   (landing/${u.source})`).join('\n'),
  );
});

test('handleMatches models Caddy path-matcher semantics (exact / /* / prefix)', () => {
  assert.equal(handleMatches('/track-record', '/track-record'), true);
  assert.equal(handleMatches('/track-record', '/track-record/x'), false); // exact, not prefix
  assert.equal(handleMatches('/integrations/*', '/integrations/binance'), true);
  assert.equal(handleMatches('/integrations/*', '/integrations'), true);
  assert.equal(handleMatches('/api/erc-8004-reputation', '/api/erc-8004-reputation'), true);
  assert.equal(handleMatches('/api/performance-public', '/api/erc-8004-reputation'), false);
});
