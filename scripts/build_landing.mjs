#!/usr/bin/env node
/**
 * build_landing.mjs — inject renderSignupFlowTailwind() output into
 * landing/docs.html between BUILD:signup-flow:start / :end markers.
 *
 * Single source of truth: src/lib/signup-flow.ts. Imported here from
 * the compiled dist/lib/signup-flow.js, so `npm run build` (tsc) MUST
 * run before this script. The npm `build:landing` script chains them.
 *
 * Usage:
 *   node scripts/build_landing.mjs           — write if drift, no-op if in-sync
 *   node scripts/build_landing.mjs --check   — exit 1 on drift, 0 if in-sync (CI guard)
 *
 * Idempotent canary: SHA256 hash of new vs current marker block. Equal => files=0.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const DOCS_HTML_PATH = path.join(REPO_ROOT, 'landing', 'docs.html');
const SIGNUP_FLOW_DIST = path.join(REPO_ROOT, 'dist', 'lib', 'signup-flow.js');

const MARKER_START = '<!-- BUILD:signup-flow:start -->';
const MARKER_END = '<!-- BUILD:signup-flow:end -->';

const checkMode = process.argv.includes('--check');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function main() {
  if (!fs.existsSync(SIGNUP_FLOW_DIST)) {
    console.error(`build_landing: ${SIGNUP_FLOW_DIST} not found. Run \`npm run build\` (tsc) first.`);
    process.exit(2);
  }
  if (!fs.existsSync(DOCS_HTML_PATH)) {
    console.error(`build_landing: ${DOCS_HTML_PATH} not found.`);
    process.exit(2);
  }

  const { renderSignupFlowTailwind } = await import(SIGNUP_FLOW_DIST);
  const newBlock = renderSignupFlowTailwind();

  const html = fs.readFileSync(DOCS_HTML_PATH, 'utf8');
  const startIdx = html.indexOf(MARKER_START);
  const endIdx = html.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error(`build_landing: missing/malformed markers in ${DOCS_HTML_PATH}.`);
    process.exit(2);
  }

  const before = html.slice(0, startIdx + MARKER_START.length);
  const after = html.slice(endIdx);
  const currentInner = html.slice(startIdx + MARKER_START.length, endIdx);
  const newInner = `\n${newBlock}\n      `;
  const updated = `${before}${newInner}${after}`;

  const inSync = sha256(currentInner) === sha256(newInner);

  if (checkMode) {
    if (inSync) {
      console.log('build_landing: in-sync (--check)');
      process.exit(0);
    } else {
      console.error('build_landing: DRIFT detected. landing/docs.html marker block does not match renderSignupFlowTailwind() output. Run `npm run build:landing` and commit.');
      process.exit(1);
    }
  }

  if (inSync) {
    console.log('build_landing: files=0 (idempotent canary green)');
    return;
  }

  fs.writeFileSync(DOCS_HTML_PATH, updated, 'utf8');
  console.log('build_landing: files=1 (landing/docs.html updated)');
}

main().catch((err) => {
  console.error('build_landing: fatal:', err);
  process.exit(2);
});
