/**
 * Single-source signup-flow copy for the "What happens after you subscribe"
 * 4-step block rendered in TWO surfaces:
 *   - getSignupPageHtml() in src/index.ts (dark inline-CSS theme)
 *   - landing/docs.html #pricing section (Tailwind theme; injected at build
 *     time by scripts/build_landing.mjs between BUILD:signup-flow markers)
 *
 * The data array SIGNUP_FLOW_STEPS is the single source of truth.
 * Both renderSignupFlowDark() and renderSignupFlowTailwind() read from it,
 * so copy drift between surfaces is impossible.
 */

export interface SignupFlowStep {
  title: string;
  body: string; // may include limited inline HTML (<code>, <strong>) — render functions handle escaping context-appropriately
}

export const SIGNUP_FLOW_STEPS: readonly SignupFlowStep[] = [
  {
    title: 'Click "Subscribe to [Plan]"',
    body: 'on /signup. We redirect you to Stripe Checkout (we never see your card).',
  },
  {
    title: 'Pay on Stripe',
    body: 'Stripe sends you a receipt email. Behind the scenes, our webhook generates a unique API key for your subscription tier.',
  },
  {
    title: 'Land on the Welcome page',
    body: 'Your API key is shown in green — copy it. We also email it to your billing address (check spam, sender: <code>noreply@algovault.com</code>).',
  },
  {
    title: 'Make your first call',
    body: '<code>curl -H "Authorization: Bearer av_live_…" https://api.algovault.com/mcp …</code> or paste the key into your Claude Desktop / Cursor / Claude Code MCP config. Need to find your key later? Visit <code>/account</code>.',
  },
];

/** Dark-theme render for getSignupPageHtml() (inline CSS, matches existing #0f1117 palette). */
export function renderSignupFlowDark(): string {
  const items = SIGNUP_FLOW_STEPS.map((step, i) => `
    <li style="margin-bottom:14px;padding-left:8px">
      <strong style="color:#58a6ff">${step.title}</strong>
      <span style="color:#c9d1d9"> — ${step.body.replace(/<code>/g, '<code style="background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:1px 6px;font-size:12px;color:#3fb950">')}</span>
    </li>`).join('');
  return `<section style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px 28px;margin:0 0 28px">
  <h2 style="font-size:14px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">What happens after you subscribe</h2>
  <ol style="list-style:decimal;padding-left:24px;margin:0;font-size:14px;line-height:1.5;color:#e1e4e8">${items}
  </ol>
</section>`;
}

/** Tailwind-theme render for landing/docs.html #pricing section (uses bg-navy-700 + utility classes already in use). */
export function renderSignupFlowTailwind(): string {
  const items = SIGNUP_FLOW_STEPS.map((step) => `
        <li class="text-gray-300 text-sm leading-relaxed">
          <span class="font-semibold text-white">${step.title}</span>
          <span class="text-gray-400"> — ${step.body.replace(/<code>/g, '<code class="text-xs bg-navy-700/60 border border-white/5 rounded px-1.5 py-0.5 text-emerald-400">')}</span>
        </li>`).join('');
  return `      <div class="bg-navy-700 border border-white/5 rounded-xl p-5 mb-8">
        <ol class="list-decimal pl-5 space-y-2.5">${items}
        </ol>
      </div>`;
}
