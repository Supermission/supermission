/**
 * CoinDesk Data API Client
 * Provides price data for 10,000+ tokens with historical OHLCV
 * Base URL: https://data-api.coindesk.com
 * Auth: api_key query param
 * Free tier: 11k calls/month
 */

const BASE_URL = 'https://data-api.coindesk.com';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

interface TickData {
  PRICE: number;
  OPEN24HOUR: number;
  HIGH24HOUR: number;
  LOW24HOUR: number;
  CHANGE24HOUR: number;
  CHANGEPCT24HOUR: number;
  VOLUME24HOUR: number;
  LASTUPDATE: number;
}

interface MultiPriceResponse {
  Data: Record<string, Record<string, TickData>>;
}

export type { OHLCVPoint } from '@/lib/types/market';
import type { OHLCVPoint } from '@/lib/types/market';

interface HistoricalResponse {
  Data: {
    Data: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volumefrom: number;
      volumeto: number;
    }>;
  };
}

export interface LatestPrice {
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  changePct24h: number;
  volume24h: number;
  lastUpdate: number;
}

class CoinDeskClient {
  private apiKey: string;
  private cache = new Map<string, CacheEntry<any>>();
  private monthlyCallCount = 0;
  private monthlyResetDate: number;

  constructor() {
    this.apiKey = process.env.COINDESK_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[CoinDesk] No API key configured (COINDESK_API_KEY)');
    }
    // Reset monthly counter on the 1st of each month
    const now = new Date();
    this.monthlyResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiry) {
      return entry.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  private trackCall(): void {
    // Reset counter if we've passed the month boundary
    if (Date.now() >= this.monthlyResetDate) {
      this.monthlyCallCount = 0;
      const now = new Date();
      this.monthlyResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    }

    this.monthlyCallCount++;

    if (this.monthlyCallCount >= 10000) {
      console.error(`[CoinDesk] CRITICAL: ${this.monthlyCallCount}/11,000 monthly calls used (90%+)`);
    } else if (this.monthlyCallCount >= 8000) {
      console.warn(`[CoinDesk] WARNING: ${this.monthlyCallCount}/11,000 monthly calls used (73%+)`);
    }
  }

  private async fetch<T>(path: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error('[CoinDesk] API key not configured');
    }

    this.trackCall();

    const separator = path.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${path}${separator}api_key=${this.apiKey}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`[CoinDesk] HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
    }

    return response.json();
  }

  /**
   * Get latest prices for multiple symbols in one API call.
   * Returns a map of symbol → LatestPrice.
   */
  async getMultiPrice(
    symbols: string[],
    currency: string = 'USD'
  ): Promise<Map<string, LatestPrice>> {
    const cacheKey = `multi:${symbols.sort().join(',')}:${currency}`;
    const cached = this.getCached<Map<string, LatestPrice>>(cacheKey);
    if (cached) return cached;

    const instruments = symbols.map(s => `${s}-${currency}`).join(',');
    const data = await this.fetch<MultiPriceResponse>(
      `/spot/v1/latest/tick?market=coinbase&instruments=${instruments}`
    );

    const result = new Map<string, LatestPrice>();

    if (data?.Data) {
      // Log first response to debug field mapping
      const entries = Object.entries(data.Data);
      if (entries.length > 0) {
        console.log('[CoinDesk] Response sample key:', entries[0][0], 'fields:', Object.keys(entries[0][1] as object));
      }

      for (const [key, value] of Object.entries(data.Data)) {
        // Response may be keyed as "BTC-USD" (instruments format) or "BTC" (legacy)
        const symbol = key.includes('-') ? key.split('-')[0] : key;
        const tick = ((value as any)?.[currency] ?? value) as TickData;
        if (tick?.PRICE !== undefined) {
          result.set(symbol, {
            price: tick.PRICE,
            open24h: tick.OPEN24HOUR ?? 0,
            high24h: tick.HIGH24HOUR ?? 0,
            low24h: tick.LOW24HOUR ?? 0,
            change24h: tick.CHANGE24HOUR ?? 0,
            changePct24h: tick.CHANGEPCT24HOUR ?? 0,
            volume24h: tick.VOLUME24HOUR ?? 0,
            lastUpdate: tick.LASTUPDATE ?? 0,
          });
        }
      }
    }

    this.setCache(cacheKey, result, 60 * 60_000); // 60 min cache
    return result;
  }

  /**
   * Get a single symbol's latest price.
   */
  async getLatestPrice(symbol: string, currency: string = 'USD'): Promise<number> {
    const prices = await this.getMultiPrice([symbol], currency);
    const data = prices.get(symbol);
    if (!data) {
      throw new Error(`[CoinDesk] No price data for ${symbol}`);
    }
    return data.price;
  }

  /**
   * Get historical daily OHLCV data.
   */
  async getHistoricalDaily(
    symbol: string,
    currency: string = 'USD',
    limit: number = 30
  ): Promise<OHLCVPoint[]> {
    const cacheKey = `daily:${symbol}:${currency}:${limit}`;
    const cached = this.getCached<OHLCVPoint[]>(cacheKey);
    if (cached) return cached;

    const data = await this.fetch<HistoricalResponse>(
      `/spot/v1/historical/days?market=coinbase&fsym=${symbol}&tsym=${currency}&limit=${limit}`
    );

    const points = (data?.Data?.Data || []).map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volumeto,
    }));

    this.setCache(cacheKey, points, 60 * 60_000); // 60 min cache
    return points;
  }

  /**
   * Get historical hourly OHLCV data.
   */
  async getHistoricalHourly(
    symbol: string,
    currency: string = 'USD',
    limit: number = 24
  ): Promise<OHLCVPoint[]> {
    const cacheKey = `hourly:${symbol}:${currency}:${limit}`;
    const cached = this.getCached<OHLCVPoint[]>(cacheKey);
    if (cached) return cached;

    const data = await this.fetch<HistoricalResponse>(
      `/spot/v1/historical/hours?market=coinbase&fsym=${symbol}&tsym=${currency}&limit=${limit}`
    );

    const points = (data?.Data?.Data || []).map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volumeto,
    }));

    this.setCache(cacheKey, points, 60 * 60_000); // 60 min cache
    return points;
  }

  /**
   * Get current monthly API usage stats.
   */
  getUsageStats() {
    return {
      monthlyCallCount: this.monthlyCallCount,
      monthlyLimit: 11_000,
      usagePct: (this.monthlyCallCount / 11_000) * 100,
      resetsAt: new Date(this.monthlyResetDate).toISOString(),
    };
  }
}

// Singleton
let instance: CoinDeskClient | null = null;

export function getCoinDeskClient(): CoinDeskClient {
  if (!instance) {
    instance = new CoinDeskClient();
  }
  return instance;
}
