/**
 * venue-budget-registry.ts — OPS-ADAPTER-RATELIMIT-UNIFY-W1 (C2: the registry owns the budgets)
 *
 * Single lookup point mapping an `exchangeId` to its cross-process weight budget
 * (or null when the venue is delay-paced only). `_upstream-fetch.ts` consults it
 * before every venue fetch via `getVenueBudget`.
 *
 * C2 (this commit): the HL + Binance `WeightBudget` singleton DEFINITIONS moved
 * here verbatim from `upstream-weight-budget.ts` — that module is now the engine
 * (the `WeightBudget` class + the AsyncLocalStorage weight-class framework) and
 * this module is the SoT for *which* venues are budgeted. The move is provably
 * byte-identical: ledger/lock paths, HL 1150/450, Binance 2000/800, and the
 * per-worker VITEST ledger isolation are all unchanged from the C1 re-export form.
 * Reaching the 3rd venue budget (BYBIT/OKX/BITGET in C3) is exactly the CLAUDE.md
 * "extract to a shared registry at the 3rd consumer" threshold this satisfies.
 *
 * Registry shape: a SPARSE `Map` (not `Record<ExchangeId>`) — only budgeted venues
 * are keys; the 12 delay-paced shadow venues are simply absent → `getVenueBudget`
 * returns null and `_upstream-fetch` skips the acquire. Adding a venue = one Map row.
 *
 * weightFor is intentionally thin: HL/Binance compute their venue-specific weight
 * in the adapter and pass it as `req.weightHint`; this registry just reads it. C3
 * adds the request-count venues (BYBIT/OKX/BITGET) with `weightFor = () => 1`.
 *
 * NOTE (deploy smoke, R6): the canonical `algovault-hl-weight` ledger-path literal
 * now lives in THIS module's compiled output — the smoke grep target moved from
 * `dist/lib/upstream-weight-budget.js` to `dist/lib/venue-budget-registry.js`.
 */
import { WeightBudget } from './upstream-weight-budget.js';

export interface VenueBudgetEntry {
  budget: WeightBudget;
  /** Maps an upstream request to its weight. HL/Binance pass `weightHint`; request-count venues return 1. */
  weightFor: (req: { weightHint?: number }) => number;
}

// ── Hyperliquid: consumer #1 (OPS-HL-RATELIMITER-W2) ──
// Canonical HL ledger path lives beside the registry so the deploy-smoke grep
// (R6) has a stable target. HL REST budget = 1200 weight/min/IP (official docs,
// re-verified 2026-06-04).
//
// OPS-HL-BUDGET-TUNE-W1 (2026-06-05, data-justified, architect-approved): bumped
// CEILING 1000→1150 + RESERVE 300→450 (both +150) after live telemetry showed
// measured interactive HL demand ≈ 404 wt/min overflowing the old 300 reserve at
// batch-peak boundary minutes (49-101 `throws`/window → HL→Binance fallbacks).
// Batch cap stays CEILING−RESERVE = 700 (unchanged → seeds' lane untouched; post
// OPS-HL-SEED-LOAD-W1 the batch is healthy at 700: waits low, skips 0). The extra
// 150 of ceiling goes entirely to interactive (reserve 300→450) so the ~404
// demand fits → interactive throttling eliminated. CEILING 1150 leaves 50 under
// HL's 1200 for header drift (all HL callers are now budgeted post-W2, so the
// "unbudgeted caller" cushion is no longer load-bearing).
export const HL_WEIGHT_CEILING = 1150;
export const HL_INTERACTIVE_RESERVE = 450;

const HL_VITEST = process.env.VITEST === 'true';
// Per-worker ledger + effectively-unbounded ceiling under vitest so fetch-mocked
// adapter tests never throttle or contend on the shared production ledger.
const hlLedgerSuffix = HL_VITEST ? `.test-${process.pid}` : '';

export const hlWeightBudget = new WeightBudget({
  venue: 'Hyperliquid',
  ledgerPath: process.env.HL_WEIGHT_LEDGER ?? `/tmp/algovault-hl-weight${hlLedgerSuffix}.json`,
  lockPath: process.env.HL_WEIGHT_LOCK ?? `/tmp/algovault-hl-weight${hlLedgerSuffix}.lock`,
  ceilingPerMin: HL_VITEST ? 1_000_000_000 : HL_WEIGHT_CEILING,
  interactiveReserve: HL_VITEST ? 0 : HL_INTERACTIVE_RESERVE,
  log: HL_VITEST ? () => {} : undefined,
});

