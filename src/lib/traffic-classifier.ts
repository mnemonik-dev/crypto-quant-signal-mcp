/**
 * OPS-ACTIVATION-LEAK-FIX-W1 CH3 (2026-06-29): the canonical traffic classifier.
 *
 * ONE shared pure fn (`classifyTraffic`) is AUTHORITATIVE for "is this funnel
 * connect automated?" (single-derivation LAW — Q3). The result is stamped into
 * `funnel_events.meta_json` at the `mcp_connect` emit (additive — events are
 * TAGGED, never dropped; Data Integrity), and the snapshot computes a cleaned
 * `by_authenticity` denominator from it.
 *
 * Layered DENY-list (never a human allow-list as the PRIMARY mechanism — that
 * would drop real agents). Precedence (architect-ratified Q3):
 *   L0  internal-tier (bot loopback / admin bypass)            → automated
 *   --  KNOWN-AGENT un-tag escape hatch (the ONE allow-list)   → human (beats L1)
 *   L2  health-check UA tokens (ELB/GoogleHC/kube-probe/…)     → automated
 *   L1  isbot (206-pattern crawler/bot list; subsumes most     → automated
 *       of crawler-user-agents) + generic HTTP clients
 *   L4  datacenter-IP ∧ generic/empty-UA ∧ no-real-call        → automated
 *       (a connect-only probe from cloud with no human signal; COMBINING only —
 *       NEVER excludes on cloud-IP alone: real agents run in the cloud)
 *   --  default                                                → human
 *
 * The KNOWN-AGENT un-tag is REQUIRED: isbot v5 flags `claude-code/…` (pattern
 * `^claude-code/`) and `Cursor/…` (pattern `cursor/`) as bots, but these are
 * REAL MCP clients = real users in the funnel sense (verified empirically
 * 2026-06-29). It runs BEFORE isbot so a wanted agent is un-tagged. (isbot's own
 * `createIsbotFromList(list.filter(…))` is the alternative; an explicit pre-isbot
 * allow-list is chosen for transparency + version-stability — isbot patterns
 * drift across versions, and surgically removing `agent\b` would UNDER-tag real
 * bots.)
 *
 * `is_bot_internal` (request_log column) is a NARROWER INPUT (internal/admin tier
 * only) — it is consumed here as the L0 signal, NOT re-derived. The subset
 * invariant `is_bot_internal===true ⟹ classifyTraffic()=automated` is pinned by a
 * canary in the tests (single-derivation: two bot-derivations must never drift).
 */
import { isbot } from 'isbot';

export interface TrafficSignals {
  /** Request User-Agent (raw). null/empty when the client omits it. */
  ua?: string | null;
  /** Raw client IP (NOT the hash — only available at the emit/POST layer). */
  ip?: string | null;
  /**
   * Did the classified unit make a COMPLETED real tool call (a `tools/call` that
   * returns data)? `tools/list` / handshake-only never count. Used by the L4
   * combining path. At the per-connect emit this is "is THIS POST a real call".
   */
  hadRealToolCall?: boolean;
  /** License tier === 'internal' (bot loopback / admin bypass) — the L0 signal. */
  isInternalTier?: boolean;
}

export interface TrafficVerdict {
  is_automated: boolean;
  /** Short machine-readable reason when automated (for by_authenticity / debug); null when human. */
  reason: string | null;
}

/** Injectable deps so the layering logic is unit-testable without isbot's full list / a real IP DB. */
export interface ClassifyDeps {
  isBot?: (ua: string) => boolean;
  isDatacenterIp?: (ip: string) => boolean;
}

/**
 * KNOWN-AGENT un-tag allow-list — real MCP clients / AI dev agents that represent
 * a HUMAN user even when isbot's heuristics flag them. Intentionally biased toward
 * human ("never drop real agents"): a spoofed human is a minor measurement noise,
 * a dropped real agent corrupts the activation funnel. Extend as new MCP clients
 * appear. `// TODO: revisit by 2026-09-27` — re-audit against the live agent UA mix.
 */
const KNOWN_AGENT_RE =
  /\b(claude|anthropic|cursor|cline|windsurf|codeium|continue\.dev|librechat|goose|zed\.dev|chatgpt|openai|modelcontextprotocol|mcp[-_]?client|langchain|llamaindex|smithery)\b/i;

/**
 * L2 — explicit health-check / uptime-probe UA tokens. isbot catches most, but an
 * explicit list yields a precise `health_check` reason + belt-and-suspenders.
 */
const HEALTH_CHECK_RE =
  /(ELB-HealthChecker|GoogleHC|kube-probe|UptimeRobot|Pingdom|Pingdom\.com_bot|Datadog\/Synthetics|Amazon-Route53-Health-Check|Consul Health Check|StatusCake|Site24x7|Better Uptime|HetrixTools)/i;

