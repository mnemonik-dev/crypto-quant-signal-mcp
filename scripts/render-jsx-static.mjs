#!/usr/bin/env node
/**
 * DESIGN-W6 build-time JSX render pipeline.
 *
 * Reads JSX from `Design/AlgoVault Landing Hero v1/` (vault),
 * compiles via Babel (@babel/preset-react + commonjs),
 * eval's as a virtual module,
 * renders via ReactDOMServer.renderToString,
 * applies wave-level architect-ratified overrides:
 *   - SKIP TradFiCallout (Q-W10 spec rule 10)
 *   - FILTER X402 5th pricing tier (Q-W10)
 *   - OVERRIDE pricing tier name UPPERCASE → Title Case (Q-W18; W5 Q-D1)
 *   - INJECT <span data-tr-field> for live-stat placeholders (Q-W11/Q-W14)
 *   - MAP footer placeholder hrefs to real URLs (Q-W15)
 *   - REWRITE CoreCapabilities subtitle (Q-W16; factuality)
 *   - STRIP UseCases meta dates (Q-W13)
 *   - PATCH FAQ defaultOpen=true so all 5 answers ship in DOM
 * outputs static HTML to stdout or file.
 *
 * No production runtime React; build-time only.
 *
 * Usage:
 *   node scripts/render-jsx-static.mjs --target=belowfold --mobile=false --out=/tmp/preview.html
 *   node scripts/render-jsx-static.mjs --target=landing-rest --mobile=true --out=/tmp/lr-mobile.html
 *
 * Exit codes:
 *   0 = render success
 *   1 = JSX read / Babel compile / eval / render error (logged to stderr)
 *   2 = invalid args
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from 'node:module';
import { JSDOM } from 'jsdom';
import babel from '@babel/core';
import React from 'react';
import { renderToString } from 'react-dom/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const VAULT_DESIGN = '/Users/tank/My Drive/Obsidian Vault/AlgoVault MCP/Design/AlgoVault Landing Hero v1';

// JSDOM globals for JSX module-end Object.assign(window, {...}) hooks.
// Node 25 has read-only navigator getter on globalThis; assign defensively via defineProperty.
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://algovault.com/' });
function safeDefine(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch {
    /* read-only — skip; JSX SSR for our 2 files doesn't need it (navigator.clipboard is inside an unfired onClick) */
  }
}
safeDefine('window', dom.window);
safeDefine('document', dom.window.document);
safeDefine('HTMLElement', dom.window.HTMLElement);
safeDefine('Element', dom.window.Element);
safeDefine('React', React); // JSX classic runtime needs React in scope

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function evalJsxSrc(src, filePath, exportNames) {
  // Append CommonJS export shim so we can extract named components after eval
  const shim = `\n;module.exports = { ${exportNames.join(', ')} };\n`;
  const fullSrc = src + shim;
  const compiled = babel.transformSync(fullSrc, {
    presets: ['@babel/preset-react'],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
    filename: filePath,
    babelrc: false,
    configFile: false,
  });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(compiled.code, filePath);
  return m.exports;
}

// ── JSX-source patches (pre-Babel) ──────────────────────────────────────────

function patchBelowFold(src) {
  // Q-W16: CoreCapabilities subtitle — "Four MCP tools" → "Three MCP tools + on-chain track record"
  // Factuality LAW: AlgoVault has 3 MCP tools + 1 on-chain track record callout (NOT 4 tools).
  return src.replace(
    'Four MCP tools your agent can call directly. Each returns a single, structured verdict — not raw indicators.',
    'Three MCP tools your agent can call — plus an on-chain track record. Each returns a single, structured verdict — not raw indicators.'
  );
}

function patchLandingRest(src) {
  // FAQ all-open default for SSR — so all 5 answer divs ship in the DOM.
  // Vanilla-JS init script (appended at section end) collapses items 2-5 on load + wires toggle.
  let s = src.replace('defaultOpen={!!it.open}', 'defaultOpen={true}');
  return s;
}

// ── Post-render overrides (HTML string-level) ───────────────────────────────

