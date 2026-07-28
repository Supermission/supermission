import { NextRequest, NextResponse } from 'next/server';
import { Address, isAddress } from 'viem';
import { cachedFetch } from '@/lib/redis/cache';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUSD: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
  totalSupply?: string;
  holders?: number;
  liquidity?: number;
  chainId: number;
  chainName: string;
  logo?: string;
}

// ── CoinGecko config ─────────────────────────────────────────────────────
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
// Demo keys (CG-...) use the public base URL with x-cg-demo-api-key header
const COINGECKO_HEADERS: Record<string, string> = {
  'Accept': 'application/json',
  ...(COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {}),
};

// ── In-memory token metadata cache ───────────────────────────────────────
interface CachedToken { data: TokenInfo; expiry: number }
const tokenCache = new Map<string, CachedToken>();
const CACHE_TTL_PRICE  = 60_000;      // 1 min for price-bearing results
const CACHE_TTL_META   = 60 * 60_000; // 1 hr for metadata-only (fallback) results

function getCachedToken(key: string): TokenInfo | null {
  const entry = tokenCache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data;
  tokenCache.delete(key);
  return null;
}

function setCachedToken(key: string, data: TokenInfo): void {
  const ttl = data.priceUSD > 0 ? CACHE_TTL_PRICE : CACHE_TTL_META;
  tokenCache.set(key, { data, expiry: Date.now() + ttl });
  // Prune if cache grows too large
  if (tokenCache.size > 500) {
    const entries = Array.from(tokenCache.entries());
    entries.sort((a, b) => a[1].expiry - b[1].expiry);
    entries.slice(0, 100).forEach(([k]) => tokenCache.delete(k));
  }
}

// ── Negative cache to avoid repeated failed lookups ─────────────────────
const negativeCache = new Map<string, number>();
const NEGATIVE_CACHE_TTL = 5 * 60_000; // 5 min

function isNegativelyCached(key: string): boolean {
  const expiry = negativeCache.get(key);
  if (expiry && Date.now() < expiry) return true;
  negativeCache.delete(key);
  return false;
}

function setNegativeCache(key: string): void {
  negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL);
}

// Free endpoint - no X402 payment required
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const chainId = parseInt(searchParams.get('chainId') || '8453');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter required (token address or symbol)' },
        { status: 400 }
      );
    }

    // Determine if query is an address or symbol
    const isAddressQuery = isAddress(query);

    let tokenInfo: TokenInfo | null = null;

    // Check cache first
    const cacheKey = `${query.toLowerCase()}:${chainId}`;
    const cached = getCachedToken(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached, timestamp: Date.now(), cached: true });
    }

    // Check negative cache to avoid hammering APIs for known-bad queries
    if (isNegativelyCached(cacheKey)) {
      return NextResponse.json(
        { error: 'Token not found (cached)', query, chainId },
        { status: 404 }
      );
    }

    if (isAddressQuery) {
      tokenInfo = await fetchTokenByAddress(query as Address, chainId);
    } else {
      tokenInfo = await searchTokenBySymbol(query, chainId);
    }

    // Cache the result
    if (tokenInfo) {
      setCachedToken(cacheKey, tokenInfo);
    }

    if (!tokenInfo) {
      setNegativeCache(cacheKey);
      return NextResponse.json(
        { error: 'Token not found', query, chainId },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: tokenInfo,
      timestamp: Date.now()
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });

  } catch (error: any) {
    console.error('[Dashboard:Tokens] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch token data', details: error.message },
      { status: 500 }
    );
  }
}

