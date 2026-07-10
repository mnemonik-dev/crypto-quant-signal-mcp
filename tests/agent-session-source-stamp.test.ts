/**
 * FUNNEL-FIX-ATTRIBUTION-W1 — agent_sessions first_touch_source is WRITE-ONCE (AC3),
 * last_touch_source updates only when the hit carries a source. Local SQLite; skipped when
 * DATABASE_URL is set (won't touch PG).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertAgentSession, dbQuery, dbRun } from '../src/lib/performance-db.js';

const SKIP = process.env.DATABASE_URL ? 'DATABASE_URL set' : '';
const d = SKIP ? describe.skip : describe;
const SID = 'attr-stamp-test-session';

async function row(): Promise<{ first_touch_source: string | null; last_touch_source: string | null } | null> {
  const r = await dbQuery<{ first_touch_source: string | null; last_touch_source: string | null }>(
    'SELECT first_touch_source, last_touch_source FROM agent_sessions WHERE session_id = ?', [SID]);
  return r.length ? r[0] : null;
}

d('agent_sessions first-touch stamp', () => {
  beforeAll(async () => { await dbQuery('SELECT 1'); dbRun('DELETE FROM agent_sessions WHERE session_id = ?', SID); });
  afterAll(() => { try { dbRun('DELETE FROM agent_sessions WHERE session_id = ?', SID); } catch { /* ignore */ } });

  it('first call stamps first_touch + last_touch to the classified source', async () => {
    await upsertAgentSession({ sessionId: SID, tool: 'get_trade_call', tier: 'free', ipHash: 'h1', source: 'claude' });
    expect(await row()).toEqual({ first_touch_source: 'claude', last_touch_source: 'claude' });
  });

  it('a later hit from a DIFFERENT source updates last_touch but NOT first_touch (write-once)', async () => {
    await upsertAgentSession({ sessionId: SID, tool: 'get_market_regime', tier: 'free', ipHash: 'h1', source: 'x' });
    expect(await row()).toEqual({ first_touch_source: 'claude', last_touch_source: 'x' });
  });

  it('a hit with NO source leaves both untouched (COALESCE guards)', async () => {
    await upsertAgentSession({ sessionId: SID, tool: 'get_trade_call', tier: 'free', ipHash: 'h1', source: null });
    expect(await row()).toEqual({ first_touch_source: 'claude', last_touch_source: 'x' });
  });
});
