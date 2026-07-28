import { NextRequest, NextResponse } from 'next/server';
import { safeParseInt } from '@/lib/validation';
import { cachedFetch } from '@/lib/redis/cache';

interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: string[];
  underlyingTokens?: string[];
  poolMeta?: string;
  url?: string;
  apyPct1D?: number;
  apyPct7D?: number;
  apyPct30D?: number;
  stablecoin?: boolean;
  ilRisk?: 'none' | 'low' | 'medium' | 'high';
  exposure?: string;
  predictions?: {
    predictedClass: string;
    predictedProbability: number;
    binnedConfidence: number;
  };
}

interface FilterOptions {
  chain?: string;
  minApy?: number;
  maxApy?: number;
  minTvl?: number;
  stablecoin?: boolean;
  sortBy?: 'apy' | 'tvl' | 'apyBase';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

// Free endpoint - no X402 payment required
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filter options
    const filters: FilterOptions = {
      chain: searchParams.get('chain') || undefined,
      minApy: searchParams.get('minApy') ? parseFloat(searchParams.get('minApy')!) : undefined,
      maxApy: searchParams.get('maxApy') ? parseFloat(searchParams.get('maxApy')!) : undefined,
      minTvl: searchParams.get('minTvl') ? parseFloat(searchParams.get('minTvl')!) : undefined,
      stablecoin: searchParams.get('stablecoin') === 'true',
      sortBy: (searchParams.get('sortBy') as 'apy' | 'tvl' | 'apyBase') || 'apy',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
      limit: safeParseInt(searchParams.get('limit'), 50, 1, 200),
    };

    // Fetch yields from DeFiLlama
    const pools = await fetchDeFiLlamaYields(filters);

    return NextResponse.json({
      success: true,
      data: {
        pools,
        count: pools.length,
        filters
      },
      timestamp: Date.now()
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });

  } catch (error: any) {
    console.error('[Dashboard:Yields] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch yield opportunities', details: process.env.NODE_ENV === 'development' ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}

// Helper: Fetch yields from DeFiLlama API with caching
async function fetchDeFiLlamaYields(filters: FilterOptions): Promise<YieldPool[]> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Build URL with filters - let DeFiLlama do the filtering server-side
      const params = new URLSearchParams();
      if (filters.chain) {
        params.set('chain', filters.chain);
      }
      const url = `https://yields.llama.fi/pools?${params.toString()}`;
      const cacheKey = `defillama:yields:${filters.chain || 'all'}`;

      const rawData = await cachedFetch(
        cacheKey,
        300, // 5 min TTL
        async () => {
          const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            throw new Error(`DeFiLlama API error: ${response.status}`);
          }
          const json = await response.json();
          return json.data || [];
        },
      );

      let pools: YieldPool[] = rawData;

    // Apply filters (now on pre-filtered data)
    pools = applyFilters(pools, filters);

    // Sort pools
    pools = sortPools(pools, filters.sortBy || 'apy', filters.sortOrder || 'desc');

    // Limit results
    if (filters.limit) {
      pools = pools.slice(0, filters.limit);
    }

    // Enrich with risk assessment
    pools = pools.map(pool => enrichPoolData(pool));

    return pools;

    } catch (error) {
      lastError = error as Error;
      console.error(`[Dashboard:Yields] DeFiLlama attempt ${attempt + 1} failed:`, error);
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted. Return empty list — never serve hardcoded
  // financial data that would mislead users into believing these are
  // real yields.
  console.error('[Dashboard:Yields] DeFiLlama fetch failed after retries:', lastError);
  return [];
}