// ── Binance: consumer #2 (OPS-BINANCE-RATELIMITER-W1, 2026-06-05) ──
// Same cross-process token-bucket as HL. Binance USD-M Futures (fapi) imposes a
// **2400 weight/min per-IP** limit (the adapter already reads `X-MBX-USED-WEIGHT-1m`
// and warns at >1800). The 42-cell cross-asset-grid warmer + default-exchange
// `get_trade_call` + Binance seed crons all hit fapi from the one Hetzner IP;
// during the 12-venue shadow ramp the AGGREGATE burst exceeded 2400 → HTTP 418
// IP-ban → grid slow-grid breaker spam. This budget caps the aggregate at 2000
// (400 under 2400 for header-rolling-window drift) and reserves 800 for
// interactive (grid + live user calls) so seed/backfill batch load can't starve
// them. // TODO: revisit constants with a week of telemetry (target 2026-06-19).
export const BINANCE_WEIGHT_CEILING = 2000;
export const BINANCE_INTERACTIVE_RESERVE = 800;

const BINANCE_VITEST = process.env.VITEST === 'true';
const binanceLedgerSuffix = BINANCE_VITEST ? `.test-${process.pid}` : '';

export const binanceWeightBudget = new WeightBudget({
  venue: 'Binance',
  ledgerPath:
    process.env.BINANCE_WEIGHT_LEDGER ?? `/tmp/algovault-binance-weight${binanceLedgerSuffix}.json`,
  lockPath:
    process.env.BINANCE_WEIGHT_LOCK ?? `/tmp/algovault-binance-weight${binanceLedgerSuffix}.lock`,
  ceilingPerMin: BINANCE_VITEST ? 1_000_000_000 : BINANCE_WEIGHT_CEILING,
  interactiveReserve: BINANCE_VITEST ? 0 : BINANCE_INTERACTIVE_RESERVE,
  log: BINANCE_VITEST ? () => {} : undefined,
});

// ── Bybit / OKX / Bitget: consumers #3-5 (OPS-ADAPTER-RATELIMIT-UNIFY-W1 C3) ──
// These three PROMOTED venues are REQUEST-COUNT limited (not Binance-style weight),
// so each registry row uses `weightFor = () => 1` — the budget meters requests/min;
// ceiling/reserve are req/min. Each ceiling sits well under the venue's documented
// per-IP limit so we self-throttle (typed UpstreamRateLimitError, no-retry) BEFORE
// the venue issues an IP ban — the same class of self-DoS the Binance budget closed
// (Bybit 403, Bitget body-code 45001). Ceilings/reserves are architect-ratified in
// audits/OPS-ADAPTER-RATELIMIT-UNIFY-W1-endpoint-truth.md §6-7. Ledger paths are
// STATIC literals (NOT templated through a slug variable) so the R6 deploy-smoke grep
// + ops can grep each `algovault-<venue>-weight` target in the compiled output.
// // TODO: revisit ceilings by 2026-06-26 with a week of per-window telemetry.

// Bybit v5: "600 requests within a 5-second window per IP" (= 7200/min;
// bybit-exchange.github.io/docs/v5/rate-limit) → 403 'access too frequent', wait
// ≥10min. Ceiling 3600 = 50%-of-verified; reserve 1200.
export const BYBIT_REQ_CEILING = 3600;
export const BYBIT_INTERACTIVE_RESERVE = 1200;
const BYBIT_VITEST = process.env.VITEST === 'true';
const bybitLedgerSuffix = BYBIT_VITEST ? `.test-${process.pid}` : '';
export const bybitWeightBudget = new WeightBudget({
  venue: 'Bybit',
  ledgerPath: process.env.BYBIT_WEIGHT_LEDGER ?? `/tmp/algovault-bybit-weight${bybitLedgerSuffix}.json`,
  lockPath: process.env.BYBIT_WEIGHT_LOCK ?? `/tmp/algovault-bybit-weight${bybitLedgerSuffix}.lock`,
  ceilingPerMin: BYBIT_VITEST ? 1_000_000_000 : BYBIT_REQ_CEILING,
  interactiveReserve: BYBIT_VITEST ? 0 : BYBIT_INTERACTIVE_RESERVE,
  log: BYBIT_VITEST ? () => {} : undefined,
});