function applyTitleCase(html) {
  // Q-W18: pricing tier names UPPERCASE → Title Case (preserve W5 Q-D1 ratification)
  return html
    .replace(/>FREE</g, '>Free<')
    .replace(/>STARTER</g, '>Starter<')
    .replace(/>PRO</g, '>Pro<')
    .replace(/>ENTERPRISE</g, '>Enterprise<');
}

function filterX402Tier(html) {
  // Q-W10: strip 5th-card X402 article entirely; non-greedy match across <article>...X402 PER CALL...</article>
  return html.replace(/<article[^>]*?>(?:(?!<\/article>)[\s\S])*?X402 PER CALL(?:(?!<\/article>)[\s\S])*?<\/article>/g, '');
}

function injectLiveDataLiveTrack(html) {
  // Q-W11: 3 LIVE-tagged stats live-bind via existing track-record-proxy.js W3 hydration
  // 90.2% (LIVE PFE) — first occurrence only (LiveTrackRecord LIVE row)
  html = html.replace(/>90\.2%</, '><span data-tr-field="pfe_wr">90.2</span>%<');
  // 80,059+ (LIVE Calls) — first occurrence
  html = html.replace(/>80,059\+</, '><span data-tr-field="call_count">80,059</span>+<');
  // 29 → context anchor on Merkle batches (avoid generic "29" matches)
  html = html.replace(/>29(<\/div><div[^>]*>[^<]*Merkle batches on-chain)/, '><span data-tr-field="merkle_batch_count">29</span>$1');
  // Top stats: "5 Exchanges" + "11 Timeframes" — wrap with proxy spans (live-bind via track-record-proxy.js).
  html = html.replace(/>5 Exchanges</, '><span data-tr-field="exchange_count">5</span> Exchanges<');
  html = html.replace(/>11 Timeframes</, '><span data-tr-field="timeframe_count">11</span> Timeframes<');
  return html;
}

function wrapCounterLiteralsInProse(html) {
  // Wrap every "5 exchanges" (lowercase, in prose / FAQ answers / pricing bullets) with a proxy
  // span. Required by tests/unit/copy-consistency.test.ts AUTO-TRACE-W1 capability-counter canary
  // — every "<digit> exchange(s)" / "<digit> timeframe(s)" literal must be inside a data-tr-field
  // proxy span (or inside a SNAPSHOT-LINE marker or inside JSON-LD description/text). React-
  // rendered prose text doesn't auto-wrap, so we substitute post-render. Conservative match: only
  // the canonical "5 exchanges" / "11 timeframes" forms; preserves non-counter occurrences (e.g.
  // "exchanges trading", "exchanges support").
  // Applied to ALL physical lines so every unique line satisfies the canary.
  html = html.replaceAll('5 exchanges', '<span data-tr-field="exchange_count">5</span> exchanges');
  html = html.replaceAll('11 timeframes', '<span data-tr-field="timeframe_count">11</span> timeframes');
  return html;
}

function injectLiveDataPricingTagline(html) {
  // Q-W14: SimplePricing tagline 3 placeholder values
  // 98.8% big in tagline (single occurrence in SimplePricing render)
  html = html.replace(/>98\.8%</, '><span data-tr-field="hold_rate">98.8</span>%<');
  // Tagline body paragraph: "We reject 98.8% of scans"
  html = html.replace(/We reject 98\.8% of scans/, 'We reject <span data-tr-field="hold_rate">98.8</span>% of scans');
  // "90.2%+ Merkle-verified accuracy on 80,059+ signals"
  html = html.replace(/90\.2%\+ Merkle-verified accuracy on 80,059\+ signals/, '<span data-tr-field="pfe_wr">90.2</span>%+ Merkle-verified accuracy on <span data-tr-field="call_count">80,059</span>+ signals');
  return html;
}

function applyFooterUrls(html) {
  // Q-W15: placeholder hrefs → real URLs (footer + ForDevelopers pills row).
  // Same architectural pattern: any `href={`#${labelText}`}` placeholder gets a real URL.
  return html
    .replace(/href="#GitHub"/g, 'href="https://github.com/AlgoVaultLabs" target="_blank" rel="noopener"')
    .replace(/href="#X \/ Twitter"/g, 'href="https://x.com/AlgoVaultLabs" target="_blank" rel="noopener"')
    .replace(/href="#Signup"/g, 'href="/signup"')
    .replace(/href="#Privacy"/g, 'href="/privacy"')
    .replace(/href="#npm"/g, 'href="https://www.npmjs.com/package/crypto-quant-signal-mcp" target="_blank" rel="noopener"')
    .replace(/href="#MCP Registry"/g, 'href="https://registry.modelcontextprotocol.io/v0/servers?search=algovault" target="_blank" rel="noopener"');
}

