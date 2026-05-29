/**
 * WEBHOOK-HARDENING-W1 (2026-05-29): SSRF egress guard.
 *
 * Reusable allowlist for ALL outbound HTTP to user-supplied URLs (webhook
 * delivery today; P0-3 adapters / any future fetch-to-user-URL tomorrow).
 * Retires the "unchecked egress" bug class.
 *
 * Two entry points:
 *   - assertEgressAllowed(url)        — SYNC: scheme + embedded-creds + literal-IP
 *                                        class checks. Used at REGISTRATION (a
 *                                        hostname can't be resolved yet — the
 *                                        async guard below catches it at delivery).
 *   - resolveAndAssertEgress(url,opts) — ASYNC: runs the sync checks, then
 *                                        dns.lookup(host, {all:true}) and runs
 *                                        EVERY resolved A/AAAA through the same
 *                                        IP-class block (DNS-rebind defense).
 *
 * Prod policy: https-only; block loopback / link-local / private / ULA / CGNAT /
 * unspecified literal + resolved IPs; reject `user:pass@host` creds. The
 * `WEBHOOK_SSRF_ALLOW_LOOPBACK=1` test seam (default off) permits loopback
 * (127/8, ::1, `localhost`) + `http` FOR LOOPBACK ONLY, so the W1 local-sink
 * tests run; nothing else is relaxed.
 *
 * MUST NOT: send HTTP, contain business logic. Pure validation.
 */
import net from 'node:net';
import dns from 'node:dns';

export type EgressBlockCode =
  | 'invalid_url'
  | 'embedded_credentials'
  | 'insecure_scheme'
  | 'disallowed_scheme'
  | 'blocked_ip';

export class EgressBlockedError extends Error {
  readonly code: EgressBlockCode;
  readonly reason: string;
  constructor(code: EgressBlockCode, reason: string) {
    super(`egress blocked (${code}): ${reason}`);
    this.code = code;
    this.reason = reason;
    Object.setPrototypeOf(this, EgressBlockedError.prototype);
  }
}

export interface IpClass {
  blocked: boolean;
  isLoopback: boolean;
  reason: string;
}

function loopbackSeamOn(): boolean {
  return process.env.WEBHOOK_SSRF_ALLOW_LOOPBACK === '1';
}

/** Classify an IPv4 literal against the SSRF block ranges. */
export function classifyIpv4(ip: string): IpClass {
  const parts = ip.split('.');
  if (parts.length !== 4) return { blocked: true, isLoopback: false, reason: 'invalid_ipv4' };
  const o = parts.map((p) => Number(p));
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return { blocked: true, isLoopback: false, reason: 'invalid_ipv4' };
  }
  const [a, b] = o;
  if (a === 127) return { blocked: true, isLoopback: true, reason: 'loopback 127.0.0.0/8' };
  if (a === 0) return { blocked: true, isLoopback: false, reason: 'unspecified/this-network 0.0.0.0/8' };
  if (a === 10) return { blocked: true, isLoopback: false, reason: 'private 10.0.0.0/8' };
  if (a === 172 && b >= 16 && b <= 31) return { blocked: true, isLoopback: false, reason: 'private 172.16.0.0/12' };
  if (a === 192 && b === 168) return { blocked: true, isLoopback: false, reason: 'private 192.168.0.0/16' };
  if (a === 169 && b === 254) return { blocked: true, isLoopback: false, reason: 'link-local 169.254.0.0/16' };
  if (a === 100 && b >= 64 && b <= 127) return { blocked: true, isLoopback: false, reason: 'CGNAT 100.64.0.0/10' };
  return { blocked: false, isLoopback: false, reason: 'public' };
}

