/**
 * oi-sources.ts — SCAN-RANKBY-W3 CH2
 *
 * Per-venue REAL open-interest fetchers for the oi_snapshots sampler + backfill.
 * Kept apart from oi-snapshots.ts (the DB/delta layer) — this is the HTTP layer.
 *
 * Venue OI sourcing (live-probed 2026-06-27):
 *  - HL / BYBIT / OKX / BITGET: `fetchVenueUniverse().notionalOI_usd` IS real OI
 *    (oi × price). Reused directly — no extra calls.
 *  - BINANCE: `notionalOI_usd` is a VOLUME proxy (no bulk OI endpoint), so it is
 *    NOT usable as OI. Real OI comes per-symbol from `/futures/data/openInterestHist`
 *    `sumOpenInterestValue` (native USD). Off the request path (hourly sampler) so
 *    the per-symbol fan-out over the pool is fine.
 *
 * Backfill history (shrink the one-time 24h warming):
 *  - BINANCE: openInterestHist period=1h → sumOpenInterestValue (USD, direct).
 *  - BYBIT: open-interest intervalTime=1h gives OI in CONTRACTS → × hourly close
 *    (real price, via the verdict-engine adapter) = USD, consistent with the
 *    USD sampler. OKX(per-CCY granularity)/BITGET(no history)/HL(none) warm forward.
 */

import type { ExchangeId } from '../types.js';
import { fetchVenueUniverse } from './exchange-universe.js';
import { upstreamFetch, VENUE_FETCH_CONFIGS } from './adapters/_upstream-fetch.js';
import { getAdapter } from './exchange-adapter.js';
import { bucketHour } from './oi-snapshots.js';

export interface CurrentOi {
  coin: string;
  /** USD notional open interest. */
  oi: number;
}

/** Concurrency-limited map (no external dep) — for the per-symbol Binance fan-out. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** Binance per-symbol OI history → [{ ts, oi(USD) }] via sumOpenInterestValue. */
async function binanceOiHistUsd(
  coin: string,
  period: string,
  limit: number,
): Promise<Array<{ ts: number; oi: number }>> {
  const url =
    `https://fapi.binance.com/futures/data/openInterestHist?symbol=${coin}USDT&period=${period}&limit=${limit}`;
  const data = await upstreamFetch<Array<{ sumOpenInterestValue?: string; timestamp?: number }>>(
    VENUE_FETCH_CONFIGS.BINANCE,
    { url, method: 'GET', cls: 'batch' },
  );
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => ({ ts: Number(d.timestamp), oi: parseFloat(d.sumOpenInterestValue ?? 'NaN') }))
    .filter((d) => Number.isFinite(d.ts) && Number.isFinite(d.oi) && d.oi > 0);
}

/**
 * Current USD-notional OI for the top-`poolSize` perps on `exchange`.
 * 4 venues read from the universe directly; Binance fans out per-symbol.
 */
export async function fetchCurrentOiUsd(exchange: ExchangeId, poolSize: number): Promise<CurrentOi[]> {
  const universe = await fetchVenueUniverse(exchange);
  const pool = universe.slice(0, poolSize);
  if (exchange === 'BINANCE') {
    const results = await mapLimit(pool, 6, async (a) => {
      try {
        const hist = await binanceOiHistUsd(a.coin, '5m', 1);
        const oi = hist.length ? hist[hist.length - 1].oi : NaN;
        return Number.isFinite(oi) && oi > 0 ? { coin: a.coin, oi } : null;
      } catch {
        return null;
      }
    });
    return results.filter((x): x is CurrentOi => x !== null);
  }
  return pool
    .filter((a) => Number.isFinite(a.notionalOI_usd) && a.notionalOI_usd > 0)
    .map((a) => ({ coin: a.coin, oi: a.notionalOI_usd }));
}

/**
 * ~`hours` of hourly USD OI history for (exchange, coin) — backfill only.
 * Returns null for venues without clean USD-comparable history (warm forward).
 */
export async function fetchOiHistoryUsd(
  exchange: ExchangeId,
  coin: string,
  hours: number,
): Promise<Array<{ ts: number; oi: number }> | null> {
  if (exchange === 'BINANCE') {
    const hist = await binanceOiHistUsd(coin, '1h', hours);
    return hist.length ? hist : null;
  }
  if (exchange === 'BYBIT') {
    const resp = await upstreamFetch<{ result?: { list?: Array<{ openInterest?: string; timestamp?: string }> } }>(
      VENUE_FETCH_CONFIGS.BYBIT,
      {
        url: `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${coin}USDT&intervalTime=1h&limit=${hours}`,
        method: 'GET',
        cls: 'batch',
      },
    );
    const list = resp?.result?.list ?? [];
    if (!list.length) return null;
    // OI is in contracts → multiply by the real hourly close (price) to get USD.
    const startTime = Date.now() - (hours + 2) * 60 * 60 * 1000;
    const candles = await getAdapter('BYBIT').getCandles(coin, '1h', startTime);
    const closeByBucket = new Map<number, number>();
    for (const c of candles) closeByBucket.set(bucketHour(c.time), c.close);
    const out = list
      .map((r) => {
        const ts = Number(r.timestamp);
        const contracts = parseFloat(r.openInterest ?? 'NaN');
        const close = closeByBucket.get(bucketHour(ts));
        return close && Number.isFinite(contracts) ? { ts, oi: contracts * close } : null;
      })
      .filter((x): x is { ts: number; oi: number } => x !== null && x.oi > 0);
    return out.length ? out : null;
  }
  return null; // OKX / BITGET / HL → warm forward
}