function stripUseCasesDate(html) {
  // Q-W13: strip stale date placeholder
  return html.replace(/verified 2026-04-26/g, 'official Skills Hub');
}

function injectUseCasesLogos(html) {
  // Q-W7 hero pattern carries to UseCases card grid: replace the <span class="xchg-mark"...>{mark}</span>
  // letter chip with <img src="/_design/logos/{exchange}.{ext}" alt="{Exchange} logo"> per architect ratification.
  // Mark letters: B=Binance, O=OKX, BY=Bybit, BG=Bitget. Hyperliquid NOT in UseCases (HL is hero only).
  // Preserve --mark CSS custom property + size styles by keeping the surrounding <span class="xchg-mark">
  // shell as a flex container, but replace its letter child with the <img>.
  const logoMap = {
    'B':  { src: '/_design/logos/binance.png', alt: 'Binance logo' },
    'O':  { src: '/_design/logos/okx.png',     alt: 'OKX logo' },
    'BY': { src: '/_design/logos/bybit.jpg',   alt: 'Bybit logo' },
    'BG': { src: '/_design/logos/bitget.png',  alt: 'Bitget logo' },
  };
  // Pattern: <span class="xchg-mark" style="--mark:...;width:28px;height:28px;font-size:11px">{LETTER}</span>
  // After: <span class="xchg-mark" style="--mark:...;width:28px;height:28px;font-size:11px;display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="..." alt="..." style="width:22px;height:22px;object-fit:contain"></span>
  return html.replace(
    /(<span class="xchg-mark" style="[^"]*">)(B|O|BY|BG)(<\/span>)/g,
    (match, openSpan, letter, closeSpan) => {
      const cfg = logoMap[letter];
      if (!cfg) return match;
      // Inject flex/center styling for image container (style attr appends; ReactDOMServer would
      // also accept class but xchg-mark already has its base style on the JSX inline-style).
      const styledOpen = openSpan.replace(/">$/, ';display:flex;align-items:center;justify-content:center;overflow:hidden">');
      const img = `<img src="${cfg.src}" alt="${cfg.alt}" style="width:22px;height:22px;object-fit:contain">`;
      return styledOpen + img + closeSpan;
    }
  );
}

function preserveQuickstartAnchor(html) {
  // Existing landing/index.html has internal-page links href="#quickstart" (line 245 hero CTA + 739).
  // JSX TryIn30 renders id="try-it". Substitute id="try-it" → id="quickstart" to preserve internal-link contract.
  return html.replace(/id="try-it"/g, 'id="quickstart"');
}

function adjustPricingGridCols(html) {
  // After X402 filter, desktop grid was 5-col → make 4-col
  return html.replace(/grid-template-columns:repeat\(5,\s*1fr\)/g, 'grid-template-columns:repeat(4, 1fr)');
}

// FAQ accordion vanilla-JS (appended after FAQ render)
const FAQ_ACCORDION_JS = `<script>
(function(){
  // DESIGN-W6 FAQ accordion: collapse items 2-N on load; wire click-to-toggle.
  // Runs once on DOMContentLoaded (idempotent — protects against double-include).
  if (window.__w6FaqInit) return;
  window.__w6FaqInit = true;
  document.addEventListener('DOMContentLoaded', function(){
    var faqSection = document.getElementById('faq');
    if (!faqSection) return;
    var articles = faqSection.querySelectorAll('article');
    articles.forEach(function(article, i){
      var btn = article.querySelector('button');
      var answer = article.querySelectorAll(':scope > div')[0];
      if (!btn || !answer) return;
      // Initial state: only first item open
      var initiallyOpen = (i === 0);
      if (!initiallyOpen) {
        answer.style.display = 'none';
      }
      // Click handler
      btn.addEventListener('click', function(){
        var hidden = (answer.style.display === 'none');
        answer.style.display = hidden ? '' : 'none';
        article.setAttribute('data-w6-faq-open', hidden ? 'true' : 'false');
        // Rotate the chevron svg if present
        var svg = btn.querySelector('svg');
        if (svg) svg.style.transform = hidden ? 'rotate(180deg)' : 'rotate(0deg)';
      });
      article.setAttribute('data-w6-faq-open', initiallyOpen ? 'true' : 'false');
    });
  });
})();
</script>`;

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || 'belowfold';
  const mobile = args.mobile === 'true';
  const out = args.out;

  if (!['belowfold', 'landing-rest'].includes(target)) {
    console.error(`[render-jsx-static] invalid --target=${target} (expected belowfold|landing-rest)`);
    process.exit(2);
  }

  let html = '';

  try {
    if (target === 'belowfold') {
      const srcRaw = await readFile(path.join(VAULT_DESIGN, 'v1-belowfold.jsx'), 'utf-8');
      const src = patchBelowFold(srcRaw);
      const exports = await evalJsxSrc(
        src,
        path.join(VAULT_DESIGN, 'v1-belowfold.jsx'),
        ['AlgoVaultBelowFold', 'CoreCapabilities', 'WhenToUse', 'VsRawAPIs', 'BFIcon', 'BFEyebrow', 'BFH2', 'BFSection']
      );
      // Render 3 sections individually for clean per-section output (no top-level artboard wrapper —
      // C2 places each section directly in landing/index.html below-fold region).
      const cc = renderToString(React.createElement(exports.CoreCapabilities, { mobile }));
      const wt = renderToString(React.createElement(exports.WhenToUse, { mobile }));
      const vs = renderToString(React.createElement(exports.VsRawAPIs, { mobile }));
      html = cc + wt + vs;
    } else {
      const srcRaw = await readFile(path.join(VAULT_DESIGN, 'v1-landing-rest.jsx'), 'utf-8');
      const src = patchLandingRest(srcRaw);
      const exports = await evalJsxSrc(
        src,
        path.join(VAULT_DESIGN, 'v1-landing-rest.jsx'),
        [
          'AlgoVaultLandingRest', 'TryIn30', 'TradFiCallout', 'ThreeTools', 'UseCases',
          'LiveTrackRecord', 'TamperProof', 'SimplePricing', 'ForDevelopers', 'FAQ', 'LandingFooter',
          'LRBlock', 'LREyebrow', 'LRH2', 'LRLead', 'Pill', 'Check', 'Bullet', 'FAQItem',
        ]
      );
      // Render in spec order, SKIP TradFiCallout (architect mandate Q-W10 spec rule 10).
      const try30 = preserveQuickstartAnchor(renderToString(React.createElement(exports.TryIn30, { mobile })));
      const tt = renderToString(React.createElement(exports.ThreeTools, { mobile }));
      const uc = injectUseCasesLogos(stripUseCasesDate(renderToString(React.createElement(exports.UseCases, { mobile }))));
      const ltr = injectLiveDataLiveTrack(renderToString(React.createElement(exports.LiveTrackRecord, { mobile })));
      const tp = renderToString(React.createElement(exports.TamperProof, { mobile }));
      const sp = adjustPricingGridCols(applyTitleCase(injectLiveDataPricingTagline(filterX402Tier(
        renderToString(React.createElement(exports.SimplePricing, { mobile }))
      ))));
      const fd = applyFooterUrls(renderToString(React.createElement(exports.ForDevelopers, { mobile })));
      const fq = renderToString(React.createElement(exports.FAQ, { mobile })) + FAQ_ACCORDION_JS;
      const ft = applyFooterUrls(renderToString(React.createElement(exports.LandingFooter, { mobile })));
      // Final pass: wrap "5 exchanges" / "11 timeframes" prose literals with proxy spans (copy-consistency canary).
      html = wrapCounterLiteralsInProse(try30 + tt + uc + ltr + tp + sp + fd + fq + ft);
    }
  } catch (e) {
    console.error(`[render-jsx-static] render failed: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }

  if (out) {
    await writeFile(out, html);
    console.error(`[render-jsx-static] target=${target} mobile=${mobile} → ${out} (${html.length} bytes)`);
  } else {
    process.stdout.write(html);
  }
}

main();