// Trusted protocols — only show pools from well-known, audited protocols
const TRUSTED_PROTOCOLS = new Set([
  'aave-v3',
  'aave-v2',
  'compound-v3',
  'compound-v2',
  'compound',
  'uniswap-v3',
  'uniswap-v2',
  'curve-dex',
  'curve',
  'lido',
  'rocket-pool',
  'maker',
  'makerdao',
  'sky-lending',
  'morpho',
  'morpho-blue',
  'spark',
  'spark-lending',
  'convex-finance',
  'balancer-v2',
  'balancer',
  'aerodrome',
  'velodrome',
  'yearn-finance',
  'pendle',
  'eigenlayer',
  'ethena',
  'jito',
  'marinade-finance',
  'fluid',
  'instadapp',
]);

// Trusted assets — only show pools containing established, blue-chip tokens
const TRUSTED_ASSETS = new Set([
  'USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'GUSD', 'USDBC', 'USDS', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'PYUSD',
  'ETH', 'WETH', 'STETH', 'WSTETH', 'RETH', 'CBETH', 'METH', 'EETH', 'WEETH',
  'BTC', 'WBTC', 'TBTC', 'CBBTC',
  'MATIC', 'WMATIC', 'POL',
  'ARB', 'OP',
  'LINK', 'UNI', 'AAVE', 'MKR', 'SNX', 'CRV', 'LDO', 'RPL', 'COMP', 'BAL',
  'SOL', 'WSOL', 'MSOL', 'JITOSOL', 'BNSOL',
]);

// Check if all tokens in a pool symbol are trusted blue-chip assets
function hasOnlyTrustedAssets(symbol: string): boolean {
  const tokens = symbol.split('-').map(t => t.trim().toUpperCase());
  return tokens.every(t => TRUSTED_ASSETS.has(t));
}

// Check if a pool is single-asset lending/staking or a stable-stable pair (no IL risk)
function isSafeYieldPool(pool: YieldPool): boolean {
  const tokens = pool.symbol.split('-').map(t => t.trim().toUpperCase());

  // Single-asset pools (lending, staking) — e.g. "USDC", "WETH", "WSTETH"
  if (tokens.length === 1) return true;

  // Stable-stable pairs — e.g. "USDC-DAI", "USDT-USDC"
  const stables = new Set([
    'USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'GUSD', 'USDBC', 'USDS', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'PYUSD',
  ]);
  if (tokens.every(t => stables.has(t))) return true;

  // ETH-correlated pairs (minimal IL) — e.g. "WETH-WSTETH", "CBETH-WETH"
  const ethCorrelated = new Set([
    'ETH', 'WETH', 'STETH', 'WSTETH', 'RETH', 'CBETH', 'METH', 'EETH', 'WEETH',
  ]);
  if (tokens.every(t => ethCorrelated.has(t))) return true;

  // BTC-correlated pairs — e.g. "WBTC-CBBTC"
  const btcCorrelated = new Set(['BTC', 'WBTC', 'TBTC', 'CBBTC']);
  if (tokens.every(t => btcCorrelated.has(t))) return true;

  // Everything else is a volatile LP pair with IL risk — filter out
  return false;
}

