/**
 * FUNNEL-FIX-ATTRIBUTION-W1 — classifySource() + referer + LLM-client map (pure).
 * AC2 (LLM clients / referrers no longer 'unknown'), precedence, default-deny to 'unknown',
 * and the log-only unmatched-UA sampler (no DB / no PII).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifySource, classifyReferer, resolveSource, mediumForSource } from '../src/lib/attribution-sources.js';
import { matchLlmClientUa, logUnmatchedUa, _resetUaSamplesForTest } from '../src/lib/llm-clients.js';
import { taggedLink, isInternalOrRelative } from '../src/lib/tagged-link.js';

describe('classifySource — precedence + medium/confidence', () => {
  it('(1) explicit ?src= wins, deterministic', () => {
    expect(classifySource({ srcParam: 'producthunt', referer: 'https://x.com/a', userAgent: 'claude' }))
      .toEqual({ source: 'producthunt', medium: 'listing', confidence: 'deterministic' });
  });
  it('(2) Referer domain when no ?src=, deterministic', () => {
    expect(classifySource({ referer: 'https://dev.to/algovault' }))
      .toEqual({ source: 'devto', medium: 'referral', confidence: 'deterministic' });
    expect(classifySource({ referer: 'https://www.producthunt.com/posts/x' }).source).toBe('producthunt');
    expect(classifySource({ referer: 'https://github.com/AlgoVaultLabs' }).source).toBe('github');
    expect(classifySource({ referer: 'https://www.google.com/search?q=x' })).toMatchObject({ source: 'organic', medium: 'organic' });
  });
  it('(3) LLM-client UA when no ?src/referer, heuristic', () => {
    expect(classifySource({ userAgent: 'claude-user/1.0 anthropic' }))
      .toEqual({ source: 'claude', medium: 'agent', confidence: 'heuristic' });
  });
  it('(4) default-deny to unknown/direct — never fabricated', () => {
    expect(classifySource({ userAgent: 'python-requests/2.31' }))
      .toEqual({ source: 'unknown', medium: 'direct', confidence: 'unknown' });
    expect(classifySource({})).toEqual({ source: 'unknown', medium: 'direct', confidence: 'unknown' });
  });
});

describe('classifyReferer', () => {
  it('maps known hosts (subdomain-safe), null on unknown/unparseable', () => {
    expect(classifyReferer('https://x.com/algovault')).toBe('x');
    expect(classifyReferer('https://mobile.twitter.com/x')).toBe('x');
    expect(classifyReferer('https://lobehub.com/mcp/algovault')).toBe('lobehub');
    expect(classifyReferer('https://some-random-blog.example/x')).toBeNull();
    expect(classifyReferer('not a url')).toBeNull();
    expect(classifyReferer(null)).toBeNull();
    // must not be fooled by a lookalike host containing the brand as a substring
    expect(classifyReferer('https://x.com.evil.example/x')).toBeNull();
  });
});

describe('matchLlmClientUa — observed-only seed (Mr.1: no guessed UAs)', () => {
  it('matches observed clients; returns null for not-yet-observed (cursor/windsurf)', () => {
    expect(matchLlmClientUa('claude-desktop anthropic')).toBe('claude');
    expect(matchLlmClientUa('ChatGPT/1.0')).toBe('chatgpt');
    expect(matchLlmClientUa('Cursor/0.42')).toBeNull(); // NOT seeded until a real UA is observed
    expect(matchLlmClientUa('')).toBeNull();
  });
});

describe('logUnmatchedUa — log-only sampler (no DB, no PII), deduped + bounded', () => {
  beforeEach(() => _resetUaSamplesForTest());
  it('logs a truncated sample once per distinct UA; skips short/empty', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logUnmatchedUa('SomeNewMcpClient/2.0 (details...)');
    logUnmatchedUa('SomeNewMcpClient/2.0 (details...)'); // dup → no second log
    logUnmatchedUa('');
    logUnmatchedUa(undefined);
    expect(spy.mock.calls.filter(c => String(c[0]).includes('unmatched-UA'))).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('resolveSource back-compat + mediumForSource', () => {
  it('resolveSource still returns {source, source_confidence} (existing capture-hook shape)', () => {
    expect(resolveSource({ srcParam: 'claude' })).toEqual({ source: 'claude', source_confidence: 'deterministic' });
    expect(resolveSource({ referer: 'https://npmjs.com/package/x' })).toEqual({ source: 'npm', source_confidence: 'deterministic' });
  });
  it('mediumForSource buckets each source; unknown → direct', () => {
    expect(mediumForSource('cursor')).toBe('agent');
    expect(mediumForSource('smithery')).toBe('listing');
    expect(mediumForSource('x')).toBe('social');
    expect(mediumForSource('unknown')).toBe('direct');
  });
});

describe('taggedLink — owned links only, NEVER internal (AC5 canary)', () => {
  it('tags absolute AlgoVault https links; idempotent', () => {
    expect(taggedLink('https://algovault.com/signup', 'npm')).toContain('utm_source=npm');
    expect(taggedLink('https://api.algovault.com/mcp', 'x', 'bio')).toMatch(/utm_source=x&utm_medium=bio|utm_medium=bio&utm_source=x/);
    // idempotent: an existing utm_source is preserved
    expect(taggedLink('https://algovault.com/?utm_source=existing', 'npm')).toContain('utm_source=existing');
  });
  it('NEVER tags internal/relative or external links (no attribution laundering)', () => {
    expect(taggedLink('/welcome', 'npm')).toBe('/welcome'); // relative internal → untouched
    expect(taggedLink('/dashboard/funnel', 'x')).toBe('/dashboard/funnel');
    expect(taggedLink('https://evil.com/x', 'npm')).toBe('https://evil.com/x'); // not ours → untouched
    expect(taggedLink('http://algovault.com/x', 'npm')).toBe('http://algovault.com/x'); // non-https → untouched
    expect(taggedLink('https://algovault.com.evil.example/x', 'npm')).toBe('https://algovault.com.evil.example/x'); // lookalike host
  });
  it('isInternalOrRelative flags the never-tag set', () => {
    expect(isInternalOrRelative('/welcome')).toBe(true);
    expect(isInternalOrRelative('https://evil.com')).toBe(true);
    expect(isInternalOrRelative('https://algovault.com/x')).toBe(false);
  });
});