// Helper: Fetch token info by address
async function fetchTokenByAddress(address: Address, chainId: number): Promise<TokenInfo | null> {
  try {
    const platformId = getPlatformId(chainId);
    const cacheKey = `token:addr:${chainId}:${address.toLowerCase()}`;

    const data = await cachedFetch(
      cacheKey,
      60, // 1 min for price-bearing data
      async () => {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/${platformId}/contract/${address}`,
          {
            headers: COINGECKO_HEADERS,
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!response.ok) return null;
        return response.json();
      },
    );

    if (!data) {
      console.warn('[Dashboard:Tokens] CoinGecko lookup failed, trying fallback');
      return await fetchTokenFallback(address, chainId);
    }

    return {
      address: address.toLowerCase(),
      symbol: data.symbol?.toUpperCase() || 'UNKNOWN',
      name: data.name || 'Unknown Token',
      decimals: data.detail_platforms?.[platformId]?.decimal_place || 18,
      priceUSD: data.market_data?.current_price?.usd || 0,
      priceChange24h: data.market_data?.price_change_percentage_24h || 0,
      marketCap: data.market_data?.market_cap?.usd,
      volume24h: data.market_data?.total_volume?.usd,
      totalSupply: data.market_data?.total_supply?.toString(),
      holders: undefined,
      liquidity: data.market_data?.total_value_locked?.usd,
      chainId,
      chainName: getChainName(chainId),
      logo: data.image?.small || data.image?.thumb
    };

  } catch (error) {
    console.warn('[Dashboard:Tokens] Failed to fetch token by address:', error);
    return null;
  }
}

// Well-known token addresses per chain for reliable quick lookups
const WELL_KNOWN_TOKENS: Record<string, Record<number, string>> = {
  usdc: {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  'usdc.e': {
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  dai: {
    8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  weth: {
    8453: '0x4200000000000000000000000000000000000006',
    137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    10: '0x4200000000000000000000000000000000000006',
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  usdt: {
    8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // Native tokens (wrapped versions used for on-chain lookups)
  eth: {
    8453: '0x4200000000000000000000000000000000000006',
    137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    10: '0x4200000000000000000000000000000000000006',
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  matic: {
    137: '0x0000000000000000000000000000000000001010',
    8453: '0x0000000000000000000000000000000000000000', // not on base
    1: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  },
  pol: { // Polygon renamed MATIC to POL
    137: '0x0000000000000000000000000000000000001010',
    1: '0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6',
  },
  wmatic: {
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  wpol: {
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  wbtc: {
    8453: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b',
    137: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    10: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
    1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  link: {
    8453: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    137: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    10: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
    1: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  },
  uni: {
    8453: '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',
    137: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
    10: '0x6fd9d7AD17242c41f7131d257212c54A0e816691',
    1: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  aave: {
    137: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    10: '0x76FB31fb4af56892A25e32cFC43De717950c9278',
    1: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  },
  crv: {
    137: '0x172370d5Cd63279eFa6d502DAB29171933a610AF',
    1: '0xD533a949740bb3306d119CC777fa900bA034cd52',
  },
  snx: {
    137: '0x50B728D8D964fd00C2d0AAD81718b71311feF68a',
    10: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',
    1: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
  },
  comp: {
    137: '0x8505b9d2254A7Ae468c0E9dd10Ccea3A837aef5c',
    1: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
  },
  mkr: {
    137: '0x6f7C932e7684666C9fd1d44527765433e01fF61d',
    1: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  },
  sushi: {
    137: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
    1: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
  },
  '1inch': {
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f',
    1: '0x111111111117dC0aa78b770fA6A738034120C302',
  },
  cbeth: {
    8453: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    1: '0xBe9895146f7AF43049ca1c1AE358B0541Ea49704',
  },
  reth: {
    8453: '0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c',
    10: '0x9Bcef72be871e61ED4fBbc7630889beE758eb81D',
    1: '0xae78736Cd615f374D3085123A210448E74Fc6393',
  },
  steth: {
    1: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  },
  wsteth: {
    8453: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    137: '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',
    10: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
    1: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
  },
  pepe: {
    8453: '0xB0975EB2953DB1f210bE1453BF82A7994C628720',
    1: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  },
  shib: {
    137: '0x6f8a06447Ff6FcF75d803135a7de15CE88C1d4ec',
    1: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  },
  doge: {
    137: '0xbA777aE3a3C91fCD83EF85bfe65410592Bdd0f7c',
    1: '0x4206931337dc273a630d328dA6441786BfaD668f',
  },
  arb: {
    1: '0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1',
  },
  op: {
    10: '0x4200000000000000000000000000000000000042',
  },
};

// Helper: Search token by symbol
async function searchTokenBySymbol(symbol: string, chainId: number): Promise<TokenInfo | null> {
  try {
    // Strip leading $ if present
    const cleanSymbol = symbol.replace(/^\$/, '').toLowerCase();

    // Check well-known tokens first
    const knownAddress = WELL_KNOWN_TOKENS[cleanSymbol]?.[chainId];
    if (knownAddress) {
      return await fetchTokenByAddress(knownAddress as Address, chainId);
    }

    // Fallback: Search CoinGecko by symbol (cached 5 min)
    const data = await cachedFetch(
      `coingecko:search:${cleanSymbol}`,
      300,
      async () => {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(cleanSymbol)}`,
          {
            headers: COINGECKO_HEADERS,
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!response.ok) return null;
        return response.json();
      },
    );

    if (!data) {
      return null;
    }
    const platformId = getPlatformId(chainId);

    // Try to find exact symbol match with platform
    const coin = data.coins?.find((c: any) =>
      c.symbol?.toLowerCase() === cleanSymbol
    );

    if (!coin) {
      return null;
    }

    // Fetch coin details by CoinGecko ID to get platform addresses
    const coinDetail = await cachedFetch(
      `coingecko:coin:${coin.id}`,
      60,
      async () => {
        const detailRes = await fetch(
          `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&community_data=false&developer_data=false`,
          {
            headers: COINGECKO_HEADERS,
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!detailRes.ok) return null;
        return detailRes.json();
      },
    );

    if (!coinDetail) {
      return null;
    }
    const tokenAddress = coinDetail.platforms?.[platformId];

    if (!tokenAddress) {
      // Token exists on CoinGecko but not on this chain — check if it has any
      // contract on another chain we can reference, or return CoinGecko data directly
      // (e.g. native tokens like MATIC on Polygon have no contract address)
      const allPlatforms = coinDetail.platforms || {};
      const anyAddress = Object.values(allPlatforms).find((addr: any) => addr && addr.length > 0);

      return {
        address: (anyAddress as string) || `native:${coinDetail.id}`,
        symbol: coinDetail.symbol?.toUpperCase() || cleanSymbol.toUpperCase(),
        name: coinDetail.name || 'Unknown Token',
        decimals: coinDetail.detail_platforms?.[platformId]?.decimal_place || 18,
        priceUSD: coinDetail.market_data?.current_price?.usd || 0,
        priceChange24h: coinDetail.market_data?.price_change_percentage_24h || 0,
        marketCap: coinDetail.market_data?.market_cap?.usd,
        volume24h: coinDetail.market_data?.total_volume?.usd,
        totalSupply: coinDetail.market_data?.total_supply?.toString(),
        chainId,
        chainName: getChainName(chainId),
        logo: coinDetail.image?.small || coinDetail.image?.thumb,
      };
    }

    return await fetchTokenByAddress(tokenAddress as Address, chainId);

  } catch (error) {
    console.warn('[Dashboard:Tokens] Failed to search by symbol:', error);
    return null;
  }
}

// Helper: Fetch token info from DexScreener (free, no API key needed)
async function fetchFromDexScreener(address: string, chainId: number): Promise<TokenInfo | null> {
  try {
    const dexChain = getDexScreenerChain(chainId);

    const data = await cachedFetch(
      `dexscreener:${address.toLowerCase()}`,
      300, // 5 min TTL
      async () => {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${address}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!response.ok) return null;
        return response.json();
      },
    );

    if (!data) return null;
    const pairs = data.pairs?.filter((p: any) => p.chainId === dexChain);
    if (!pairs?.length) return null;

    // Pick the pair with highest liquidity
    const pair = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const isBaseToken = pair.baseToken?.address?.toLowerCase() === address.toLowerCase();
    const token = isBaseToken ? pair.baseToken : pair.quoteToken;

    return {
      address: address.toLowerCase(),
      symbol: token?.symbol || 'UNKNOWN',
      name: token?.name || 'Unknown Token',
      decimals: 18, // DexScreener doesn't provide decimals
      priceUSD: parseFloat(isBaseToken ? pair.priceUsd : (1 / parseFloat(pair.priceNative || '1')).toString()) || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      marketCap: pair.marketCap || pair.fdv,
      volume24h: pair.volume?.h24,
      liquidity: pair.liquidity?.usd,
      chainId,
      chainName: getChainName(chainId),
      logo: token?.info?.imageUrl,
    };
  } catch (error) {
    console.warn('[Dashboard:Tokens] DexScreener lookup failed:', error);
    return null;
  }
}

