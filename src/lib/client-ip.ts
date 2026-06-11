/**
 * OPS-MCP-DEFENSE-IN-DEPTH-W1 R2 — single-derivation client-IP source.
 *
 * Every IP-derivation site (free-tier quota key, signup attribution, x402 HTTP
 * quota) MUST go through this helper instead of parsing `x-forwarded-for` /
 * `x-real-ip` headers manually. `req.ip` is Express's framework-derived client
 * address under `app.set('trust proxy', 1)` (index.ts) — it resolves the
 * nearest-TRUSTED-hop value, where a raw leftmost-XFF parse takes the
 * attacker-writable end of the chain the moment any proxy hop appends instead
 * of replacing. Under the deployed single-Caddy replace-mode topology
 * (`header_up X-Forwarded-For {remote_host}`) the two are byte-identical, so
 * adopting this helper changes no live quota bucket or analytics hash
 * (regression-pinned in tests/client-ip-helper.test.ts).
 *
 * Returns '' when `req.ip` is absent (callers keep their own fallback semantics,
 * e.g. `|| 'unknown'` at the quota sites, `null` hash at the attribution site).
 */
export function clientIp(req: { ip?: string | undefined }): string {
  return req.ip || '';
}
