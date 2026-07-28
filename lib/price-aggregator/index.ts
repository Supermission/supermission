/**
 * Price Aggregator Entry Point
 * Automatically chooses between single-source (fast) or multi-source (accurate)
 * based on environment variable
 */

import { getNativeTokenPrice as getSingleSourceNative } from '../chainlink/price-feeds';
import { getAggregatedNativePrice, getAggregatedStablecoinPrice } from './multi-source';

// Check if multi-source is enabled (default: false for speed)
const USE_MULTI_SOURCE = process.env.NEXT_PUBLIC_ENABLE_MULTI_SOURCE_PRICING === 'true';

/**
 * Get native token price
 * Uses multi-source if enabled, otherwise Chainlink only
 */
export async function getNativeTokenPrice(chainId: number): Promise<number> {
  if (USE_MULTI_SOURCE) {
    console.log('[PriceAgg] Using multi-source aggregation');
    return await getAggregatedNativePrice(chainId);
  }

  console.log('[PriceAgg] Using single-source (Chainlink)');
  return await getSingleSourceNative(chainId);
}

/**
 * Get stablecoin price
 * Uses multi-source if enabled, otherwise Chainlink only
 */
export async function getStablecoinPrice(
  symbol: 'USDC' | 'USDT' | 'DAI',
  chainId: number
): Promise<number> {
  if (USE_MULTI_SOURCE) {
    return await getAggregatedStablecoinPrice(symbol, chainId);
  }

  // Fallback to Chainlink
  const { getStablecoinPrice: getChainlinkStable } = await import('../chainlink/price-feeds');
  return await getChainlinkStable(symbol, chainId);
}

/**
 * Get config info
 */
export function getPricingConfig() {
  return {
    multiSource: USE_MULTI_SOURCE,
    mode: USE_MULTI_SOURCE ? 'multi-source (3+ APIs)' : 'single-source (Chainlink)',
    cost: USE_MULTI_SOURCE ? '$0 per request' : '$0.20 gas per request',
    latency: USE_MULTI_SOURCE ? '500-1500ms' : '300-1000ms',
    accuracy: USE_MULTI_SOURCE ? 'Very High (median)' : 'High',
  };
}