function getDexScreenerChain(chainId: number): string {
  const chains: Record<number, string> = {
    8453: 'base',
    137: 'polygon',
    10: 'optimism',
    1: 'ethereum',
  };
  return chains[chainId] || 'base';
}

// Helper: Fallback token fetch (when CoinGecko fails)
async function fetchTokenFallback(address: Address, chainId: number): Promise<TokenInfo | null> {
  try {
    // Try DexScreener first (has price data)
    const dexResult = await fetchFromDexScreener(address, chainId);
    if (dexResult) {
      // Enrich decimals from RPC if needed
      const rpc = getRpcUrl(chainId);
      const decimalsHex = await callTokenFunction(rpc, address, 'decimals');
      if (decimalsHex) dexResult.decimals = parseInt(decimalsHex, 16);
      return dexResult;
    }

    // Last resort: RPC only (no price data)
    const rpc = getRpcUrl(chainId);
    const [name, symbol, decimals] = await Promise.all([
      callTokenFunction(rpc, address, 'name'),
      callTokenFunction(rpc, address, 'symbol'),
      callTokenFunction(rpc, address, 'decimals')
    ]);

    return {
      address: address.toLowerCase(),
      symbol: symbol || 'UNKNOWN',
      name: name || 'Unknown Token',
      decimals: decimals ? parseInt(decimals, 16) : 18,
      priceUSD: 0,
      priceChange24h: 0,
      chainId,
      chainName: getChainName(chainId),
    };

  } catch (error) {
    console.warn('[Dashboard:Tokens] Fallback fetch failed:', error);
    return null;
  }
}

