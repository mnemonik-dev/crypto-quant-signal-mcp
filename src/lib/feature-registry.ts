/**
 * FEATURE-REGISTRY-SOT-W1 CH1 — the single Source of Truth for AlgoVault MCP features.
 *
 * North-star: MCP is the SoT for features. Every channel (HTTP API / x402, TG bot,
 * webhook) DERIVES its surface from THIS registry, and a drift canary (CH4) fails the
 * build if any channel falls out of sync.
 *
 * This module is DATA + TYPES ONLY — it imports NO runtime handlers (no cycle).
 * Tool descriptions live in `tool-descriptions.ts`; the registry references them by key.
 */
import {
  TRADE_CALL_DESCRIPTION,
  SCAN_FUNDING_ARB_DESCRIPTION,
  GET_MARKET_REGIME_DESCRIPTION,
  SCAN_TRADE_CALLS_DESCRIPTION,
  SEARCH_KNOWLEDGE_DESCRIPTION,
  CHAT_KNOWLEDGE_DESCRIPTION,
  GET_EQUITY_CALL_DESCRIPTION,
  GET_EQUITY_REGIME_DESCRIPTION,
} from '../tool-descriptions.js';

/**
 * How a feature consumes quota:
 *  - 'per-call'          : 1 call per invocation (no HOLD concept).
 *  - 'per-non-hold'      : 1 call only for an actionable verdict (HOLD is free).
 *  - 'per-non-hold-min1' : 1 call per non-HOLD returned, minimum 1 (the market scanner).
 *  - 'rate-limited'      : NOT metered against the 100/mo call quota — token/usage
 *                          rate-limited separately (limiter: src/lib/chat-rate-limit.ts).
 */
export type QuotaUnit = 'per-call' | 'per-non-hold' | 'per-non-hold-min1' | 'rate-limited';

export interface FeatureSpec {
  /** Canonical MCP tool name. */
  name: string;
  /** Back-compat alias names that resolve to this feature (e.g. get_trade_signal). */
  aliases: string[];
  /** Which channels expose this feature TODAY. (W2 flips bot/webhook for the scanner, etc.) */
  channels: { mcp: boolean; httpX402: boolean; bot: boolean; webhook: boolean };
  /**
   * Webhook event type this feature emits, if any. CONSUMED server-side to derive
   * webhook-api's VALID_EVENTS (FEATURE-PARITY-CHANNELS-W1 CH1 — the SoT for the
   * webhook event set). NB: the TG-bot COMMAND name is deliberately NOT a registry
   * field — a command name is a bot-UX decision, not a universal feature property
   * /capabilities consumers need; the registry owns the WHAT (channel reach), the
   * bot owns the HOW (command name), the drift canary enforces no-drift (A1).
   */
  webhookEvent?: string;
  /** Quota model (see QuotaUnit). */
  quota: { unit: QuotaUnit; holdFree: boolean };
  /** x402 pay-per-call pricing in USD. `null` = not yet priced. */
  x402: { basePriceUsd: number; perUnitUsd?: number } | null;
  /** Key into tool-descriptions.ts (resolved by DESCRIPTIONS below). */
  descriptionRef: string;
  enabled: boolean;
}

/** descriptionRef → canonical description string (descriptions stay in tool-descriptions.ts). */
const DESCRIPTIONS: Record<string, string> = {
  TRADE_CALL_DESCRIPTION,
  SCAN_FUNDING_ARB_DESCRIPTION,
  GET_MARKET_REGIME_DESCRIPTION,
  SCAN_TRADE_CALLS_DESCRIPTION,
  SEARCH_KNOWLEDGE_DESCRIPTION,
  CHAT_KNOWLEDGE_DESCRIPTION,
  GET_EQUITY_CALL_DESCRIPTION,
  GET_EQUITY_REGIME_DESCRIPTION,
};

/**
 * The registry — ONE entry per canonical tool, populated from CURRENT reality
 * (verified live @ FEATURE-REGISTRY-SOT-W1 Step-0, 2026-06-08). Channel flags reflect
 * TODAY; scanner/equity x402 are `null` (pricing deferred to a follow-up, pending $/unit).
 */
