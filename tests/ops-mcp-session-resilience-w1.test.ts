/**
 * OPS-MCP-SESSION-RESILIENCE-W1 — stateless transport regression test.
 *
 * Encodes the bug-class-impossibility: with `sessionIdGenerator: undefined` there is NO
 * session issued or validated, so a deploy / idle-reap / restart / replica cannot orphan a
 * client — the post-deploy "every tool call fails with 'Tool execution failed'" class
 * cannot recur. Drives the REAL exported handler (`handleMcpStateless`) over a live
 * http.Server, and unit-tests the single-derivation correlation resolver (architect A1 = B).
 *
 * Importing ../src/index.js is import-safe: the entrypoint boot is guarded by
 * `if (require.main === module)`, so no port is bound and no upstream is connected here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handleMcpStateless, resolveSessionCorrelationId } from '../src/index.js';

function makeServer(): McpServer {
  const s = new McpServer({ name: 'test-stateless', version: '0.0.0' });
  s.tool('ping', async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return s;
}

let server: Server;
let base: string;

beforeAll(async () => {
  // Mirror production EXACTLY: express + express.json() + app.all('/mcp', …) → the real handler.
  const app = express();
  app.use(express.json());
  app.all('/mcp', (req, res) => {
    void handleMcpStateless(req, res, makeServer).catch(() => {
      if (!res.headersSent) res.status(500).end();
    });
  });
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => { server.close(); });

function parse(text: string): { status?: number; result?: { content?: { text?: string }[]; tools?: { name: string }[] }; error?: unknown } {
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return line ? JSON.parse(line.slice(5).trim()) : JSON.parse(text);
}
async function post(headers: Record<string, string>, body: unknown) {
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: ReturnType<typeof parse> | null = null;
  try { json = parse(text); } catch { /* leave null */ }
  return { status: r.status, sessionId: r.headers.get('mcp-session-id'), json };
}

describe('OPS-MCP-SESSION-RESILIENCE-W1 — stateless /mcp (bug-class impossibility)', () => {
  it('(a) answers a bare tools/call with NO prior initialize', async () => {
    const r = await post({}, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ping', arguments: {} } });
    expect(r.status).toBe(200);
    expect(r.json?.error).toBeUndefined();
    expect(r.json?.result?.content?.[0]?.text).toBe('pong');
  });

  it('(b) issues NO Mcp-Session-Id', async () => {
    const r = await post({}, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(r.status).toBe(200);
    expect(r.sessionId).toBeNull();
  });

  it('(c) still answers a request carrying a random STALE Mcp-Session-Id (ignored)', async () => {
    const r = await post(
      { 'mcp-session-id': 'deadbeef-1111-2222-3333-444455556666' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ping', arguments: {} } },
    );
    expect(r.status).toBe(200);
    expect(r.json?.error).toBeUndefined();
    expect(r.json?.result?.content?.[0]?.text).toBe('pong');
  });

  it('(d) GET and DELETE → 405', async () => {
    for (const method of ['GET', 'DELETE'] as const) {
      const r = await fetch(base, { method, headers: { Accept: 'application/json, text/event-stream' } });
      expect(r.status).toBe(405);
    }
  });
});

describe('resolveSessionCorrelationId — single-derivation precedence (architect A1 = Option B)', () => {
  it('track-token wins when a valid one is present', () => {
    expect(resolveSessionCorrelationId({ 'x-algovault-track-token': 'tracktoken_abc123' }, 'iphash_xyz')).toBe('tracktoken_abc123');
  });
  it('falls back to ipHash (= the free:${ipHash} quota id) when no track-token', () => {
    expect(resolveSessionCorrelationId({}, 'iphash_xyz')).toBe('iphash_xyz');
  });
  it('ignores a malformed track-token and falls back to ipHash', () => {
    expect(resolveSessionCorrelationId({ 'x-algovault-track-token': 'short' }, 'iphash_xyz')).toBe('iphash_xyz');
  });
  it('never returns null/empty — uuid last resort when both absent', () => {
    const v = resolveSessionCorrelationId({}, '');
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});
