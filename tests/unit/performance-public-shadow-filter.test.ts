/**
 * EXCHANGE-SHADOW-PROMOTE-W1 / C4 — public surface filter unit tests.
 *
 * Two distinct assertions:
 *   1. The `byExchange` filter pattern (promotedIds Set + Object.fromEntries
 *      filter) correctly retains only promoted venues. Replays the inline
 *      logic at src/index.ts /api/performance-public handler.
 *   2. The dashboard HTML emitted by getPerformanceDashboardHtml carries the
 *      `data-tr-field="shadow_venue_count"` span + the /api/performance-shadow
 *      reference link.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..', '..');

describe("/api/performance-public byExchange filter — promoted-only", () => {
  function filterByExchange(
    byExchange: Record<string, unknown>,
    promotedIds: Set<string>,
  ): Record<string, unknown> {
    if (promotedIds.size === 0) return byExchange; // fail-open
    return Object.fromEntries(
      Object.entries(byExchange).filter(([ex]) => promotedIds.has(ex)),
    );
  }

  it("returns ONLY promoted venues when both promoted + shadow rows exist", () => {
    const stats = {
      HL: { count: 100 },
      BINANCE: { count: 200 },
      BYBIT: { count: 150 },
      OKX: { count: 80 },
      BITGET: { count: 110 },
      GATEIO: { count: 30 },    // shadow — should be filtered out
      DYDXV4: { count: 25 },    // shadow — should be filtered out
    };
    const promoted = new Set(['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET']);
    const result = filterByExchange(stats, promoted);
    expect(Object.keys(result).sort()).toEqual(['BINANCE', 'BITGET', 'BYBIT', 'HL', 'OKX']);
    expect(result.GATEIO).toBeUndefined();
    expect(result.DYDXV4).toBeUndefined();
  });

  it("returns ALL 5 promoted venues unchanged when no shadow venues exist (post-C1 backfill state)", () => {
    const stats = {
      HL: { count: 100 },
      BINANCE: { count: 200 },
      BYBIT: { count: 150 },
      OKX: { count: 80 },
      BITGET: { count: 110 },
    };
    const promoted = new Set(['HL', 'BINANCE', 'BYBIT', 'OKX', 'BITGET']);
    const result = filterByExchange(stats, promoted);
    expect(Object.keys(result)).toHaveLength(5);
  });

  it("fail-open: empty promoted set → returns ALL entries (don't break public surface on venue-table outage)", () => {
    const stats = { HL: { count: 1 }, BINANCE: { count: 2 } };
    const result = filterByExchange(stats, new Set());
    expect(Object.keys(result)).toHaveLength(2);
  });
});

describe("/track-record dashboard HTML — shadow_venue_count span", () => {
  it("dashboard HTML contains data-tr-field=\"shadow_venue_count\" span", () => {
    const indexTs = readFileSync(join(REPO_ROOT, 'src/index.ts'), 'utf8');
    // Match the function-rendered HTML literal (NOT a static landing/*.html
    // file — Plan-Mode inline correction: /track-record is rendered by
    // getPerformanceDashboardHtml).
    expect(indexTs).toMatch(/data-tr-field="shadow_venue_count"/);
  });

  it("dashboard HTML references /api/performance-shadow endpoint", () => {
    const indexTs = readFileSync(join(REPO_ROOT, 'src/index.ts'), 'utf8');
    expect(indexTs).toContain('/api/performance-shadow');
  });

  it("dashboard header copy distinguishes promoted vs shadow exchanges", () => {
    const indexTs = readFileSync(join(REPO_ROOT, 'src/index.ts'), 'utf8');
    expect(indexTs).toMatch(/promoted exchanges/);
    expect(indexTs).toMatch(/shadow \(experimental/);
  });
});

describe("/api/performance-shadow endpoint shape", () => {
  // The handler is wired in src/index.ts; we assert here that the source
  // contains the canonical fields per AC spec. Live integration probe is the
  // dominant verification (CH4_GREEN gate).
  it("handler returns the spec-required fields per shadow venue", () => {
    const indexTs = readFileSync(join(REPO_ROOT, 'src/index.ts'), 'utf8');
    const required = [
      'exchange_id',
      'status',
      'asset_count',
      'min_buy_sell_sample',
      'days_since_integration',
      'extension_count',
      'last_eval_pfe_wr',
      'last_eval_buy_sell_count',
      'current_buy_sell_count',
      'current_pfe_wr',
    ];
    for (const field of required) {
      expect(indexTs).toMatch(new RegExp(`${field}:`));
    }
  });

  it("handler emits { venues, updated_at } envelope", () => {
    const indexTs = readFileSync(join(REPO_ROOT, 'src/index.ts'), 'utf8');
    expect(indexTs).toMatch(/res\.json\(\{ venues, updated_at:/);
  });
});
