/**
 * EQUITY-LAUNCH-READINESS-W1 R1 — out-of-universe demand instrumentation.
 *
 * Fire-and-forget durable record of every SYMBOL_NOT_IN_UNIVERSE request — the
 * demand signal for a future 500→1000 universe bump. NEVER throws into the tool
 * response (fail-open with a success/fail log line). Stores the normalized
 * symbol; preserves the raw input only when it differs.
 */
import type { Pool } from 'pg';

export async function recordSymbolMiss(
  pool: Pool, normalized: string, rawInput: string | null | undefined
): Promise<void> {
  try {
    const raw = String(rawInput ?? '');
    const stored = normalized || raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 32) || 'UNKNOWN';
    const rawCol = raw && raw.toUpperCase() !== stored ? raw.slice(0, 64) : null;
    await pool.query('INSERT INTO equity_symbol_misses (symbol, raw_input) VALUES ($1, $2)', [stored, rawCol]);
    console.log(`[equity-misses] recorded out-of-universe request symbol=${stored}`);
  } catch (e) {
    // Fail-open: instrumentation must never break or delay the tool response.
    console.warn(`[equity-misses] write failed (fail-open): ${(e as Error).message}`);
  }
}