/**
 * L3 — generic HTTP-client UAs (SOFT signal; only meaningful in the L4 combination).
 * Most are already caught by isbot L1; this set is the residual + the "empty UA"
 * partner for the combining path.
 */
const GENERIC_CLIENT_RE =
  /(python-requests|python-urllib|urllib|libwww-perl|Apache-HttpClient|okhttp|Go-http-client|node-fetch|axios|undici|Java\/|Jakarta|Wget|curl|libcurl|http\.rb|Faraday|Guzzle|HTTPie|PostmanRuntime|insomnia|reqwest|aiohttp|httpx)/i;

/**
 * Best-effort, NON-EXHAUSTIVE datacenter/cloud IPv4 second-octet prefixes used
 * ONLY as a COMBINING signal (never alone). Conservative by design: a miss leaves
 * traffic labeled human (the safe bias). For a precise verdict this is injectable
 * (`ClassifyDeps.isDatacenterIp`) and a future wave can plug in a real IP-intel
 * provider. `// TODO: revisit by 2026-09-27` (defensive-threshold hygiene).
 * Prefixes chosen as predominantly-datacenter (Hetzner / AWS / GCP / Azure / DO /
 * OVH / Linode / Vultr blocks); residential ISPs largely live elsewhere.
 */
const DATACENTER_V4_PREFIXES: ReadonlySet<string> = new Set([
  // Hetzner (our own host neighborhood + common scrapers)
  '5.75', '5.78', '78.46', '78.47', '88.99', '95.216', '116.202', '128.140',
  '135.181', '138.201', '142.132', '144.76', '148.251', '157.90', '159.69',
  '162.55', '167.235', '168.119', '176.9', '178.63', '188.34', '195.201',
  // AWS
  '3.80', '13.56', '15.220', '18.205', '34.192', '35.153', '52.0', '54.144',
  // GCP
  '34.64', '34.120', '35.184', '35.224',
  // Azure
  '13.64', '20.36', '40.74', '52.224', '104.40',
  // DigitalOcean / Linode / Vultr / OVH
  '104.131', '142.93', '159.65', '165.227', '167.99', '45.33', '45.79',
  '139.144', '45.76', '149.28', '51.79', '51.81', '147.135',
]);

function defaultIsDatacenterIp(ip: string): boolean {
  // IPv4 only; IPv6 → false (conservative). Match on the first two octets.
  const m = /^(\d{1,3})\.(\d{1,3})\./.exec(ip.trim());
  if (!m) return false;
  return DATACENTER_V4_PREFIXES.has(`${m[1]}.${m[2]}`);
}

/**
 * Classify a funnel unit (a connect / request) as automated vs human. PURE: same
 * inputs → same output, no I/O. `deps` injectable for tests. The reason string is
 * informative only (the boolean is authoritative).
 */
export function classifyTraffic(signals: TrafficSignals, deps: ClassifyDeps = {}): TrafficVerdict {
  const ua = (signals.ua ?? '').trim();
  const ip = (signals.ip ?? '').trim();
  const isBotFn = deps.isBot ?? isbot;
  const isDatacenterIpFn = deps.isDatacenterIp ?? defaultIsDatacenterIp;

  // L0 — internal-tier (bot loopback / admin bypass). Consumes the SAME signal
  // that sets request_log.is_bot_internal (does not re-derive it).
  if (signals.isInternalTier) return { is_automated: true, reason: 'internal_tier' };

  // Un-tag escape hatch — known real MCP agents are HUMAN (beats isbot L1).
  if (ua && KNOWN_AGENT_RE.test(ua)) return { is_automated: false, reason: null };

  // L2 — explicit health-check / uptime probes.
  if (ua && HEALTH_CHECK_RE.test(ua)) return { is_automated: true, reason: 'health_check' };

  // L1 — isbot (crawler/bot + most generic HTTP clients).
  if (ua && isBotFn(ua)) return { is_automated: true, reason: 'crawler_bot' };

  // L4 — combining only: a connect-only probe from a datacenter IP with a
  // generic/empty UA and no real tool call. NEVER fires on cloud-IP alone.
  const genericOrEmptyUa = ua === '' || GENERIC_CLIENT_RE.test(ua);
  if (genericOrEmptyUa && signals.hadRealToolCall !== true && ip && isDatacenterIpFn(ip)) {
    return { is_automated: true, reason: 'datacenter_no_call_probe' };
  }

  // Default — human.
  return { is_automated: false, reason: null };
}

/** Test/diagnostic seam: the default datacenter heuristic (non-exhaustive). */
export function _defaultIsDatacenterIpForTest(ip: string): boolean {
  return defaultIsDatacenterIp(ip);
}
