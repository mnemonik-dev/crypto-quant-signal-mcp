/**
 * BOT-W1 / D1-C — internal-bypass tier tests.
 *
 * Verifies the X-AlgoVault-Internal-Key header gate added 2026-05-08:
 * - two-flag firewall (BOT_INTERNAL_BYPASS_ENABLED + key match)
 * - resolves to tier:'internal' with no quota counter tick
 * - tier appears in checkQuota / trackCall as Infinity-quota
 * - getMonthlyQuota('internal') = Infinity
 *
 * The bypass is consumed by the public Telegram bot (algovault-bot) running on
 * the same Hetzner host. Bot-side enforces user-level quota in its own SQLite.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkQuota,
  getMonthlyQuota,
  resolveLicense,
  resolveLicenseSync,
  trackCall,
} from '../src/lib/license.js';

const VALID_KEY = 'a'.repeat(32);

describe('BOT-W1 internal-bypass tier', () => {
  const orig_enabled = process.env.BOT_INTERNAL_BYPASS_ENABLED;
  const orig_key = process.env.ALGOVAULT_INTERNAL_BYPASS_KEY;

  beforeEach(() => {
    process.env.BOT_INTERNAL_BYPASS_ENABLED = 'true';
    process.env.ALGOVAULT_INTERNAL_BYPASS_KEY = VALID_KEY;
  });

  afterEach(() => {
    if (orig_enabled === undefined) delete process.env.BOT_INTERNAL_BYPASS_ENABLED;
    else process.env.BOT_INTERNAL_BYPASS_ENABLED = orig_enabled;
    if (orig_key === undefined) delete process.env.ALGOVAULT_INTERNAL_BYPASS_KEY;
    else process.env.ALGOVAULT_INTERNAL_BYPASS_KEY = orig_key;
  });

  it('resolveLicenseSync: returns internal tier on matching key', () => {
    const license = resolveLicenseSync({ 'x-algovault-internal-key': VALID_KEY });
    expect(license.tier).toBe('internal');
  });

  it('resolveLicenseSync: rejects mismatched key', () => {
    const license = resolveLicenseSync({ 'x-algovault-internal-key': 'wrong' });
    expect(license.tier).toBe('free');
  });

  it('resolveLicenseSync: rejects when outer flag is off', () => {
    process.env.BOT_INTERNAL_BYPASS_ENABLED = 'false';
    const license = resolveLicenseSync({ 'x-algovault-internal-key': VALID_KEY });
    expect(license.tier).toBe('free');
  });

  it('resolveLicenseSync: rejects when key env var is empty', () => {
    process.env.ALGOVAULT_INTERNAL_BYPASS_KEY = '';
    const license = resolveLicenseSync({ 'x-algovault-internal-key': VALID_KEY });
    expect(license.tier).toBe('free');
  });

  it('resolveLicenseSync: rejects when key env var is too short (<16)', () => {
    process.env.ALGOVAULT_INTERNAL_BYPASS_KEY = 'short';
    const license = resolveLicenseSync({ 'x-algovault-internal-key': 'short' });
    expect(license.tier).toBe('free');
  });

  it('resolveLicenseSync: case-insensitive header lookup', () => {
    const license = resolveLicenseSync({ 'X-AlgoVault-Internal-Key': VALID_KEY });
    expect(license.tier).toBe('internal');
  });

  it('resolveLicense (async): returns internal tier on matching key', async () => {
    const { license } = await resolveLicense({ 'x-algovault-internal-key': VALID_KEY });
    expect(license.tier).toBe('internal');
  });

  it('getMonthlyQuota("internal") = Infinity', () => {
    expect(getMonthlyQuota('internal')).toBe(Infinity);
  });

  it('checkQuota for internal tier: allowed=true, infinite remaining, no count', () => {
    const r = checkQuota({ tier: 'internal', key: null });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(Infinity);
    expect(r.used).toBe(0);
    expect(r.total).toBe(Infinity);
  });

  it('trackCall for internal tier: does not increment any counter', () => {
    const r1 = trackCall({ tier: 'internal', key: null });
    const r2 = trackCall({ tier: 'internal', key: null });
    expect(r1.used).toBe(0);
    expect(r2.used).toBe(0);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});
