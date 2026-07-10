/**
 * FUNNEL-FIX-ATTRIBUTION-W1 — canonical UTM tagger for OWNED outbound links that point INTO
 * AlgoVault (README, X bio, registry "homepage" URLs, dev.to/Discussions CTAs).
 *
 * HARD RULE: only tags absolute https URLs whose host is algovault.com / api.algovault.com.
 * It REFUSES relative/internal links and any non-AlgoVault host — tagging an internal link
 * would OVERWRITE first-touch (attribution laundering), so the guard is structural, not advisory.
 * Idempotent: an existing utm_source is left as-is.
 */
const ALGOVAULT_HOSTS = new Set(['algovault.com', 'www.algovault.com', 'api.algovault.com']);

/** Canonical lowercase medium taxonomy (Q4). */
export type UtmMedium = 'listing' | 'launch' | 'post' | 'bio' | 'readme' | 'discussion';

/**
 * Return `url` with `utm_source=<channel>&utm_medium=<medium>` appended, IF `url` is an
 * absolute AlgoVault https URL. Otherwise returns `url` UNCHANGED (never tags internal links).
 * `channel` is a lowercase owned-channel slug (e.g. 'npm', 'x', 'producthunt').
 */
export function taggedLink(url: string, channel: string, medium: UtmMedium = 'listing'): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; } // relative/invalid → NEVER tag
  if (u.protocol !== 'https:') return url;
  if (!ALGOVAULT_HOSTS.has(u.hostname.toLowerCase())) return url; // external host → not ours → NEVER tag
  const chan = channel.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,32}$/.test(chan)) return url; // reject junk channel slugs
  if (!u.searchParams.has('utm_source')) {
    u.searchParams.set('utm_source', chan);
    u.searchParams.set('utm_medium', medium);
  }
  return u.toString();
}

/** Canary: true if `url` is an internal/relative link that must NEVER be tagged. */
export function isInternalOrRelative(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol !== 'https:' || !ALGOVAULT_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return true; // relative → internal
  }
}