// Helper: Apply filters to pools
function applyFilters(pools: YieldPool[], filters: FilterOptions): YieldPool[] {
  // Only show pools from trusted protocols, with blue-chip assets, and safe yield (no IL)
  let filtered = pools
    .filter(p => TRUSTED_PROTOCOLS.has(p.project.toLowerCase()))
    .filter(p => hasOnlyTrustedAssets(p.symbol))
    .filter(p => isSafeYieldPool(p));

  // Filter by chain
  if (filters.chain) {
    const targetChain = filters.chain.toLowerCase();
    filtered = filtered.filter(p => p.chain.toLowerCase() === targetChain);
  }

  // Filter by APY range
  if (filters.minApy !== undefined) {
    filtered = filtered.filter(p => p.apy >= filters.minApy!);
  }
  if (filters.maxApy !== undefined) {
    filtered = filtered.filter(p => p.apy <= filters.maxApy!);
  }

  // Filter by TVL
  if (filters.minTvl !== undefined) {
    filtered = filtered.filter(p => p.tvlUsd >= filters.minTvl!);
  }

  // Filter by stablecoin
  if (filters.stablecoin) {
    filtered = filtered.filter(p => p.stablecoin === true);
  }

  // Remove outliers — APY > 100% is almost always unsustainable incentives or bad data
  filtered = filtered.filter(p => p.apy <= 100);

  // Require meaningful TVL — pools under $100K are thin and risky
  filtered = filtered.filter(p => p.tvlUsd >= 100000);

  // Deduplicate: keep only the best APY per protocol+symbol+chain combo
  const bestByKey = new Map<string, YieldPool>();
  for (const pool of filtered) {
    const key = `${pool.project.toLowerCase()}|${pool.symbol.toUpperCase()}|${pool.chain.toLowerCase()}`;
    const existing = bestByKey.get(key);
    if (!existing || pool.apy > existing.apy) {
      bestByKey.set(key, pool);
    }
  }
  filtered = Array.from(bestByKey.values());

  return filtered;
}

// Helper: Sort pools
function sortPools(
  pools: YieldPool[],
  sortBy: 'apy' | 'tvl' | 'apyBase',
  sortOrder: 'asc' | 'desc'
): YieldPool[] {
  const sorted = [...pools].sort((a, b) => {
    let valueA: number;
    let valueB: number;

    switch (sortBy) {
      case 'apy':
        valueA = a.apy;
        valueB = b.apy;
        break;
      case 'tvl':
        valueA = a.tvlUsd;
        valueB = b.tvlUsd;
        break;
      case 'apyBase':
        valueA = a.apyBase || 0;
        valueB = b.apyBase || 0;
        break;
      default:
        valueA = a.apy;
        valueB = b.apy;
    }

    return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
  });

  return sorted;
}

// Helper: Enrich pool data with additional info
function enrichPoolData(pool: YieldPool): YieldPool {
  // Calculate IL risk if not provided
  if (!pool.ilRisk) {
    pool.ilRisk = calculateILRisk(pool);
  }

  // Add protocol URL if not provided
  if (!pool.url) {
    pool.url = getProtocolUrl(pool.project, pool.chain);
  }

  return pool;
}

// Helper: Calculate impermanent loss risk
function calculateILRisk(pool: YieldPool): 'none' | 'low' | 'medium' | 'high' {
  // Stablecoins have no IL risk
  if (pool.stablecoin) {
    return 'none';
  }

  // Single-asset staking has no IL
  if (pool.symbol && !pool.symbol.includes('-')) {
    return 'none';
  }

  // Stable pairs (e.g., USDC-DAI) have low IL
  const stableSymbols = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD'];
  const tokens = pool.symbol?.split('-') || [];
  const allStable = tokens.every(t => stableSymbols.some(s => t.includes(s)));
  if (allStable) {
    return 'low';
  }

  // ETH/BTC pairs with stables have medium IL
  const hasEthBtc = tokens.some(t => t.includes('ETH') || t.includes('BTC') || t.includes('WETH') || t.includes('WBTC'));
  const hasStable = tokens.some(t => stableSymbols.some(s => t.includes(s)));
  if (hasEthBtc && hasStable) {
    return 'medium';
  }

  // Volatile pairs have high IL
  return 'high';
}

// Helper: Get protocol URL
function getProtocolUrl(project: string, _chain: string): string {
  const urls: Record<string, string> = {
    'aave-v3': 'https://app.aave.com',
    'compound-v3': 'https://app.compound.finance',
    'uniswap-v3': 'https://app.uniswap.org',
    'curve': 'https://curve.fi',
    'balancer-v2': 'https://app.balancer.fi',
    'aerodrome': 'https://aerodrome.finance',
    'velodrome': 'https://app.velodrome.finance',
  };

  return urls[project.toLowerCase()] || `https://defillama.com/protocol/${project}`;
}

