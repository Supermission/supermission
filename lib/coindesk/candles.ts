/**
 * CoinDesk OHLCV → Token DD OhlcvCandle bridge
 *
 * Fetches hourly candles from CoinDesk and converts them to the
 * OhlcvCandle format expected by buildMarketHealth() and buildMarketSnapshot().
 *
 * Why hourly? The analyzers need ≥10 data points and use per-candle returns
 * for volatility/momentum. 24–48 hourly candles give fresh, granular data
 * without wasting API budget on minute-level calls.
 */

import { getCoinDeskClient } from './client';
import { resolveSymbol, getNativeSymbol } from './symbol-map';

/** Matches the type defined in marketHealth.ts / marketsnapshot.ts */
export interface OhlcvCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volume_usd: number;
}

/**
 * Fetch OHLCV candles for a token, suitable for the DD analyzers.
 *
 * @param tokenAddress - ERC-20 contract address
 * @param chainId - Chain ID (used for symbol resolution)
 * @param hours - Number of hourly candles to fetch (default 48)
 * @returns Array of OhlcvCandle, or null if token isn't in CoinDesk's coverage
 */
export async function fetchOhlcvCandles(
  tokenAddress: string,
  chainId: number,
  hours: number = 48
): Promise<OhlcvCandle[] | null> {
  const symbol = resolveSymbol(tokenAddress, chainId);
  if (!symbol) return null;

  return fetchOhlcvCandlesBySymbol(symbol, hours);
}

/**
 * Fetch OHLCV candles by CoinDesk symbol directly.
 *
 * @param symbol - CoinDesk symbol (e.g. 'ETH', 'BTC')
 * @param hours - Number of hourly candles (default 48)
 */
export async function fetchOhlcvCandlesBySymbol(
  symbol: string,
  hours: number = 48
): Promise<OhlcvCandle[] | null> {
  try {
    const client = getCoinDeskClient();
    const points = await client.getHistoricalHourly(symbol, 'USD', hours);

    if (!points || points.length < 10) return null;

    return points.map((p) => ({
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      volume_usd: p.volume, // CoinDesk volumeto is already in USD
    }));
  } catch (error) {
    console.warn(`[CoinDesk:Candles] Failed to fetch candles for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch OHLCV candles for a chain's native token.
 */
export async function fetchNativeOhlcvCandles(
  chainId: number,
  hours: number = 48
): Promise<OhlcvCandle[] | null> {
  const symbol = getNativeSymbol(chainId);
  if (!symbol) return null;

  return fetchOhlcvCandlesBySymbol(symbol, hours);
}
