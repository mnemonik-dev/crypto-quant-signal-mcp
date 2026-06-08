#!/usr/bin/env node
/**
 * measure-activation-soak.mjs — parameterized organic paid-conversion soak measurement.
 *
 * ACTIVATION-PAYWALL-W1-SOAK-MEASURE (R6). A reusable primitive, not a throwaway query:
 * re-run any future soak / cohort by passing new --gte / --lte / --filter bounds.
 *
 * Pipeline:
 *   R1  Window-bounded paginated pull of /v1/checkout/sessions (created[gte],created[lte],
 *       limit=100, starting_after until has_more=false). Captures raw total N.
 *   R2  Paid filter: retain only status=='complete' AND payment_status=='paid'
 *       (status alone over-counts — Stripe: "complete" can still be payment-processing).
 *   R3  Schema-adaptive operator exclusion driven ONLY by the keys the --filter JSON
 *       actually exposes: operator_emails + operator_stripe_session_ids_known_so_far
 *       always; operator_metadata_markers.utm_source/.utm_campaign only if present.
 *       Test-card brand is a no-op in live mode (Stripe rejects test cards) and the
 *       brand field is not on the Checkout Session object, so it is intentionally skipped.
 *   R5  Per-source attribution by recovered metadata.utm_source (count + revenue).
 *
 * Zero npm deps (Node>=18 global fetch). Requires STRIPE_SECRET_KEY in env.
 * Output: machine JSON to stdout with --json; human summary always to stderr.
 * PII discipline: customer emails are read for exclusion but NEVER emitted. Output
 * carries only aggregate counts, utm_source labels, and cs_* session ids (non-PII).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/measure-activation-soak.mjs \
 *     --gte 1779262200 --lte 1780471800 \
 *     --filter audits/OPERATOR_TEST_STRIPE_FILTER.json --json
 */
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') { a.json = true; continue; }
    if (k.startsWith('--')) { a[k.slice(2)] = argv[++i]; }
  }
  return a;
}

const args = parseArgs(process.argv);
const GTE = args.gte, LTE = args.lte, FILTER = args.filter;
const KEY = process.env.STRIPE_SECRET_KEY || '';

if (!GTE || !LTE || !FILTER) {
  console.error('Usage: --gte <epoch> --lte <epoch> --filter <path> [--json]');
  process.exit(2);
}
if (!/^\d+$/.test(String(GTE)) || !/^\d+$/.test(String(LTE))) {
  console.error('--gte/--lte must be integer Unix epoch seconds');
  process.exit(2);
}
if (!KEY) { console.error('STRIPE_SECRET_KEY not set in env'); process.exit(2); }

// ── load filter (schema-adaptive: only consume keys that exist) ──
const filter = JSON.parse(readFileSync(FILTER, 'utf8'));
const operatorEmails = new Set((filter.operator_emails || []).map((e) => String(e).trim().toLowerCase()));
const operatorSessionIds = new Set(filter.operator_stripe_session_ids_known_so_far || []);
const hasMetaMarkers = !!filter.operator_metadata_markers;
const opUtmSource = new Set((hasMetaMarkers && filter.operator_metadata_markers.utm_source) || []);
const opUtmCampaign = new Set((hasMetaMarkers && filter.operator_metadata_markers.utm_campaign) || []);

async function stripeGet(params) {
  const url = 'https://api.stripe.com/v1/checkout/sessions?' + params.toString();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Stripe HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

// ── R1: window-bounded paginated pull ──
async function pullAll(gte, lte) {
  const out = [];
  let startingAfter = null;
  let pages = 0;
  for (;;) {
    const p = new URLSearchParams();
    p.set('limit', '100');
    p.set('created[gte]', String(gte));
    p.set('created[lte]', String(lte));
    if (startingAfter) p.set('starting_after', startingAfter);
    const page = await stripeGet(p);
    pages++;
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return { sessions: out, pages };
}

function emailOf(s) {
  return String(s.customer_details?.email ?? s.customer_email ?? '').trim().toLowerCase();
}

(async () => {
  const { sessions, pages } = await pullAll(GTE, LTE);
  const rawN = sessions.length;

  // ── R2: paid filter ──
  const paid = sessions.filter((s) => s.status === 'complete' && s.payment_status === 'paid');

  // ── R3: schema-adaptive operator exclusion (first-match-wins, itemized) ──
  const excl = { email: [], session_id: [], utm_source: [], utm_campaign: [] };
  const organic = [];
  for (const s of paid) {
    const email = emailOf(s);
    const usrc = s.metadata?.utm_source ?? null;
    const ucmp = s.metadata?.utm_campaign ?? null;
    if (email && operatorEmails.has(email)) { excl.email.push(s.id); continue; }
    if (operatorSessionIds.has(s.id)) { excl.session_id.push(s.id); continue; }
    if (hasMetaMarkers && usrc && opUtmSource.has(usrc)) { excl.utm_source.push(s.id); continue; }
    if (hasMetaMarkers && ucmp && opUtmCampaign.has(ucmp)) { excl.utm_campaign.push(s.id); continue; }
    organic.push(s);
  }
  const excludedM = excl.email.length + excl.session_id.length + excl.utm_source.length + excl.utm_campaign.length;

  // ── R5: per-source attribution ──
  const bySource = {};
  for (const s of organic) {
    const src = s.metadata?.utm_source ?? '(none)';
    if (!bySource[src]) bySource[src] = { count: 0, revenue_cents: 0 };
    bySource[src].count++;
    bySource[src].revenue_cents += typeof s.amount_total === 'number' ? s.amount_total : 0;
  }

  const result = {
    window: {
      gte: Number(GTE),
      lte: Number(LTE),
      gte_utc: new Date(Number(GTE) * 1000).toISOString(),
      lte_utc: new Date(Number(LTE) * 1000).toISOString(),
    },
    filter_path: FILTER,
    filter_keys_consumed: {
      operator_emails: operatorEmails.size,
      operator_stripe_session_ids_known_so_far: operatorSessionIds.size,
      operator_metadata_markers_present: hasMetaMarkers,
      utm_source_markers: opUtmSource.size,
      utm_campaign_markers: opUtmCampaign.size,
    },
    pages,
    raw_N: rawN,
    paid_complete: paid.length,
    excluded_M: excludedM,
    excluded_breakdown: {
      by_email: excl.email.length,
      by_session_id: excl.session_id.length,
      by_utm_source: excl.utm_source.length,
      by_utm_campaign: excl.utm_campaign.length,
      excluded_session_ids: { // cs_* ids are non-PII; emails never emitted
        email: excl.email, session_id: excl.session_id, utm_source: excl.utm_source, utm_campaign: excl.utm_campaign,
      },
    },
    organic: organic.length,
    organic_session_ids: organic.map((s) => s.id),
    by_source: bySource,
    paid_filter_note: "status=='complete' AND payment_status=='paid' (payment_status disambiguates 'complete-but-still-processing'; status alone over-counts).",
  };

  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  console.error(`window ${result.window.gte_utc} → ${result.window.lte_utc}  (${pages} page(s), raw N=${rawN})`);
  console.error(`paid+complete=${paid.length} → excluded M=${excludedM} ` +
    `(email ${excl.email.length}, id ${excl.session_id.length}, utm_source ${excl.utm_source.length}, utm_campaign ${excl.utm_campaign.length}) ` +
    `→ ORGANIC=${organic.length}`);
  for (const [src, v] of Object.entries(bySource)) {
    console.error(`  ${src}: ${v.count} session(s)  $${(v.revenue_cents / 100).toFixed(2)}`);
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
