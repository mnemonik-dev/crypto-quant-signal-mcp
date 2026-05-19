/**
 * Renderer for the Integration H2 section on docs.html + the per-surface
 * H3 blocks. Pure functions; no I/O.
 *
 * Consumed by src/lib/mcp-usage-docs.ts (composed MCP_USAGE_HTML constant
 * for the BUILD:mcp-usage block in landing/docs.html).
 *
 * Byte-equivalence contract: renderIntegrationH2({mcpClients, aiAgents,
 * exchangeKits: null}) emits HTML that — after whitespace normalization —
 * byte-matches the pre-refactor MCP_USAGE_HTML (tests/fixtures/
 * mcp-usage-html-pre-refactor.txt). Adding exchangeKits as non-null adds
 * a 3rd H3 section before the closing </section>.
 */

import type { IntegrationEntry, SurfaceModule } from './types.js';

const DEFAULT_H2_INTRO =
  'Drop AlgoVault into any MCP-compatible client, or any major agent framework. Pick your path below.';

function renderTableRow(entry: IntegrationEntry, isLast: boolean): string {
  const trClass = isLast ? '' : ' class="border-b border-white/10"';
  return `        <tr${trClass}>
          <td class="text-white text-sm px-4 py-3 font-medium">${entry.displayName}</td>
          <td class="text-gray-300 text-sm px-4 py-3">${entry.setupSummary}</td>
          <td class="text-gray-400 text-sm px-4 py-3">${entry.whatYouGet}</td>
        </tr>`;
}

function renderWalkthrough(entry: IntegrationEntry): string {
  const summary = entry.walkthroughSummary ?? `${entry.displayName} &mdash; setup walkthrough`;
  return `  <details class="bg-navy-700 border border-white/5 rounded-xl mb-3">
    <summary class="px-5 py-3 text-white text-sm font-medium cursor-pointer">${summary}</summary>
    <div class="px-5 pb-5 pt-2 text-sm text-gray-300 space-y-3">
${entry.walkthroughHtml}
    </div>
  </details>`;
}

function renderFooterLinks(links: Array<{ label: string; href: string }>): string {
  return links
    .map(
      (l) =>
        `    <a class="text-mint-400 hover:underline" href="${l.href}">${l.label}</a>`,
    )
    .join(' &middot;\n');
}

export function renderSurfaceSection(surface: SurfaceModule): string {
  const { meta, entries } = surface;
  const rows = entries
    .map((e, i) => renderTableRow(e, i === entries.length - 1))
    .join('\n');
  const walkthroughs = entries.map(renderWalkthrough).join('\n\n');
  const links = renderFooterLinks(meta.footerLinks);
  const cta = meta.ctaParagraphHtml
    ? `\n\n  <p class="text-gray-400 text-sm mt-8 text-center">\n    ${meta.ctaParagraphHtml}\n  </p>`
    : '';

  return `  <h3 id="${meta.anchorId}" class="text-lg font-semibold text-white mb-4 ${meta.marginTopClass} flex items-center gap-2">
    <span class="text-mint-400">&#9670;</span> ${meta.title}
  </h3>
  <p class="text-gray-400 text-sm mb-6">${meta.introHtml}</p>

  <div class="overflow-x-auto mb-6">
    <table class="w-full bg-navy-700 border border-white/5 rounded-xl overflow-hidden text-sm">
      <thead><tr class="border-b border-white/5">
        <th class="text-left text-xs text-gray-500 uppercase tracking-wider px-4 py-3">${meta.firstColumnHeader}</th>
        <th class="text-left text-xs text-gray-500 uppercase tracking-wider px-4 py-3">Setup</th>
        <th class="text-left text-xs text-gray-500 uppercase tracking-wider px-4 py-3">What you get</th>
      </tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>

${walkthroughs}

  <p class="text-gray-500 text-xs mt-6">
    <strong>${meta.footerPreamble}</strong>
${links}.
    ${meta.footerDriftNote}
  </p>${cta}`;
}

export function renderIntegrationH2(args: {
  mcpClients: SurfaceModule;
  aiAgents: SurfaceModule;
  exchangeKits: SurfaceModule | null;
  h2IntroHtml?: string;
}): string {
  const intro = args.h2IntroHtml ?? DEFAULT_H2_INTRO;
  const sections: string[] = [
    renderSurfaceSection(args.mcpClients),
    renderSurfaceSection(args.aiAgents),
  ];
  if (args.exchangeKits) {
    sections.push(renderSurfaceSection(args.exchangeKits));
  }
  return `<section id="integration" class="mb-16">
  <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
    <span class="text-mint-400">&#9670;</span> Integration
  </h2>
  <p class="text-gray-400 text-sm mb-8">${intro}</p>

${sections.join('\n\n')}
</section>
`;
}

/**
 * Whitespace-normalize HTML for byte-equivalence comparisons. Collapses
 * any run of whitespace (spaces, tabs, newlines) to a single space; trims
 * leading/trailing whitespace. Order of attributes, text content, and
 * tag nesting are preserved.
 */
export function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}
