/**
 * Free Multi-Source Price Aggregator
 * Combines multiple free price APIs for accuracy (no Chainlink Functions cost)
 *
 * Sources:
 * 1. Chainlink Data Feeds (FREE on-chain reads, only gas ~$0.20)
 * 2. CoinGecko Free API (50 calls/min limit)
 * 3. CryptoCompare Free API (unlimited with rate limit)
 *
 * Returns median of all sources for robustness
 */

import { getChainlinkPrice } from '../chainlink/price-feeds';
import { cachedFetch } from '../redis/cache';

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const COINGECKO_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  ...(COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {}),
};

interface PriceResult {
  price: number;
  source: string;
  timestamp: number;
}

interface AggregatedPrice {
  median: number;
  mean: number;
  sources: PriceResult[];
  deviation: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Fetch price from CoinGecko (free tier)
 */
async function getCoinGeckoPrice(tokenId: string): Promise<PriceResult | null> {
  try {
    const data = await cachedFetch(
      `price:coingecko:${tokenId}`,
      60, // 60s TTL — price data
      async () => {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
          {
            headers: COINGECKO_HEADERS,
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!response.ok) return null;
        return response.json();
      },
    );

    const price = data?.[tokenId]?.usd;
    if (!price) return null;

    return {
      price,
      source: 'coingecko',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('[PriceAgg] CoinGecko failed:', error);
    return null;
  }
}

/**
 * Fetch price from CryptoCompare (free, unlimited)
 */
async function getCryptoComparePrice(symbol: string): Promise<PriceResult | null> {
  try {
    const data = await cachedFetch(
      `price:cryptocompare:${symbol}`,
      60, // 60s TTL
      async () => {
        const response = await fetch(
          `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) return null;
        return response.json();
      },
    );

    const price = data?.USD;
    if (!price) return null;

    return {
      price,
      source: 'cryptocompare',
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('[PriceAgg] CryptoCompare failed:', error);
    return null;
  }
}

/**
 * Fetch price from Chainlink oracle (free on-chain read)
 */
async function getChainlinkOraclePrice(
  chainId: number,
  pair: string
): Promise<PriceResult | null> {
  try {
    const data = await getChainlinkPrice(chainId, pair);

    return {
      price: data.price,
      source: 'chainlink',
      timestamp: data.updatedAt * 1000,
    };
  } catch (error) {
    console.warn('[PriceAgg] Chainlink failed:', error);
    return null;
  }
}

/**
 * Token symbol to CoinGecko ID mapping
 */
const TOKEN_ID_MAP: Record<string, string> = {
  'ETH': 'ethereum',
  'MATIC': 'matic-network',
  'POL': 'matic-network',
  'BNB': 'binancecoin',
  'USDC': 'usd-coin',
  'USDT': 'tether',
  'DAI': 'dai',
};

/**
 * Chainlink pair mapping
 */
const CHAINLINK_PAIRS: Record<string, string> = {
  'ETH': 'ETH/USD',
  'MATIC': 'MATIC/USD',
  'POL': 'MATIC/USD',
  'BNB': 'BNB/USD',
  'USDC': 'USDC/USD',
  'USDT': 'USDT/USD',
  'DAI': 'DAI/USD',
};

/**
 * Get aggregated price from multiple free sources
 *
 * @param tokenSymbol - Token symbol (ETH, USDC, etc.)
 * @param chainId - Chain ID for Chainlink oracle
 * @returns Aggregated price with confidence score
 */
export async function getAggregatedPrice(
  tokenSymbol: string,
  chainId: number
): Promise<AggregatedPrice> {
  const tokenId = TOKEN_ID_MAP[tokenSymbol] || tokenSymbol.toLowerCase();
  const chainlinkPair = CHAINLINK_PAIRS[tokenSymbol];

  // Fetch from all sources in parallel
  const results = await Promise.allSettled([
    getCoinGeckoPrice(tokenId),
    getCryptoComparePrice(tokenSymbol),
    chainlinkPair ? getChainlinkOraclePrice(chainId, chainlinkPair) : null,
  ]);

  // Extract successful results
  const prices: PriceResult[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      prices.push(result.value);
    }
  }

  // Need at least 1 source (prefer 2+ but don't fail on 1)
  if (prices.length === 0) {
    throw new Error(
      `No price sources available for ${tokenSymbol}`
    );
  }
  if (prices.length === 1) {
    console.warn(`[PriceAgg] Only 1 source for ${tokenSymbol}, returning as-is`);
  }

  // Sort prices
  const sortedPrices = prices.map(p => p.price).sort((a, b) => a - b);

  // Calculate median (robust against outliers)
  const median =
    sortedPrices.length % 2 === 0
      ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
      : sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Calculate mean
  const mean = sortedPrices.reduce((sum, p) => sum + p, 0) / sortedPrices.length;

  // Calculate deviation (for confidence scoring)
  const deviations = sortedPrices.map(p => Math.abs(p - median) / median * 100);
  const maxDeviation = Math.max(...deviations);

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (maxDeviation < 1) {
    confidence = 'high'; // All sources agree within 1%
  } else if (maxDeviation < 3) {
    confidence = 'medium'; // Sources agree within 3%
  } else {
    confidence = 'low'; // Significant disagreement
    console.warn(
      `[PriceAgg] High price deviation for ${tokenSymbol}: ${maxDeviation.toFixed(2)}%`
    );
  }

  console.log(
    `[PriceAgg] ${tokenSymbol}: $${median.toFixed(2)} (${prices.length} sources, ${maxDeviation.toFixed(2)}% dev, ${confidence} confidence)`
  );

  return {
    median,
    mean,
    sources: prices,
    deviation: maxDeviation,
    confidence,
  };
}

/**
 * Get native token price with multi-source aggregation
 *
 * @param chainId - Chain ID
 * @returns Aggregated price
 */
export async function getAggregatedNativePrice(chainId: number): Promise<number> {
  const tokenMap: Record<number, string> = {
    8453: 'ETH',     // Base
    137: 'POL',      // Polygon
    1: 'ETH',        // Ethereum
    42161: 'ETH',    // Arbitrum
    56: 'BNB',       // BSC
  };

  const symbol = tokenMap[chainId];
  if (!symbol) {
    throw new Error(`Unknown chain ${chainId}`);
  }

  try {
    const result = await getAggregatedPrice(symbol, chainId);
    return result.median;
  } catch (error) {
    console.error(`[PriceAgg] Failed for chain ${chainId}:`, error);

    // Try Etherscan ethprice as last resort for ETH-based chains
    const ethChains = new Set([8453, 1, 42161]); // Base, Ethereum, Arbitrum
    if (ethChains.has(chainId)) {
      try {
        const apiKey = process.env.ETHERSCAN_API_KEY;
        if (apiKey) {
          const res = await fetch(
            `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${apiKey}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const data = await res.json();
          if (data.status === '1' && data.result?.ethusd) return parseFloat(data.result.ethusd);
        }
      } catch {}
    }
    console.warn(`[PriceAgg] All price sources failed for chain ${chainId}, returning 0`);
    return 0;
  }
}

/**
 * Get stablecoin price with multi-source aggregation and depeg detection
 *
 * @param tokenSymbol - USDC, USDT, or DAI
 * @param chainId - Chain ID
 * @returns Aggregated price
 */
export async function getAggregatedStablecoinPrice(
  tokenSymbol: 'USDC' | 'USDT' | 'DAI',
  chainId: number
): Promise<number> {
  try {
    const result = await getAggregatedPrice(tokenSymbol, chainId);

    // Alert if stablecoin depegged >2%
    if (Math.abs(result.median - 1.0) > 0.02) {
      console.warn(
        `[PriceAgg] ${tokenSymbol} DEPEGGED: $${result.median.toFixed(4)} (${((result.median - 1.0) * 100).toFixed(2)}%)`
      );
    }

    return result.median;
  } catch (error) {
    console.error(`[PriceAgg] Failed for ${tokenSymbol}:`, error);
    return 1.0; // Safe fallback
  }
}

/**
 * Batch get aggregated prices for multiple tokens
 *
 * @param requests - Array of {symbol, chainId}
 * @returns Map of aggregated prices
 */
export async function batchGetAggregatedPrices(
  requests: Array<{ symbol: string; chainId: number }>
): Promise<Map<string, AggregatedPrice>> {
  const results = await Promise.allSettled(
    requests.map(async ({ symbol, chainId }) => {
      const price = await getAggregatedPrice(symbol, chainId);
      return { key: `${symbol}-${chainId}`, price };
    })
  );

  const priceMap = new Map<string, AggregatedPrice>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      priceMap.set(result.value.key, result.value.price);
    }
  }

  return priceMap;
}
