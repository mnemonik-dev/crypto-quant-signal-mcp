#!/usr/bin/env node
/**
 * OPS-CADDY-ROUTE-PARITY-W1 — guard against the apex-Caddy "allowlist gap" 404 class.
 *
 * The apex `algovault.com {}` Caddy block proxies a HAND-MAINTAINED allowlist of routes to
 * the MCP server (`reverse_proxy localhost:3000`); everything else falls through to the
 * static `file_server`. A landing page (served static by the apex) that references a
 * RELATIVE server route which is NOT in the allowlist AND not a static file silently 404s
 * on algovault.com — even though api.algovault.com (which proxies everything) works. This
 * has bitten `/api/recent-calls` (Caddyfile comment), the footer `/signup`, and
 * `/api/erc-8004-reputation`. This audit fails CI when any relative ref would 404 on the apex.
 *
 *   node scripts/check-caddy-route-parity.mjs --check   # exit 1 on any unroutable ref
 *
 * tests/unit/caddy-route-parity.test.mjs imports `auditApexRouteParity()` so the pre-push
 * test-gate (node --test) blocks a push that introduces a gap. NOT a runtime dependency.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Proxied `handle /PATH { ... reverse_proxy ... }` patterns in the apex `algovault.com {}` block. */
export function apexProxyHandles(caddyfile) {
  // The apex block's closing brace is at column 0 (`\n}`); nested handle braces are indented,
  // so the non-greedy match stops at the block close, not the first handle. `(^|\n)` anchors to
  // a line start so `api.algovault.com` (preceded by `.`) is NOT matched.
  const m = caddyfile.match(/(?:^|\n)algovault\.com\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('apex `algovault.com {}` block not found in Caddyfile');
  const block = m[1];
  const handles = [];
  for (const h of block.matchAll(/handle\s+(\/\S+)\s*\{([\s\S]*?)\}/g)) {
    if (/reverse_proxy/.test(h[2])) handles.push(h[1]);
  }
  return handles;
}

/** Caddy path-matcher semantics: `/foo` exact; `/foo/*` subpaths; `/foo*` prefix. */
export function handleMatches(pattern, path) {
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return path === base || path.startsWith(base + '/');
  }
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

/** Files served by the apex static file_server (root = landing/). */
function staticFileSet() {
  const files = new Set();
  (function walk(dir, rel) {
    for (const ent of readdirSync(dir)) {
      const abs = join(dir, ent);
      const r = rel ? rel + '/' + ent : ent;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else files.add('/' + r);
    }
  })(join(ROOT, 'landing'), '');
  return files;
}

/** Mirror the apex `try_files {path} {path}.html {path}/index.html`. */
function resolvesStatic(path, files) {
  const p = path.replace(/\/$/, '');
  return files.has(path) || files.has(p + '.html') || files.has(p + '/index.html');
}

/** ACTUAL relative refs (not doc examples / absolutes / fragments) in the apex-served pages + their JS. */
export function relativeRefs() {
  const landingDir = join(ROOT, 'landing');
  const sources = readdirSync(landingDir).filter((f) => f.endsWith('.html'));
  const jsDir = join(landingDir, 'js');
  if (existsSync(jsDir)) for (const f of readdirSync(jsDir)) if (f.endsWith('.js')) sources.push('js/' + f);

  const refs = [];
  const add = (raw, src) => {
    if (!raw || !raw.startsWith('/')) return; // page-relative only
    const clean = raw.split(/[?#]/)[0];
    if (clean === '/' || clean === '') return;
    // Skip non-.html static ASSETS (png/css/js/svg/ico/json/txt/...): the file_server serves
    // them, so asset existence is a separate concern from the route-gap class this audit
    // targets. Extensionless server routes + .html static pages ARE checked.
    const ext = clean.match(/\.([a-z0-9]+)$/i);
    if (ext && ext[1].toLowerCase() !== 'html') return;
    refs.push({ path: clean, source: src });
  };
  for (const rel of sources) {
    const txt = readFileSync(join(landingDir, rel), 'utf8');
    for (const m of txt.matchAll(/(?:href|src|action)\s*=\s*["'](\/[^"'#][^"']*)["']/g)) add(m[1], rel);
    for (const m of txt.matchAll(/fetch\(\s*["'](\/[^"']+)["']/g)) add(m[1], rel);
    // JS URL constants the proxy fetches via a variable, e.g. `var ERC8004_URL = '/api/...'`.
    for (const m of txt.matchAll(/=\s*["'](\/api\/[^"']+)["']/g)) add(m[1], rel);
  }
  return refs;
}

/** Returns { unroutable: [{path, source}], handleCount, refCount } — empty unroutable = parity OK. */
export function auditApexRouteParity() {
  const handles = apexProxyHandles(readFileSync(join(ROOT, 'Caddyfile'), 'utf8'));
  const files = staticFileSet();
  const seen = new Set();
  const unroutable = [];
  const refs = relativeRefs();
  for (const { path, source } of refs) {
    if (seen.has(path)) continue;
    if (handles.some((h) => handleMatches(h, path))) continue; // proxied to MCP
    if (resolvesStatic(path, files)) continue; // static file_server
    seen.add(path);
    unroutable.push({ path, source }); // → would 404 on algovault.com
  }
  return { unroutable, handleCount: handles.length, refCount: refs.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { unroutable, handleCount, refCount } = auditApexRouteParity();
  if (unroutable.length === 0) {
    console.log(`[caddy-route-parity] OK — ${refCount} relative refs resolve on the apex (${handleCount} proxied handles + static files).`);
    process.exit(0);
  }
  console.error(`[caddy-route-parity] FAIL — ${unroutable.length} relative ref(s) would 404 on algovault.com (no apex Caddy handle + no static file):`);
  for (const u of unroutable) console.error(`  ${u.path}   (in landing/${u.source})`);
  console.error(`\nFix one of: add \`handle <path> { reverse_proxy localhost:3000 }\` to the algovault.com block in Caddyfile;`);
  console.error(`  OR make the reference absolute (https://api.algovault.com<path>); OR add the static file under landing/.`);
  process.exit(1);
}
