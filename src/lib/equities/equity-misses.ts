/**
 * EQUITY-LAUNCH-READINESS-W1 R1 — out-of-universe demand instrumentation.
 *
 * Fire-and-forget durable record of every SYMBOL_NOT_IN_UNIVERSE request — the
 * demand signal for a future 500→1000 universe bump. NEVER throws into the tool
 * response (fail-open with a success/fail log line). Stores the normalized
 * symbol; preserves the raw input only when it differs.
 */
import type { Pool } from 'pg';

// EQ-02 / OPS-AUDIT-REMEDIATION-MED-W1 — bound the write to prevent table-bloat
// DoS (an attacker spamming bogus symbols → unbounded INSERTs). Two default-deny
// gates BEFORE the insert (no schema change): a per-symbol cooldown (the same
// symbol can't re-insert within COOLDOWN_SEC — kills repeat-spam) + a global
// per-window cap (≤ WINDOW_CAP inserts per WINDOW_SEC — caps distinct-symbol
// spam). The in-memory map is itself bounded (evict-expired + a hard size cap).
const COOLDOWN_SEC = 300;       // per-symbol: skip a re-insert within 5 min
const WINDOW_SEC = 3600;        // global rolling window: 1 hour
const WINDOW_CAP = 100;         // ≤ 100 inserts per hour across all symbols
const MAP_MAX = 2000;           // hard cap on the dedup map size
const recentMisses = new Map<string, number>(); // symbol → last-insert epoch sec
let windowStart = 0;
let windowCount = 0;

/** Test seam — reset the in-memory bound state between cases. */
export function _resetMissBoundForTest(): void {
  recentMisses.clear();
  windowStart = 0;
  windowCount = 0;
}

export async function recordSymbolMiss(
  pool: Pool, normalized: string, rawInput: string | null | undefined
): Promise<void> {
  try {
    const raw = String(rawInput ?? '');
    const stored = normalized || raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 32) || 'UNKNOWN';
    const nowSec = Math.floor(Date.now() / 1000);

    // Per-symbol cooldown (default-deny the repeat).
    const last = recentMisses.get(stored);
    if (last !== undefined && nowSec - last < COOLDOWN_SEC) return;

    // Global per-window cap (default-deny over the cap).
    if (nowSec - windowStart >= WINDOW_SEC) { windowStart = nowSec; windowCount = 0; }
    if (windowCount >= WINDOW_CAP) {
      console.warn(`[equity-misses] window cap (${WINDOW_CAP}/${WINDOW_SEC}s) reached — skipping insert for symbol=${stored}`);
      return;
    }

    const rawCol = raw && raw.toUpperCase() !== stored ? raw.slice(0, 64) : null;
    await pool.query('INSERT INTO equity_symbol_misses (symbol, raw_input) VALUES ($1, $2)', [stored, rawCol]);
    windowCount += 1;

    // Record + bound the dedup map (evict expired, then hard size cap = evict oldest).
    recentMisses.set(stored, nowSec);
    if (recentMisses.size > MAP_MAX) {
      for (const [k, t] of recentMisses) {
        if (nowSec - t >= COOLDOWN_SEC) recentMisses.delete(k);
      }
      while (recentMisses.size > MAP_MAX) {
        const oldest = recentMisses.keys().next().value;
        if (oldest === undefined) break;
        recentMisses.delete(oldest);
      }
    }
    console.log(`[equity-misses] recorded out-of-universe request symbol=${stored}`);
  } catch (e) {
    // Fail-open: instrumentation must never break or delay the tool response.
    console.warn(`[equity-misses] write failed (fail-open): ${(e as Error).message}`);
  }
}