/** Classify an IPv6 literal against the SSRF block ranges (+ IPv4-mapped). */
export function classifyIpv6(ip: string): IpClass {
  const s = ip.toLowerCase().split('%')[0]; // strip zone id
  const mapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return classifyIpv4(mapped[1]);
  if (s === '::1') return { blocked: true, isLoopback: true, reason: 'loopback ::1' };
  if (s === '::') return { blocked: true, isLoopback: false, reason: 'unspecified ::' };
  const head = s.split(':')[0];
  if (/^fe[89ab]/.test(head)) return { blocked: true, isLoopback: false, reason: 'link-local fe80::/10' };
  if (/^f[cd]/.test(head)) return { blocked: true, isLoopback: false, reason: 'ULA fc00::/7' };
  return { blocked: false, isLoopback: false, reason: 'public' };
}

/** Classify any IP literal; returns null if `value` is not an IP (i.e. a hostname). */
export function classifyIp(value: string): IpClass | null {
  const v = net.isIP(value);
  if (v === 4) return classifyIpv4(value);
  if (v === 6) return classifyIpv6(value);
  return null;
}

function isLoopbackHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost');
}

/** WHATWG URL.hostname wraps IPv6 literals in brackets ([::1]); strip for net.isIP. */
function unbracket(host: string): string {
  return host.replace(/^\[(.+)\]$/, '$1');
}

/** Throw if a classified IP is disallowed (honoring the loopback seam). */
function assertIpAllowed(ipClass: IpClass, context: string): void {
  if (!ipClass.blocked) return;
  if (ipClass.isLoopback && loopbackSeamOn()) return; // test seam
  throw new EgressBlockedError('blocked_ip', `${context}: ${ipClass.reason}`);
}

/**
 * SYNC guard: scheme + embedded-creds + literal-IP class. Throws
 * EgressBlockedError on any violation. Hostnames pass here (resolved at
 * delivery by resolveAndAssertEgress).
 */
export function assertEgressAllowed(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EgressBlockedError('invalid_url', 'not a valid URL');
  }

  if (url.username || url.password) {
    throw new EgressBlockedError('embedded_credentials', 'userinfo (user:pass@) not allowed');
  }

  const host = unbracket(url.hostname);
  const ipClass = classifyIp(host);
  const loopbackHost = (ipClass?.isLoopback ?? false) || isLoopbackHostname(host);

  // Scheme: https only; http permitted ONLY for loopback under the test seam.
  if (url.protocol === 'http:') {
    if (!(loopbackSeamOn() && loopbackHost)) {
      throw new EgressBlockedError('insecure_scheme', 'http not allowed (https required)');
    }
  } else if (url.protocol !== 'https:') {
    throw new EgressBlockedError('disallowed_scheme', `scheme ${url.protocol} not allowed`);
  }

  // Literal IP host → class-check now.
  if (ipClass) assertIpAllowed(ipClass, `literal host ${host}`);

  return url;
}

export interface ResolveEgressOpts {
  /** Injectable resolver (default dns.promises.lookup) — for hermetic tests + rebind tests. */
  lookup?: (host: string, opts: { all: true }) => Promise<{ address: string; family: number }[]>;
}

/**
 * ASYNC guard: sync checks + resolve the host and run EVERY A/AAAA through the
 * IP-class block (DNS-rebind defense). Throws EgressBlockedError on any
 * disallowed address.
 */
export async function resolveAndAssertEgress(rawUrl: string, opts: ResolveEgressOpts = {}): Promise<void> {
  const url = assertEgressAllowed(rawUrl); // scheme/creds/literal-IP
  const host = unbracket(url.hostname);

  // Literal IP already validated by assertEgressAllowed — no DNS needed.
  if (classifyIp(host)) return;

  const lookup = opts.lookup ?? ((h, o) => dns.promises.lookup(h, o));
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    // NXDOMAIN / resolver failure → fail closed (can't prove it's safe).
    throw new EgressBlockedError('blocked_ip', `host ${host} did not resolve`);
  }
  if (!addrs || addrs.length === 0) {
    throw new EgressBlockedError('blocked_ip', `host ${host} resolved to no addresses`);
  }
  for (const a of addrs) {
    const ipClass = classifyIp(a.address);
    if (ipClass) assertIpAllowed(ipClass, `host ${host} resolves to ${a.address}`);
  }
}
