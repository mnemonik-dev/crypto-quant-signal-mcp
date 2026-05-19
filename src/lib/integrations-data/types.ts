/**
 * Single-SoT data layer for the 3 Integration surfaces.
 *
 * Consumed by:
 *   - src/lib/mcp-usage-docs.ts  (renders docs.html#integration H2 + 3 H3s)
 *   - scripts/render-integrations.mjs  (renders per-slug landing pages)
 *   - landing/integrations.html  (3-section index page; static, manually
 *     curated but sourced from these entries — keep in sync at edit time)
 *   - src/index.ts  (Express route allow-list reads slugs from hasDedicatedPage:true entries)
 *
 * Introduced INTEGRATIONS-FULL-STACK-W1 C1 (Fix-at-Generator refactor).
 */

export type SurfaceType = 'mcp-client' | 'ai-agent' | 'exchange-kit';

export interface IntegrationEntry {
  /** URL slug (kebab-case). Used as the path segment in /integrations/<slug>. */
  slug: string;
  /** Human-readable name shown in the table row and walkthrough summary. */
  displayName: string;
  /** Which surface this entry belongs to. */
  surfaceType: SurfaceType;
  /**
   * HTML for the "Setup" table cell. Brief; may contain <code> and <em>.
   * No newlines (renders into a single <td>).
   */
  setupSummary: string;
  /**
   * HTML for the "What you get" table cell. Brief; may contain <code>.
   * No newlines.
   */
  whatYouGet: string;
  /**
   * Override for the <details><summary> text. Default is
   * "<displayName> &mdash; setup walkthrough". Plain HTTP/curl uses
   * "Plain HTTP / curl &mdash; advanced testing" instead.
   */
  walkthroughSummary?: string;
  /**
   * HTML body inside the <details> block's <div class="px-5 pb-5 pt-2 ...">
   * wrapper. May contain multiple <p> + <div class="code-block">...</div>
   * children. 5-25 lines typical.
   */
  walkthroughHtml: string;
  /**
   * Canonical full-tutorial URL. For hasDedicatedPage:true entries this is
   * the per-slug landing page (e.g. https://algovault.com/integrations/binance).
   * For hasDedicatedPage:false entries this is an empty string OR an upstream
   * doc URL — the renderer skips the "Full tutorial" CTA in the walkthrough.
   */
  fullTutorialUrl: string;
  /**
   * Whether scripts/render-integrations.mjs should generate a dedicated
   * landing/integrations/<slug>.html page. Plain HTTP/curl is false (it's
   * a transport, not a client — table-row + inline walkthrough only).
   */
  hasDedicatedPage: boolean;
}

/**
 * Per-surface metadata: anchor IDs, intro copy, footer "verified against"
 * link list, optional CTA paragraph.
 */
export interface SurfaceMeta {
  /** anchor id on docs.html#integration H3 (e.g. 'connect-mcp'). */
  anchorId: string;
  /** H3 heading text (e.g. 'Connect Your MCP Client'). */
  title: string;
  /** Tailwind margin-top class on the H3 ('mt-8' for first H3, 'mt-12' for subsequent). */
  marginTopClass: string;
  /** HTML for the intro paragraph that follows the H3. */
  introHtml: string;
  /** First column header for the table (e.g. 'Surface' / 'Framework' / 'Exchange'). */
  firstColumnHeader: string;
  /** Date the footer 'verified against' line cites (e.g. '2026-04-30'). */
  footerVerifiedDate: string;
  /** Footer preamble before the link list (e.g. 'Config formats verified ... against:'). */
  footerPreamble: string;
  /** Footer drift note after the link list (e.g. 'Config formats can drift ...'). */
  footerDriftNote: string;
  /** Footer link list. Rendered as ' &middot; '-separated <a> tags. */
  footerLinks: Array<{ label: string; href: string }>;
  /**
   * Optional CTA paragraph emitted AFTER the footer. Currently only the AI
   * Agent surface uses this. HTML body, no wrapping <p> (renderer adds wrapper).
   */
  ctaParagraphHtml?: string;
}

/**
 * A complete surface module — what each data file exports as its default.
 */
export interface SurfaceModule {
  meta: SurfaceMeta;
  entries: IntegrationEntry[];
}
