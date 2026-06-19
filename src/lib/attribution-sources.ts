/**
 * ATTRIBUTION-CONNECTION-SRC-W1 — canonical SoT for per-channel acquisition
 * source, captured at the MCP **connection layer** (`?src=` query + a UA
 * heuristic fallback) and NEVER in the tools-list. That is the whole point:
 * `?src=` is set once per listing and is version-invariant, so attribution
 * never forces the cached-tools/list refresh that plagued earlier attempts.
 *
 * New channel = ONE row in {@link ATTRIBUTION_SOURCES} (+ optionally one
 * {@link UA_HEURISTICS} pattern). Default-deny: any unrecognized `?src` or UA
 * resolves to `'unknown'` (never trust a raw value through).
 *
 * Rationale correction (Cowork-ratified 2026-06-19, supersedes the spec's
 * framing): the prior track-token attempt was a HEADER
 * (`X-AlgoVault-Track-Token`, still live for TG-BROADCAST-STACK CH6) plus an
 * install-snippet header — it was **never in the tools-list**, and the
 * "tools/list cache refresh" story was a misremembering. The real blind spot
 * is **local-stdio** (`npx … TRANSPORT=stdio`): a stdio install makes no
 * outbound call to api.algovault.com, so the `npm` slug is **connect-
 * uncapturable** here. It is retained as a forward-compat placeholder (for a
 * future stdio→remote analytics proxy); npm channel VOLUME is measured via npm
 * registry download stats, not per-session. Remote-HTTP — the default
 * transport — IS fully `?src=`-capturable, so stdio is the only blind spot.
 *
 * `direct` was intentionally dropped (Cowork A4): an untagged connect is
 * genuinely `unknown`, not `direct`.
 */

/**
 * Canonical acquisition-source slugs. Order is informational only. `unknown`
 * is the default-deny terminal. `npm` is connect-uncapturable (see file
 * header) — kept as a forward-compat placeholder, NOT wired on any URL.
 */
export const ATTRIBUTION_SOURCES = [
  'chatgpt',
  'claude',
  'smithery',
  'glama',
  'pulsemcp',
  'mcp_so',
  'bazaar',
  'agentkit',
  'elizaos',
  'llamahub',
  'npm', // connect-uncapturable placeholder (stdio doesn't phone home)
  'github',
  'docs',
  'x',
  'unknown', // default-deny terminal — an untagged connect is unknown, not "direct"
] as const;

export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

/** O(1) membership set for validation. */
export const ATTRIBUTION_SOURCE_SET: ReadonlySet<string> = new Set(ATTRIBUTION_SOURCES);

export type SourceConfidence = 'deterministic' | 'heuristic' | 'unknown';

export interface ResolvedSource {
  source: AttributionSource;
  source_confidence: SourceConfidence;
}

/**
 * UA→slug heuristic map. Ordered: first match wins. Deliberately NARROW — only
 * patterns that identify an acquisition CHANNEL (not merely a generic client)
 * with reasonable confidence, to avoid false attribution. New pattern = one row.
 *
 * Note: most MCP clients (Cursor, Cline, Windsurf, …) are not channels in the
 * enum, so their UA correctly resolves to `unknown` unless `?src=`-tagged. The
 * connector channels (ChatGPT App, Claude Connectors) carry identifying UAs.
 */
const UA_HEURISTICS: ReadonlyArray<{ pattern: RegExp; source: AttributionSource }> = [
  { pattern: /chatgpt|openai/i, source: 'chatgpt' },
  { pattern: /claude|anthropic/i, source: 'claude' },
];

/** Type guard: is `v` a known attribution slug? */
export function isAttributionSource(v: unknown): v is AttributionSource {
  return typeof v === 'string' && ATTRIBUTION_SOURCE_SET.has(v);
}

/**
 * Validate a raw `?src=` value against the SoT enum. Returns the slug if known,
 * else `null` (default-deny — the caller treats `null` as "not deterministically
 * tagged" and falls through to the UA heuristic). Trimmed + lowercased; rejects
 * anything not in the enum (no raw passthrough). NOTE: there is NO length floor
 * here — unlike the track-token `TOKEN_RE` (`/^[A-Za-z0-9_-]{8,64}$/`), short
 * slugs like `x` / `npm` / `docs` are valid because they are validated against
 * the closed enum, not a free-form token regex.
 */
export function normalizeSrcParam(raw: unknown): AttributionSource | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return ATTRIBUTION_SOURCE_SET.has(v) ? (v as AttributionSource) : null;
}

/**
 * Resolve `{source, source_confidence}` from connection-layer signals.
 *
 * Precedence:
 *   1. `?src=<known slug>`   → `deterministic`
 *   2. UA heuristic match    → `heuristic`
 *   3. nothing matched       → `unknown` / `unknown`  (default-deny)
 *
 * An unrecognized `?src` is NOT trusted — it falls through to the UA heuristic,
 * then to `unknown`. `origin` / `referer` are accepted (so call sites pass them)
 * and reserved for future heuristics; no current rule consumes them.
 */
export function resolveSource(input: {
  srcParam?: unknown;
  userAgent?: unknown;
  origin?: unknown;
  referer?: unknown;
}): ResolvedSource {
  const tagged = normalizeSrcParam(input.srcParam);
  if (tagged) return { source: tagged, source_confidence: 'deterministic' };

  const ua = typeof input.userAgent === 'string' ? input.userAgent : '';
  if (ua) {
    for (const h of UA_HEURISTICS) {
      if (h.pattern.test(ua)) return { source: h.source, source_confidence: 'heuristic' };
    }
  }
  return { source: 'unknown', source_confidence: 'unknown' };
}

// ── connect-emit dedup (mirrors track-token.ts shouldEmitForRequest) ──────────
// One `mcp_connect` per resolved session_id per process. In-memory LRU; resets
// on restart/replica (re-emits one connect/session/process — the funnel-snapshot
// reads COUNT(DISTINCT session_id), so cross-process dupes collapse). Bounded to
// avoid unbounded growth in the long-lived server.
const _connectEmitted = new Set<string>();
const MAX_CONNECT_KEYS = 8192;

/**
 * Returns true the FIRST time we see `sessionId` (caller should emit the
 * `mcp_connect` row), false thereafter. Call sites MUST pass a non-empty
 * sessionId (gate on truthiness first) — the `no-session` fallback exists only
 * for defense and collapses all empty ids to one key.
 */
export function shouldEmitConnect(sessionId: string | null | undefined): boolean {
  const key = sessionId && sessionId.length > 0 ? sessionId : 'no-session';
  if (_connectEmitted.has(key)) return false;
  if (_connectEmitted.size >= MAX_CONNECT_KEYS) {
    const oldest = _connectEmitted.values().next().value;
    if (oldest !== undefined) _connectEmitted.delete(oldest);
  }
  _connectEmitted.add(key);
  return true;
}

/** Reset the connect-dedup LRU — tests only. */
export function _resetConnectDedupForTest(): void {
  _connectEmitted.clear();
}