export const FEATURE_REGISTRY: FeatureSpec[] = [
  {
    name: 'get_trade_call',
    aliases: ['get_trade_signal'],
    channels: { mcp: true, httpX402: true, bot: true, webhook: true },
    webhookEvent: 'trade_call',
    quota: { unit: 'per-non-hold', holdFree: true },
    x402: { basePriceUsd: 0.02 },
    descriptionRef: 'TRADE_CALL_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'get_market_regime',
    aliases: [],
    channels: { mcp: true, httpX402: true, bot: true, webhook: true },
    webhookEvent: 'regime_shift',
    quota: { unit: 'per-call', holdFree: false },
    x402: { basePriceUsd: 0.02 },
    descriptionRef: 'GET_MARKET_REGIME_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'scan_funding_arb',
    aliases: [],
    channels: { mcp: true, httpX402: true, bot: false, webhook: false },
    quota: { unit: 'per-call', holdFree: false },
    x402: { basePriceUsd: 0.01 },
    descriptionRef: 'SCAN_FUNDING_ARB_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'scan_trade_calls',
    aliases: [],
    // FEATURE-PARITY-CHANNELS-W1 CH1: the scanner now reaches the webhook
    // (scheduled scan_digest) + bot (/scan pull + /scanwatch push) channels —
    // flipping these two flags is what makes /scan appear on both push channels.
    channels: { mcp: true, httpX402: true, bot: true, webhook: true },
    webhookEvent: 'scan_digest',
    quota: { unit: 'per-non-hold-min1', holdFree: true },
    // OPS-X402-PRICING-EXPANSION-W1: FLAT $0.02/scan. x402 declares the price in the
    // 402 BEFORE the tool runs, so it CANNOT bill per-result — the per-result
    // max(1, non-HOLD) rule is the FREE-quota rail ONLY (supersedes the earlier per-unit proposal).
    x402: { basePriceUsd: 0.02 },
    descriptionRef: 'SCAN_TRADE_CALLS_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'get_equity_call',
    aliases: [],
    channels: { mcp: true, httpX402: true, bot: false, webhook: false },
    quota: { unit: 'per-non-hold', holdFree: true }, // HOLD-free per QUOTA-CONSISTENCY-COUNT-ALL-W1
    x402: { basePriceUsd: 0.02 }, // OPS-X402-PRICING-EXPANSION-W1: flat $0.02/call (free rail unchanged)
    descriptionRef: 'GET_EQUITY_CALL_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'get_equity_regime',
    aliases: [],
    channels: { mcp: true, httpX402: true, bot: false, webhook: false },
    quota: { unit: 'per-call', holdFree: false },
    x402: { basePriceUsd: 0.02 }, // OPS-X402-PRICING-EXPANSION-W1: flat $0.02/call (free rail unchanged)
    descriptionRef: 'GET_EQUITY_REGIME_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'chat_knowledge',
    aliases: [],
    channels: { mcp: true, httpX402: false, bot: false, webhook: false },
    quota: { unit: 'rate-limited', holdFree: false }, // limiter: src/lib/chat-rate-limit.ts (token/usage, NOT 100/mo call-quota)
    x402: null,
    descriptionRef: 'CHAT_KNOWLEDGE_DESCRIPTION',
    enabled: true,
  },
  {
    name: 'search_knowledge',
    aliases: [],
    channels: { mcp: true, httpX402: false, bot: false, webhook: false },
    quota: { unit: 'rate-limited', holdFree: false }, // limiter: src/lib/chat-rate-limit.ts (token/usage, NOT 100/mo call-quota)
    x402: null,
    descriptionRef: 'SEARCH_KNOWLEDGE_DESCRIPTION',
    enabled: true,
  },
];

/** Resolve a tool name OR alias to its FeatureSpec — closes the canonical-key gap. */
export function getFeature(nameOrAlias: string): FeatureSpec | undefined {
  return FEATURE_REGISTRY.find((f) => f.name === nameOrAlias || f.aliases.includes(nameOrAlias));
}

/** Every live MCP tool NAME (canonical + aliases) — must equal the live `tools/list` set. */
export function allToolNames(): string[] {
  return FEATURE_REGISTRY.flatMap((f) => [f.name, ...f.aliases]);
}

/**
 * The webhook event types — the `webhookEvent` of every ENABLED webhook-flagged
 * feature, in registry order. The SINGLE SoT for webhook-api's VALID_EVENTS
 * (FEATURE-PARITY-CHANNELS-W1 CH1): retires the hand-maintained 2nd list, so
 * adding a future webhook tool needs only a registry row. The drift canary (CH5)
 * asserts the live VALID_EVENTS equals this set.
 */
export function webhookEventTypes(): string[] {
  return FEATURE_REGISTRY
    .filter((f) => f.enabled && f.channels.webhook && f.webhookEvent)
    .map((f) => f.webhookEvent as string);
}

/** One public-safe descriptor per CALLABLE tool name (canonical + each alias). */
export interface PublicCapability {
  /** The callable tool name (a canonical name OR an alias). */
  name: string;
  /** The canonical name this resolves to (== name for canonical entries). */
  canonical: string;
  channels: { mcp: boolean; httpX402: boolean; bot: boolean; webhook: boolean };
  quota: { unit: QuotaUnit; holdFree: boolean };
  x402: { basePriceUsd: number; perUnitUsd?: number } | null;
  description: string;
  enabled: boolean;
}

/**
 * PUBLIC-SAFE projection for GET /capabilities. ONE entry per callable name
 * (canonical + each alias) so a consumer can look up any name it might call.
 * Emits ONLY public fields — no internal quota keys, no `outcome_*` /
 * `eligible_non_hold`, no `descriptionRef`, no handler refs.
 */
export function projectCapabilities(): { tools: PublicCapability[] } {
  const tools: PublicCapability[] = [];
  for (const f of FEATURE_REGISTRY) {
    if (!f.enabled) continue;
    const base = {
      canonical: f.name,
      channels: f.channels,
      quota: { unit: f.quota.unit, holdFree: f.quota.holdFree },
      x402: f.x402,
      description: DESCRIPTIONS[f.descriptionRef] ?? '',
      enabled: f.enabled,
    };
    tools.push({ name: f.name, ...base });
    for (const alias of f.aliases) tools.push({ name: alias, ...base });
  }
  return { tools };
}