// Helper: Call token function via RPC
async function callTokenFunction(
  rpc: string,
  tokenAddress: Address,
  functionName: 'name' | 'symbol' | 'decimals'
): Promise<string | null> {
  try {
    const functionSignatures: Record<string, string> = {
      name: '0x06fdde03',
      symbol: '0x95d89b41',
      decimals: '0x313ce567'
    };

    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: tokenAddress,
            data: functionSignatures[functionName]
          },
          'latest'
        ],
        id: 1
      }),
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json();
    const result = data.result;

    if (!result || result === '0x') {
      return null;
    }

    // Decode result based on function type
    if (functionName === 'decimals') {
      return result; // Hex number
    } else {
      // Decode string (name/symbol)
      return decodeString(result);
    }

  } catch (error) {
    return null;
  }
}

// Helper: Decode hex string to UTF-8
function decodeString(hex: string): string {
  try {
    // Remove 0x prefix and decode
    const cleaned = hex.replace('0x', '');

    // Skip first 64 chars (offset) and next 64 chars (length)
    const dataStart = 128;
    const hexString = cleaned.slice(dataStart);

    // Convert hex to string
    let str = '';
    for (let i = 0; i < hexString.length; i += 2) {
      const code = parseInt(hexString.substr(i, 2), 16);
      if (code === 0) break; // Stop at null terminator
      str += String.fromCharCode(code);
    }

    return str.trim();
  } catch (error) {
    return '';
  }
}

// Helper: Get RPC URL for chain
function getRpcUrl(chainId: number): string {
  const rpcs: Record<number, string> = {
    8453: httpRpcUrl('base'),
    137: httpRpcUrl('polygon'),
    10: process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    1: httpRpcUrl('ethereum'),
  };
  return rpcs[chainId] || httpRpcUrl('base');
}

// Helper: Get CoinGecko platform ID
function getPlatformId(chainId: number): string {
  const platforms: Record<number, string> = {
    8453: 'base',
    137: 'polygon-pos',
    10: 'optimistic-ethereum',
    1: 'ethereum',
  };
  return platforms[chainId] || 'base';
}

// Helper: Get chain name
function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: 'Base',
    137: 'Polygon',
    10: 'Optimism',
    1: 'Ethereum',
  };
  return names[chainId] || `Chain ${chainId}`;
}
