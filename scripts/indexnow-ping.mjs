#!/usr/bin/env node
/**
 * scripts/indexnow-ping.mjs — AI-CRAWLER-ACCESS-W2 R3
 *
 * Submits the current sitemap URL set to IndexNow on each Hetzner deploy.
 * IndexNow feeds Bing + Yandex + Seznam + others → the ChatGPT / Perplexity
 * retrieval substrate (Google ignores IndexNow). This is the forced-re-crawl
 * trigger that flushes the stale parking-page snapshot the W1 audit found.
 *
 * FAIL-OPEN by contract: this script never throws to the shell and never exits
 * non-zero — a wobbly IndexNow endpoint must NOT break a deploy.
 *
 * Key ownership: a `landing/<32-hex>.txt` file (content == the key) is served at
 * https://algovault.com/<key>.txt via the existing `cp landing/*.txt` deploy glob;
 * IndexNow fetches it to verify ownership. Single source of truth — the key is
 * read from that file, never duplicated.
 *
 * Env:
 *   DRY_RUN_INDEXNOW=1 → build + log the payload, skip the network POST.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LANDING = join(REPO_ROOT, 'landing');
const DEFAULT_HOST = 'algovault.com';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const TIMEOUT_MS = 10_000;
const KEY_FILE_RE = /^[0-9a-f]{32}\.txt$/;

function log(msg) {
  console.log(`[indexnow] ${msg}`);
}

/**
 * Pure-ish builder (reads the filesystem, no network). Returns the IndexNow
 * submission payload, or null if prerequisites are missing (caller fail-opens).
 * @param {{ landingDir?: string, host?: string }} [opts]
 * @returns {{ host: string, key: string, keyLocation: string, urlList: string[] } | null}
 */
export function buildIndexNowPayload(opts = {}) {
  const landingDir = opts.landingDir || DEFAULT_LANDING;
  const host = opts.host || DEFAULT_HOST;

  let keyFile;
  try {
    keyFile = readdirSync(landingDir).find((f) => KEY_FILE_RE.test(f));
  } catch {
    return null;
  }
  if (!keyFile) return null;

  const key = readFileSync(join(landingDir, keyFile), 'utf8').trim();
  if (!key) return null;
  const keyLocation = `https://${host}/${keyFile}`;

  let xml;
  try {
    xml = readFileSync(join(landingDir, 'sitemap.xml'), 'utf8');
  } catch {
    return null;
  }
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (!urlList.length) return null;

  return { host, key, keyLocation, urlList };
}

async function submit(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    // 200/202 = accepted; 4xx = key/format issue. Log, never throw.
    log(`POST ${res.status} ${res.statusText} (${payload.urlList.length} URLs)`);
  } catch (err) {
    log(`POST failed (fail-open): ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const dryRun = process.env.DRY_RUN_INDEXNOW === '1';
  const payload = buildIndexNowPayload();
  if (!payload) {
    log('prerequisites missing (no key file / empty sitemap) — skipping (fail-open)');
    return;
  }
  log(`${payload.urlList.length} URLs · key=${payload.key.slice(0, 8)}… · keyLocation=${payload.keyLocation}`);
  if (dryRun) {
    log(`DRY_RUN — would POST to ${ENDPOINT}`);
    log(`payload: ${JSON.stringify(payload).slice(0, 320)}…`);
    return;
  }
  await submit(payload);
}

// Run main only when invoked directly (not when imported by a test).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main()
    .catch((err) => log(`unexpected (fail-open): ${err?.message || err}`))
    .finally(() => {
      process.exitCode = 0; // never signal failure to the deploy shell
    });
}
