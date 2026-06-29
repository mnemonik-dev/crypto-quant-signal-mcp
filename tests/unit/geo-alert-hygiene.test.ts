/**
 * OPS-GEO-PROBE-SIGNIFICANCE-GATE-W1 — the alert-hygiene significance gate.
 *
 * `isSignificantDecline(history, cfg)` is the ONE place the SLIPPING / WoW-WARNING
 * gate is computed (single-derivation across the digest verdict, the dashboard
 * banner, and the cron's Telegram alert). It fires 🔴 only on a statistically
 * meaningful, SUSTAINED citation decline — never on tiny-sample noise.
 *
 * `history` is the weekly cited-answer counts, MOST-RECENT-FIRST
 * (h[0] = this week, h[1] = last week, h[2] = two weeks ago, …).
 *
 * The 5 required cases (+ the 0.16 hard-floor clamp + the single-derivation lock):
 *   (a) 2→0 with n=2          → HOLDING (low sample), NOT slipping  ⇒ no TG
 *   (b) one 30% down-week n≥5  → HOLDING (1 down-week, watching)
 *   (c) two ≥20% down-weeks n≥5→ SLIPPING                            ⇒ TG fires
 *   (d) a 10% drop (sub-floor) → never fires
 *   (e) the gate is computed ONLY in this helper (grep digest + dashboard)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isSignificantDecline,
  resolveAlertHygiene,
  DEFAULT_ALERT_HYGIENE,
  ALERT_HYGIENE_HARD_FLOOR,
  type AlertHygieneConfig,
} from '../../src/lib/geo-alert-hygiene.js';

const cfg: AlertHygieneConfig = DEFAULT_ALERT_HYGIENE; // floor 5, drop 0.20, 2 consecutive

describe('isSignificantDecline — the SLIPPING / WoW significance gate', () => {
  // (a) the exact Mon-29 false alarm: a 2→0 citation move on n=2. Baseline below the
  //     sample floor ⇒ HOLDING (low sample). Because the cron gates the TG WARNING on
  //     `slipping`, slipping:false here is the proof that NO Telegram alert fires.
  it('(a) 2→0 with n=2 → HOLDING (low sample), never SLIPPING (⇒ no TG)', () => {
    const v = isSignificantDecline([0, 2], cfg);
    expect(v.slipping).toBe(false);
    expect(v.reason).toContain('low sample');
    expect(v.reason).toContain('2');
  });

  // (b) one genuine 30% down-week with a healthy baseline, but the prior week was flat
  //     → only ONE down-cycle < the 2 required ⇒ HOLDING (watching), not yet SLIPPING.
  it('(b) single 30% down-week with n≥5 → HOLDING (1 down-week, watching)', () => {
    const v = isSignificantDecline([7, 10, 10], cfg);
    expect(v.slipping).toBe(false);
    expect(v.reason).toContain('1 down-week');
  });

  // (c) two consecutive ≥20% down-weeks, both above the sample floor → SLIPPING.
  //     (10→8 = 20%, 8→6 = 25%.) This is the only shape that fires the alarm + TG.
  it('(c) two consecutive ≥20% down-weeks with n≥5 → SLIPPING (⇒ TG fires)', () => {
    const v = isSignificantDecline([6, 8, 10], cfg);
    expect(v.slipping).toBe(true);
    expect(v.reason).toContain('sustained');
  });

  // (d) a 10% drop is below the relative-drop floor → not even a down-cycle → never fires.
  it('(d) a 10% drop (below the 20% floor) → never fires', () => {
    const v = isSignificantDecline([9, 10, 10], cfg);
    expect(v.slipping).toBe(false);
    expect(v.reason).toContain('within noise');
  });

  // Guard rails around the gate.
  it('does not fire without a prior-week baseline (single data point)', () => {
    expect(isSignificantDecline([0], cfg).slipping).toBe(false);
    expect(isSignificantDecline([], cfg).slipping).toBe(false);
  });

  it('the exact 20% boundary still counts as a down-cycle (≥, not >)', () => {
    // 100→80→64 — both transitions land on EXACTLY 20% (16/80 and 20/100), integers
    // chosen so the ratio is the same IEEE754 double as the 0.20 literal (no fp slack).
    expect(isSignificantDecline([64, 80, 100], cfg).slipping).toBe(true);
  });

  it('a recovered this-week (up move) is never SLIPPING even after prior dips', () => {
    expect(isSignificantDecline([12, 8, 10], cfg).slipping).toBe(false);
  });
});

describe('resolveAlertHygiene — config from geo-objective.yaml (0.16 hard floor)', () => {
  it('maps snake_case yaml → camelCase config', () => {
    const c = resolveAlertHygiene({ min_baseline_citations: 8, min_relative_drop: 0.3, consecutive_down_cycles: 3 });
    expect(c).toEqual({ minBaselineCitations: 8, minRelativeDrop: 0.3, consecutiveDownCycles: 3 });
  });

  it('clamps min_relative_drop UP to the 0.16 research noise floor — config may raise, never lower below it', () => {
    expect(resolveAlertHygiene({ min_relative_drop: 0.1 }).minRelativeDrop).toBe(ALERT_HYGIENE_HARD_FLOOR);
    expect(resolveAlertHygiene({ min_relative_drop: 0.05 }).minRelativeDrop).toBe(0.16);
    // a higher value is honored (raising is allowed)
    expect(resolveAlertHygiene({ min_relative_drop: 0.35 }).minRelativeDrop).toBe(0.35);
  });

  it('falls back to defaults on missing / NaN / non-finite (default-deny on bad input)', () => {
    expect(resolveAlertHygiene(undefined)).toEqual(DEFAULT_ALERT_HYGIENE);
    expect(resolveAlertHygiene({ min_baseline_citations: NaN }).minBaselineCitations).toBe(5);
    expect(resolveAlertHygiene({ consecutive_down_cycles: undefined }).consecutiveDownCycles).toBe(2);
  });

  it('the hard floor still clamps a yaml that tries to lower the drop below 0.16', () => {
    // even if a future edit sets min_relative_drop: 0.1 in the SoT, the gate never softens below 0.16.
    expect(resolveAlertHygiene({ min_relative_drop: 0.0 }).minRelativeDrop).toBe(0.16);
  });
});

describe('(e) single-derivation: the gate is computed ONLY in isSignificantDecline', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('the digest + dashboard both delegate to the shared helper — no inline WoW-threshold compare', () => {
    const digest = read('src/lib/geo-digest.ts');
    const dashboard = read('src/lib/geo-dashboard.ts');

    // both surfaces project from the ONE gate
    expect(digest).toMatch(/isSignificantDecline/);
    expect(dashboard).toMatch(/isSignificantDecline/);

    // the OLD inline slipping trigger is gone from the digest
    expect(digest).not.toMatch(/wowDropCount\s*>\s*0/);

    // the relative-drop gate literal (0.20 / 0.16) lives ONLY in the helper, never inline
    // in the pure digest module (the digest carries no SQL transparency filter).
    expect(digest).not.toMatch(/0\.(20|16)\b/);

    // the dashboard's WoW alarm banner is gated by the helper's verdict, not raw row count
    expect(dashboard).toMatch(/\.slipping/);
  });
});
