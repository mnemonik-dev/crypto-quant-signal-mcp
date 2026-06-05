/**
 * OPS-POSTGRES-MEM-RIGHTSIZE-W1 — pure verdict logic for the monitor's PFE
 * win-rate check, split out of monitor.ts (which runs main() on import) so it
 * is unit-testable. `checkPfeWinRate` fetches the server-side-cached
 * /api/performance-public surface and passes the parsed body here, instead of
 * recomputing the full ~6 s / 152k-row stats query in the cold cron process.
 *
 * Alert ONLY on a KNOWN win rate below the floor. An unknown rate (null /
 * missing / non-numeric — no matured data, or a transient malformed body) is
 * never treated as a drop; an outright endpoint/server outage is caught by the
 * separate server_health + database checks.
 */
export const PFE_WR_FLOOR = 0.85;

export function evaluatePfeWinRate(data: unknown): { error: string | null; rate: number | null } {
  const raw = (data as { overall?: { pfeWinRate?: unknown } } | null | undefined)?.overall?.pfeWinRate;
  const rate = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  if (rate !== null && rate < PFE_WR_FLOOR) {
    return { error: `PFE win rate dropped to ${(rate * 100).toFixed(1)}% (< 85%)`, rate };
  }
  return { error: null, rate };
}

/**
 * Internal URL for the monitor's PFE check — hits the co-located server on
 * 127.0.0.1:$PORT directly instead of the public api.algovault.com host. The
 * monitor runs via `docker exec` in the SAME container as the server (PID 1,
 * listening on $PORT, default 3000), so the loopback is reliable + fast. The
 * public hairpin (container → Cloudflare → back) intermittently returned
 * HTTP 0 when the ~4.7 s cache-miss recompute brushed the 5 s fetch timeout.
 */
export function internalPerfPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.PORT && /^\d+$/.test(env.PORT) ? env.PORT : '3000';
  return `http://127.0.0.1:${port}/api/performance-public`;
}
