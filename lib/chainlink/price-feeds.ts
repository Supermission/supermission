/**
 * Chainlink Price Feeds Integration
 * Replaces CoinGecko with decentralized oracle data
 * Docs: https://docs.chain.link/data-feeds
 */

import { createPublicClient, http, Address } from 'viem';
import { base, polygon, mainnet, arbitrum, bsc } from 'viem/chains';
import { getCoinDeskClient } from '@/lib/coindesk/client';
import { resolveSymbol } from '@/lib/coindesk/symbol-map';
import { chainlinkStableRefs } from '@/lib/tokens/registry';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Chainlink Price Feed ABI (minimal - only functions we need)
const PRICE_FEED_ABI = [
  {
    inputs: [],
    name: 'latestRoundData',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Chainlink Price Feed Contract Addresses (verified from docs.chain.link)
// https://docs.chain.link/data-feeds/price-feeds/addresses
const PRICE_FEEDS: Record<number, Record<string, Address>> = {
  // Base mainnet (chain ID 8453)
  8453: {
    'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
  },
  // Polygon mainnet (chain ID 137)
  137: {
    'MATIC/USD': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    'ETH/USD': '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    'USDC/USD': '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    'USDT/USD': '0x0A6513e40db6EB1b165753AD52E80663aeA50545',
    'DAI/USD': '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D',
  },
  // Ethereum mainnet (chain ID 1)
  1: {
    'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
    'USDT/USD': '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D',
    'DAI/USD': '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9',
  },
  // Arbitrum mainnet (chain ID 42161)
  42161: {
    'ETH/USD': '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
    'USDC/USD': '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
    'USDT/USD': '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
    'DAI/USD': '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB',
  },
  // BSC mainnet (chain ID 56)
  56: {
    'BNB/USD': '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
    'ETH/USD': '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e',
    'USDC/USD': '0x51597f405303C4377E36123cBc172b13269EA163',
    'USDT/USD': '0xB97Ad0E74fa7d920791E90258A6E2085088b4320',
  },
};

// Chain configurations for viem clients
const CHAIN_CONFIGS = {
  8453: { chain: base, rpc: httpRpcUrl('base') },
  137: { chain: polygon, rpc: httpRpcUrl('polygon') },
  1: { chain: mainnet, rpc: httpRpcUrl('ethereum') },
  42161: { chain: arbitrum, rpc: httpRpcUrl('arbitrum') },
  56: { chain: bsc, rpc: process.env.NEXT_PUBLIC_BSC_RPC_URL },
};

// Viem clients cache (singleton pattern)
const clients = new Map<number, any>();

// Price feed caches
const PRICE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for prices
const priceCache = new Map<string, { data: ChainlinkPriceData; ts: number }>();
const decimalsCache = new Map<string, number>(); // Permanent cache for decimals

function getClient(chainId: number) {
  if (!clients.has(chainId)) {
    const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
    if (!config) throw new Error(`Chain ${chainId} not supported`);

    const client = createPublicClient({
      chain: config.chain,
      transport: http(config.rpc, { timeout: 10_000 }),
    });
    clients.set(chainId, client);
  }
  return clients.get(chainId);
}

export interface ChainlinkPriceData {
  price: number;
  decimals: number;
  updatedAt: number;
  roundId: bigint;
  source: 'chainlink';
}

/**
 * Get price from Chainlink Data Feed oracle
 *
 * Benefits over CoinGecko:
 * - No API rate limits (on-chain reads)
 * - Decentralized (multiple node operators)
 * - Sub-second latency
 * - 99.9% uptime (battle-tested securing $15B+ TVL)
 *
 * @param chainId - Blockchain chain ID
 * @param pair - Price pair (e.g., 'ETH/USD', 'USDC/USD')
 * @returns Price data with metadata
 */
export async function getChainlinkPrice(
  chainId: number,
  pair: string
): Promise<ChainlinkPriceData> {
  const feedAddress = PRICE_FEEDS[chainId]?.[pair];

  if (!feedAddress) {
    throw new Error(`No Chainlink feed for ${pair} on chain ${chainId}`);
  }

  // Check price cache first (30-second TTL)
  const priceCacheKey = `${chainId}-${pair}`;
  const cachedPrice = priceCache.get(priceCacheKey);
  if (cachedPrice && Date.now() - cachedPrice.ts < PRICE_CACHE_TTL_MS) {
    return cachedPrice.data;
  }

  try {
    const client = getClient(chainId);

    // Read decimals (permanently cached per feed)
    let decimals: number = decimalsCache.get(feedAddress) ?? 8; // default to 8 decimals
    if (!decimalsCache.has(feedAddress)) {
      decimals = await client.readContract({
        address: feedAddress,
        abi: PRICE_FEED_ABI,
        functionName: 'decimals',
      });
      decimalsCache.set(feedAddress, decimals);
    } else {
      decimals = decimalsCache.get(feedAddress)!;
    }

    // Read latest round data
    const [roundId, answer, , updatedAt, answeredInRound] =
      await client.readContract({
        address: feedAddress,
        abi: PRICE_FEED_ABI,
        functionName: 'latestRoundData',
      });

    // Validate data freshness (Chainlink best practice)
    // L2 feeds (Base, Arbitrum) have longer heartbeats (up to 24h for stablecoins)
    const now = Math.floor(Date.now() / 1000);
    const dataAge = now - Number(updatedAt);

    const STALENESS_THRESHOLDS: Record<number, Record<string, number>> = {
      8453: { 'ETH/USD': 1200, 'USDC/USD': 86400 }, // Base: ETH 20min, USDC 24h heartbeat
      137:  { default: 3600 },
      1:    { default: 3600 },
      42161: { 'ETH/USD': 1200, 'USDC/USD': 86400, default: 3600 },
      56:   { default: 3600 },
    };

    const chainThresholds = STALENESS_THRESHOLDS[chainId] || {};
    const stalenessLimit = chainThresholds[pair] || chainThresholds['default'] || 3600;

    if (dataAge > stalenessLimit) {
      console.warn(
        `[Chainlink] Stale price data for ${pair} on chain ${chainId}: ${dataAge}s old (threshold: ${stalenessLimit}s)`
      );
    }

    // Validate round completion (Chainlink best practice)
    if (roundId > answeredInRound) {
      console.warn(
        `[Chainlink] Incomplete round for ${pair} on chain ${chainId}`
      );
    }

    // Convert oracle answer to decimal price
    const price = Number(answer) / Math.pow(10, decimals);

    const priceData: ChainlinkPriceData = {
      price,
      decimals,
      updatedAt: Number(updatedAt),
      roundId,
      source: 'chainlink',
    };

    // Cache the price (30-second TTL)
    priceCache.set(priceCacheKey, { data: priceData, ts: Date.now() });

    // Prune price cache if too large (keep last 100 feeds)
    if (priceCache.size > 100) {
      const entries = Array.from(priceCache.entries());
      entries.sort((a, b) => a[1].ts - b[1].ts);
      const toRemove = entries.slice(0, 20);
      toRemove.forEach(([k]) => priceCache.delete(k));
    }

    return priceData;

  } catch (error) {
    console.error(
      `[Chainlink] Failed to fetch ${pair} on chain ${chainId}:`,
      error
    );
    throw error;
  }
}

/**
 * Get native token price for a blockchain
 *
 * Maps chain IDs to their native tokens:
 * - Base/Ethereum/Arbitrum: ETH
 * - Polygon: MATIC (POL)
 * - BSC: BNB
 *
 * @param chainId - Blockchain chain ID
 * @returns Price in USD
 */
export async function getNativeTokenPrice(chainId: number): Promise<number> {
  const pairs: Record<number, string> = {
    8453: 'ETH/USD',     // Base
    137: 'MATIC/USD',    // Polygon (POL = MATIC rebranded)
    1: 'ETH/USD',        // Ethereum
    42161: 'ETH/USD',    // Arbitrum
    56: 'BNB/USD',       // BSC
  };

  const pair = pairs[chainId];
  if (!pair) throw new Error(`Unknown chain ${chainId}`);

  try {
    const data = await getChainlinkPrice(chainId, pair);
    console.log(
      `[Chainlink] ${pair} on chain ${chainId}: $${data.price.toFixed(2)} (updated ${Math.floor(Date.now() / 1000) - data.updatedAt}s ago)`
    );
    return data.price;
  } catch (error) {
    // Try Etherscan ethprice as fallback for ETH-based chains
    try {
      const apiKey = process.env.ETHERSCAN_API_KEY;
      if (apiKey) {
        const res = await fetch(
          `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${apiKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        const data = await res.json();
        if (data.status === '1' && data.result?.ethusd) {
          const ethPrice = parseFloat(data.result.ethusd);
          if (pair === 'MATIC/USD' || pair === 'BNB/USD') {
            // Non-ETH native tokens — can't get from ethprice endpoint
            console.warn(`[Chainlink] Oracle failed for ${pair}, returning 0`);
            return 0;
          }
          return ethPrice;
        }
      }
    } catch { /* Etherscan also failed */ }

    console.warn(`[Chainlink] Oracle failed for ${pair} on chain ${chainId}, returning 0`);
    return 0;
  }
}

/**
 * Get stablecoin price from Chainlink oracle
 *
 * Even though stablecoins target $1, they can depeg.
 * Chainlink provides accurate real-time prices.
 *
 * @param tokenSymbol - Token symbol (USDC, USDT, DAI)
 * @param chainId - Blockchain chain ID
 * @returns Price in USD
 */
export async function getStablecoinPrice(
  tokenSymbol: 'USDC' | 'USDT' | 'DAI',
  chainId: number
): Promise<number> {
  const pair = `${tokenSymbol}/USD`;

  try {
    const data = await getChainlinkPrice(chainId, pair);

    // Alert if stablecoin depegged significantly
    if (Math.abs(data.price - 1.0) > 0.02) { // >2% depeg
      console.warn(
        `[Chainlink] ${tokenSymbol} depegged on chain ${chainId}: $${data.price.toFixed(4)}`
      );
    }

    return data.price;
  } catch (error) {
    // If no Chainlink feed exists for this stablecoin on this chain
    console.warn(
      `[Chainlink] No feed for ${tokenSymbol} on chain ${chainId}, assuming $1.00`
    );
    return 1.0; // Safe fallback for stablecoins
  }
}

/**
 * Batch fetch multiple prices in parallel
 * More efficient than sequential calls
 *
 * @param requests - Array of {chainId, pair} objects
 * @returns Map of prices keyed by "chainId-pair"
 */
export async function batchGetPrices(
  requests: Array<{ chainId: number; pair: string }>
): Promise<Map<string, ChainlinkPriceData>> {
  const results = await Promise.allSettled(
    requests.map(async ({ chainId, pair }) => {
      const data = await getChainlinkPrice(chainId, pair);
      return { key: `${chainId}-${pair}`, data };
    })
  );

  const priceMap = new Map<string, ChainlinkPriceData>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      priceMap.set(result.value.key, result.value.data);
    } else {
      console.error('[Chainlink] Batch request failed:', result.reason);
    }
  }

  return priceMap;
}

/**
 * Get token price with automatic fallback to CoinGecko
 * Best of both worlds: Chainlink primary, CoinGecko backup
 *
 * @param tokenAddress - Token contract address
 * @param chainId - Blockchain chain ID
 * @returns Price in USD
 */
export async function getTokenPriceWithFallback(
  tokenAddress: string,
  chainId: number
): Promise<number> {
  // Try to determine token symbol from address.
  // Base/Polygon/Ethereum/Arbitrum stablecoin refs come from the token registry
  // (single source of truth). BSC entries are appended here — the registry only
  // models the chains the app tracks natively.
  const knownTokens: Record<string, 'USDC' | 'USDT' | 'DAI'> = {
    ...chainlinkStableRefs(),
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC', // BSC USDC
    '0x55d398326f99059ff775485246999027b3197955': 'USDT', // BSC USDT
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': 'DAI',  // BSC DAI
  };

  const tokenSymbol = knownTokens[tokenAddress.toLowerCase()];

  if (tokenSymbol) {
    try {
      // Try Chainlink first
      return await getStablecoinPrice(tokenSymbol, chainId);
    } catch (error) {
      console.warn(
        `[Chainlink] Failed to get ${tokenSymbol} price, falling back to CoinDesk`
      );
    }
  }

  // WETH and wrapped ETH variants — use the ETH/USD Chainlink feed directly
  const WETH_ADDRESSES = new Set([
    '0x4200000000000000000000000000000000000006', // WETH on Base
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH on Ethereum
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // WETH on Polygon
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH on Arbitrum
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // ETH on BSC
  ]);
  if (WETH_ADDRESSES.has(tokenAddress.toLowerCase())) {
    try {
      const data = await getChainlinkPrice(chainId, 'ETH/USD');
      return data.price;
    } catch {
      // Fall through to CoinDesk/CoinGecko
    }
  }

  // WBTC variants — use ETH/USD oracle for now (better than nothing)
  const WBTC_ADDRESSES = new Set([
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // cbBTC on Base
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC on Ethereum
    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', // WBTC on Polygon
  ]);
  if (WBTC_ADDRESSES.has(tokenAddress.toLowerCase())) {
    try {
      // BTC doesn't have Chainlink on all chains — use CoinDesk instead
      const client = getCoinDeskClient();
      return await client.getLatestPrice('BTC');
    } catch {
      // Fall through
    }
  }

  // Try CoinDesk (10,000+ tokens) before CoinGecko
  try {
    const cdSymbol = resolveSymbol(tokenAddress, chainId);
    if (cdSymbol) {
      const client = getCoinDeskClient();
      const price = await client.getLatestPrice(cdSymbol);
      return price;
    }
  } catch {
    console.warn('[CoinDesk] Failed, falling back to CoinGecko');
  }

  // Fallback 3: CoinGecko
  const cgPrice = await getCoinGeckoPrice(tokenAddress, chainId);
  if (cgPrice > 0) return cgPrice;

  // Fallback 4: Etherscan ethprice (for ETH/WETH when everything else fails)
  if (WETH_ADDRESSES.has(tokenAddress.toLowerCase())) {
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

  // Fallback 5: Uniswap V3 subgraph (Base only — has derivedETH for every indexed token)
  if (chainId === 8453) {
    try {
      const { subgraphQuery } = await import('@/lib/uniswap/price-client');
      const data = await subgraphQuery<{ token: { derivedETH: string } | null }>(
        8453,
        `{ token(id: "${tokenAddress.toLowerCase()}") { derivedETH } }`
      );
      if (data.token?.derivedETH) {
        const derivedETH = parseFloat(data.token.derivedETH);
        if (derivedETH > 0) {
          // Get ETH price to convert derivedETH to USD
          try {
            const ethData = await getChainlinkPrice(8453, 'ETH/USD');
            return derivedETH * ethData.price;
          } catch {
            // If Chainlink also fails for ETH, try Etherscan
            try {
              const apiKey = process.env.ETHERSCAN_API_KEY;
              if (apiKey) {
                const res = await fetch(
                  `https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethprice&apikey=${apiKey}`,
                  { signal: AbortSignal.timeout(5000) }
                );
                const d = await res.json();
                if (d.status === '1' && d.result?.ethusd) return derivedETH * parseFloat(d.result.ethusd);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // All 5 sources exhausted — return 0 (token will be hidden from display)
  return 0;
}

/**
 * CoinGecko fallback (existing implementation)
 * Used when Chainlink feed doesn't exist for a token
 */
async function getCoinGeckoPrice(
  tokenAddress: string,
  chainId: number
): Promise<number> {
  const platformMap: Record<number, string> = {
    8453: 'base',
    137: 'polygon-pos',
    1: 'ethereum',
    42161: 'arbitrum-one',
    56: 'binance-smart-chain',
  };

  const platform = platformMap[chainId] || 'base';
  const apiKey = process.env.COINGECKO_API_KEY || '';

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${tokenAddress}&vs_currencies=usd`,
      {
        headers: {
          'Accept': 'application/json',
          ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}),
        },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      console.warn(`[CoinGecko] Fetch failed for ${tokenAddress}`);
      return 0;
    }

    const data = await response.json();
    const price = data[tokenAddress.toLowerCase()]?.usd;

    return price || 0;
  } catch (error) {
    console.warn('[CoinGecko] Price fetch error:', error);
    return 0;
  }
}
