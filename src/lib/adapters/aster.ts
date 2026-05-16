/**
 * Aster adapter — implements ExchangeAdapter for Aster DEX USDT-M perpetuals.
 *
 * Aster (`fapi.asterdex.com`) is a BNB-Chain-based perp DEX whose REST API is
 * a near-verbatim Binance Futures API clone (same paths, same response shapes,
 * same query-param conventions). 410 listed perps as of PILOT-ADAPTERS-W1
 * Plan-Mode probe (2026-05-16). Status: shadow.
 *
 * Differences from Binance adapter pattern:
 *   - No `SYMBOL_OVERRIDES` (Aster does not use the 1000-prefix meme-coin
 *     convention — base assets are listed at their native ticker).
 *   - No `TRADFI_ALIASES` (Aster does not list TradFi instruments — stocks,
 *     commodities, indices are HL-only / not on Aster's perp catalog).
 *   - Rate-limit headers not surfaced; conservative single-retry pattern.
 *
 * Base URL: https://fapi.asterdex.com
 * Auth: public REST, no auth needed.
 */
import type {
  ExchangeAdapter,
  Candle,
  AssetContext,
  FundingData,
  DexType,
} from '../../types.js';
import { UpstreamRateLimitError } from '../errors.js';

const BASE_URL = 'https://fapi.asterdex.com';
const TIMEOUT_MS = 3000;
const MAX_RETRIES = 1;

// Map AlgoVault intervals to Aster kline intervals (Binance-compatible)
const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m',
  '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h',
  '8h': '8h', '12h': '12h', '1d': '1d',
};

export function toAsterSymbol(coin: string): string {
  return coin + 'USDT';
}

export function fromAsterSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '');
}

async function asterGet<T>(path: string, params?: Record<string, string | number>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = new URL(path, BASE_URL);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, String(v));
        }
      }
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const seconds = retryAfter ? parseInt(retryAfter, 10) : null;
        const waitMs = seconds ? seconds * 1000 : 1000;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw new UpstreamRateLimitError('Aster', Number.isFinite(seconds) ? seconds : null);
      }

      if (!res.ok) {
        throw new Error(`Aster API ${res.status}: ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Aster API: max retries exceeded');
}

// ── Response types (mirror Binance shapes verbatim) ──

interface AsterPremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

interface AsterOpenInterest {
  openInterest: string;
}

interface AsterTicker24hr {
  symbol: string;
  volume: string;
  quoteVolume: string;
  lastPrice: string;
  prevClosePrice: string;
}

export class AsterAdapter implements ExchangeAdapter {
  getName(): string {
    return 'Aster';
  }

  async getCandles(coin: string, interval: string, startTime: number, _dex?: DexType): Promise<Candle[]> {
    const symbol = toAsterSymbol(coin);
    const asterInterval = INTERVAL_MAP[interval] || '1h';

    const raw = await asterGet<(string | number)[][]>('/fapi/v1/klines', {
      symbol,
      interval: asterInterval,
      startTime,
      limit: 200,
    });

    return raw.map(c => ({
      open: parseFloat(String(c[1])),
      high: parseFloat(String(c[2])),
      low: parseFloat(String(c[3])),
      close: parseFloat(String(c[4])),
      volume: parseFloat(String(c[5])),
      time: c[0] as number,
    }));
  }

  async getAssetContext(coin: string, _dex?: DexType): Promise<AssetContext> {
    const symbol = toAsterSymbol(coin);

    const [premiumIndex, oi, ticker] = await Promise.all([
      asterGet<AsterPremiumIndex>('/fapi/v1/premiumIndex', { symbol }),
      asterGet<AsterOpenInterest>('/fapi/v1/openInterest', { symbol }),
      asterGet<AsterTicker24hr>('/fapi/v1/ticker/24hr', { symbol }),
    ]);

    // Aster funding is per-8h period (Binance-compatible); annualize × 1095.
    const fundingRaw = parseFloat(premiumIndex.lastFundingRate || '0');
    return {
      coin,
      funding: fundingRaw,
      fundingAnnualized: fundingRaw * 1095,
      openInterest: parseFloat(oi.openInterest || '0'),
      prevDayPx: parseFloat(ticker.prevClosePrice || '0'),
      volume24h: parseFloat(ticker.quoteVolume || '0'),
      oraclePx: parseFloat(premiumIndex.markPrice || '0'),
      markPx: parseFloat(premiumIndex.markPrice || '0'),
    };
  }

  async getPredictedFundings(): Promise<FundingData[]> {
    const raw = await asterGet<AsterPremiumIndex[]>('/fapi/v1/premiumIndex');
    return raw
      .filter(entry => entry.symbol.endsWith('USDT'))
      .map(entry => ({
        coin: fromAsterSymbol(entry.symbol),
        venues: [{
          venue: 'AsterPerp',
          fundingRate: parseFloat(entry.lastFundingRate || '0'),
          nextFundingTime: entry.nextFundingTime || 0,
        }],
      }));
  }

  async getFundingHistory(coin: string, startTime: number): Promise<{ time: number; fundingRate: number }[]> {
    try {
      const symbol = toAsterSymbol(coin);
      const raw = await asterGet<Array<{ fundingTime: number; fundingRate: string }>>('/fapi/v1/fundingRate', {
        symbol,
        startTime,
        limit: 1000,
      });
      return (raw || [])
        .filter(r => r.fundingRate != null && !isNaN(parseFloat(r.fundingRate)))
        .map(r => ({
          time: r.fundingTime,
          fundingRate: parseFloat(r.fundingRate),
        }));
    } catch {
      return [];
    }
  }

  async getCurrentPrice(coin: string, _dex?: DexType): Promise<number | null> {
    try {
      const symbol = toAsterSymbol(coin);
      const data = await asterGet<AsterPremiumIndex>('/fapi/v1/premiumIndex', { symbol });
      return parseFloat(data.markPrice);
    } catch {
      return null;
    }
  }
}
