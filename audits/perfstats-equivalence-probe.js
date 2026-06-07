#!/usr/bin/env node
// OPS-PERFSTATS-SQL-PUSHDOWN-W1 CH2 — live byte-equivalence probe.
//
// Runs IN the MCP container against the prod DB. Compares the OLD scan path
// (loadSignalsForStats + computeStats) vs the NEW SQL path (aggregateSignalsSql
// + rollupStats) and prints BYTE_EQUIVALENT=true|false (+ a key-level diff on
// mismatch). The CH2 gate greps for BYTE_EQUIVALENT=true.
//
//   Q1: canonical value-equality (recursive key-sort); recentSignals EXCLUDED.
//   Q2: recentSignals gated separately — shared-id fields identical + the output
//       IS a valid (created_at DESC, id DESC) top-20 + zero PII (outcome_/pfe_/…).
//   Consistent snapshot: retry until old.total === new.total. The signals table is
//       append-only (Data Integrity LAW — no deletes/updates), so equal counts ⇒
//       no inserts landed between the two reads ⇒ identical row set.
'use strict';
const path = require('path');
const fs = require('fs');

function findDist(rel) {
  for (const d of ['/app/dist', '/opt/crypto-quant-signal-mcp/dist', path.join(process.cwd(), 'dist'), path.join(__dirname, '..', 'dist')]) {
    const p = path.join(d, rel);
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('dist not found for ' + rel);
}
const db = findDist(path.join('lib', 'performance-db.js'));
let assetTiers = {};
try { assetTiers = findDist(path.join('lib', 'asset-tiers.js')); } catch { /* getTop20ByOI optional */ }

const { _perfStatsOldPath, _perfStatsNewPath, canonicalizeForCompare } = db;
const canon = (o) => JSON.stringify(canonicalizeForCompare(o));
const omitRecent = (s) => { const { recentSignals, ...rest } = s; return rest; };
function firstDiff(a, b) {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { index: i, a: a.slice(Math.max(0, i - 60), i + 80), b: b.slice(Math.max(0, i - 60), i + 80) };
}

(async () => {
  const top20 = assetTiers.getTop20ByOI ? await assetTiers.getTop20ByOI().catch(() => null) : null;
  let oldR, newR, tries = 0;
  do {
    newR = await _perfStatsNewPath(top20);   // SQL first (T1)
    oldR = await _perfStatsOldPath(top20);   // scan second (T2 ≥ T1)
    tries++;
    if (oldR.total === newR.total) break;     // no inserts in [T1,T2] ⇒ same snapshot
  } while (tries < 6);

  const snapshotConsistent = oldR.total === newR.total;
  const oldCanon = canon(omitRecent(oldR.stats));
  const newCanon = canon(omitRecent(newR.stats));
  const coreEqual = oldCanon === newCanon;

  // recentSignals Q2 gate
  const oldById = new Map(oldR.stats.recentSignals.map(r => [r.id, r]));
  const nr = newR.stats.recentSignals;
  let recentSorted = true, recentFieldsOk = true;
  for (let i = 1; i < nr.length; i++) {
    const ok = nr[i - 1].created_at > nr[i].created_at || (nr[i - 1].created_at === nr[i].created_at && (nr[i - 1].id ?? 0) >= (nr[i].id ?? 0));
    if (!ok) recentSorted = false;
  }
  for (const rec of nr) { const o = oldById.get(rec.id); if (o && canon(rec) !== canon(o)) recentFieldsOk = false; }
  const recentPiiClean = !/outcome_|pfe_|mae_|confidence|"call"|signal_hash|merkle_/.test(JSON.stringify(nr));

  const equivalent = snapshotConsistent && coreEqual && recentFieldsOk && recentSorted && recentPiiClean;
  console.log(`SNAPSHOT_CONSISTENT=${snapshotConsistent} (old.total=${oldR.total} new.total=${newR.total} tries=${tries})`);
  console.log(`CORE_EQUAL=${coreEqual} RECENT_FIELDS_OK=${recentFieldsOk} RECENT_SORTED=${recentSorted} RECENT_PII_CLEAN=${recentPiiClean}`);
  console.log(`overall.pfeWinRate old=${oldR.stats.overall.pfeWinRate} new=${newR.stats.overall.pfeWinRate} | totalCalls old=${oldR.stats.totalCalls} new=${newR.stats.totalCalls}`);
  if (!coreEqual) { const d = firstDiff(oldCanon, newCanon); console.log(`CORE_DIFF@${d.index}\n  OLD …${d.a}…\n  NEW …${d.b}…`); }
  console.log(`BYTE_EQUIVALENT=${equivalent}`);
  process.exit(equivalent ? 0 : 1);
})().catch(e => { console.log(`BYTE_EQUIVALENT=false ERROR=${e && e.message}`); process.exit(1); });