// OKX is PER-ENDPOINT IP-rate-limited (NOT a single per-IP aggregate like Binance):
// market-data endpoints ≈ 20 req / 2s = 600/min/endpoint (okx.com/docs-v5, err 50026).
// Q2=A (architect-ratified): model ONE conservative aggregate budget across all OKX
// endpoints rather than per-endpoint buckets — 500/min sits under the lowest single
// 600/min ceiling, so it stays safe even if every call hits one endpoint, without
// per-endpoint ledger complexity. fetchOKX issues 2 requests (tickers +
// open-interest) per universe refresh; each costs 1.
export const OKX_REQ_CEILING = 500;
export const OKX_INTERACTIVE_RESERVE = 150;
const OKX_VITEST = process.env.VITEST === 'true';
const okxLedgerSuffix = OKX_VITEST ? `.test-${process.pid}` : '';
export const okxWeightBudget = new WeightBudget({
  venue: 'OKX',
  ledgerPath: process.env.OKX_WEIGHT_LEDGER ?? `/tmp/algovault-okx-weight${okxLedgerSuffix}.json`,
  lockPath: process.env.OKX_WEIGHT_LOCK ?? `/tmp/algovault-okx-weight${okxLedgerSuffix}.lock`,
  ceilingPerMin: OKX_VITEST ? 1_000_000_000 : OKX_REQ_CEILING,
  interactiveReserve: OKX_VITEST ? 0 : OKX_INTERACTIVE_RESERVE,
  log: OKX_VITEST ? () => {} : undefined,
});

// Bitget mix: "6000 requests / IP / Min … 5 minutes to recover"
// (bitget.com/wiki/bitget-api-rate-limits); also signals throttle via response
// body-codes 45001/40725/40808 (handled as banBodyCodes in the transport). Ceiling
// 3000 = 50%-of-verified; reserve 1000.
export const BITGET_REQ_CEILING = 3000;
export const BITGET_INTERACTIVE_RESERVE = 1000;
const BITGET_VITEST = process.env.VITEST === 'true';
const bitgetLedgerSuffix = BITGET_VITEST ? `.test-${process.pid}` : '';
export const bitgetWeightBudget = new WeightBudget({
  venue: 'Bitget',
  ledgerPath: process.env.BITGET_WEIGHT_LEDGER ?? `/tmp/algovault-bitget-weight${bitgetLedgerSuffix}.json`,
  lockPath: process.env.BITGET_WEIGHT_LOCK ?? `/tmp/algovault-bitget-weight${bitgetLedgerSuffix}.lock`,
  ceilingPerMin: BITGET_VITEST ? 1_000_000_000 : BITGET_REQ_CEILING,
  interactiveReserve: BITGET_VITEST ? 0 : BITGET_INTERACTIVE_RESERVE,
  log: BITGET_VITEST ? () => {} : undefined,
});

// ── The registry (sparse Map; one row per budgeted venue) ──
const VENUE_BUDGETS: ReadonlyMap<string, VenueBudgetEntry> = new Map<string, VenueBudgetEntry>([
  ['HL', { budget: hlWeightBudget, weightFor: (req) => req.weightHint ?? 20 }],
  ['BINANCE', { budget: binanceWeightBudget, weightFor: (req) => req.weightHint ?? 5 }],
  ['BYBIT', { budget: bybitWeightBudget, weightFor: () => 1 }],
  ['OKX', { budget: okxWeightBudget, weightFor: () => 1 }],
  ['BITGET', { budget: bitgetWeightBudget, weightFor: () => 1 }],
]);

/**
 * The cross-process weight budget for `exchangeId`, or null when the venue is
 * delay-paced only (the 12 shadow venues) and therefore has no shared budget.
 */
export function getVenueBudget(exchangeId: string): VenueBudgetEntry | null {
  return VENUE_BUDGETS.get(exchangeId) ?? null;
}
