import { NextRequest, NextResponse } from 'next/server';
import { Address, formatUnits } from 'viem';
import { getQuickNodeClient } from '@/lib/quicknode/client';
import { STABLECOINS, type SupportedChain } from '@/lib/quicknode/config';
import { getNativeTokenPrice as getChainlinkNativePrice, getTokenPriceWithFallback } from '@/lib/chainlink/price-feeds';
import { getCoinDeskClient } from '@/lib/coindesk/client';
import { getNativeSymbol, resolveSymbol } from '@/lib/coindesk/symbol-map';
import { symbolForAddress, STABLECOIN_SYMBOLS as REGISTRY_STABLE_SYMBOLS } from '@/lib/tokens/registry';

// ── In-memory cache for balances (5-min TTL, keyed by address) ──
const BALANCE_CACHE_TTL_MS = 5 * 60 * 1000;
const balanceCache = new Map<string, { data: any; ts: number }>();

interface ChainBalance {
  chainId: number;
  name: string;
  nativeBalance: number;
  balanceUSD: number;
  tokenCount: number;
}

interface TokenHolding {
  symbol: string;
  name: string;
  balanceUSD: number;
  balance: string;
  priceUSD: number;
  address: string;
}

// Free endpoint - no X402 payment required
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address') as Address | null;

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter required' },
        { status: 400 }
      );
    }

    // Check cache first (5-min TTL)
    const cacheKey = address.toLowerCase();
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BALANCE_CACHE_TTL_MS) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
        timestamp: Date.now()
      });
    }

    // Fetch basic portfolio data from multiple sources
    const [balances, tokens] = await Promise.allSettled([
      fetchMultiChainBalances(address),
      fetchTokenHoldings(address)
    ]);

    const balancesData = balances.status === 'fulfilled' ? balances.value : [];
    const tokensData = tokens.status === 'fulfilled' ? tokens.value : [];

    // Calculate aggregated metrics
    const totalValueUSD = calculateTotalValue(balancesData, tokensData);
    const nativeBalances = extractNativeBalances(balancesData);
    const topHoldings = tokensData
      .sort((a, b) => b.balanceUSD - a.balanceUSD)
      .slice(0, 5);

    // Calculate weighted 24h portfolio change using CoinDesk
    const change24h = await calculate24hChange(balancesData, tokensData);

    const responseData = {
      success: true,
      data: {
        address,
        summary: {
          totalPortfolioUSD: totalValueUSD,
          holdingsCount: tokensData.length,
          chainCount: balancesData.length,
          change24h,
        },
        chains: balancesData.map(c => ({
          chainId: c.chainId,
          name: c.name,
          balanceUSD: c.balanceUSD,
          tokenCount: c.tokenCount
        })),
        topHoldings: topHoldings.map(t => ({
          symbol: t.symbol,
          name: t.name,
          balanceUSD: t.balanceUSD,
          balance: t.balance,
          priceUSD: t.priceUSD,
          address: t.address
        })),
        nativeBalances,
        timestamp: Date.now()
      }
    };

    // Cache the response (5-min TTL)
    balanceCache.set(cacheKey, { data: responseData, ts: Date.now() });

    // Prune cache if too large (keep last 50 addresses)
    if (balanceCache.size > 50) {
      const entries = Array.from(balanceCache.entries());
      entries.sort((a, b) => a[1].ts - b[1].ts);
      const oldestKey = entries[0][0];
      balanceCache.delete(oldestKey);
    }

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=120' },
    });

  } catch (error: any) {
    console.error('[Dashboard:Overview] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio overview', details: error.message },
      { status: 500 }
    );
  }
}

// Helper: Fetch balances from multiple chains using QuickNode
async function fetchMultiChainBalances(address: Address): Promise<ChainBalance[]> {
  const qnClient = getQuickNodeClient();
  const chains: SupportedChain[] = ['base', 'polygon', 'ethereum', 'arbitrum'];

  const chainMetadata: Record<SupportedChain, { chainId: number; name: string }> = {
    base: { chainId: 8453, name: 'Base' },
    polygon: { chainId: 137, name: 'Polygon' },
    ethereum: { chainId: 1, name: 'Ethereum' },
    arbitrum: { chainId: 42161, name: 'Arbitrum' },
  };

  const results = await Promise.allSettled(
    chains.map(async (chain) => {
      try {
        // Use QuickNode client for native balance
        const balanceWei = await qnClient.getNativeBalance(chain, address);
        const balanceETH = parseFloat(formatUnits(balanceWei, 18));

        // Get native token price
        const priceUSD = await getNativeTokenPrice(chainMetadata[chain].chainId);
        const balanceUSD = balanceETH * priceUSD;

        return {
          chainId: chainMetadata[chain].chainId,
          name: chainMetadata[chain].name,
          nativeBalance: balanceETH,
          balanceUSD,
          tokenCount: 0, // Will be populated by token holdings
        };
      } catch (error) {
        console.warn(`[Dashboard] Failed to fetch balance for ${chain}:`, error);
        return null;
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

// Helper: Fetch token holdings using QuickNode
async function fetchTokenHoldings(address: Address): Promise<TokenHolding[]> {
  const qnClient = getQuickNodeClient();
  const chains: SupportedChain[] = ['base', 'polygon', 'ethereum', 'arbitrum'];
  const allTokens: TokenHolding[] = [];

  // Chain ID mapping
  const chainIds: Record<SupportedChain, number> = {
    base: 8453,
    polygon: 137,
    ethereum: 1,
    arbitrum: 42161,
  };

  for (const chain of chains) {
    try {
      // Get common stablecoins for this chain
      const stablecoins = Array.from(STABLECOINS[chain] || []) as `0x${string}`[];
      if (stablecoins.length === 0) continue;

      // Batch fetch token balances
      const balances = await qnClient.batchGetTokenBalances(chain, stablecoins, address);

      for (const [tokenAddr, balanceData] of balances.entries()) {
        const balance = parseFloat(formatUnits(balanceData.balance, balanceData.decimals));
        if (balance < 0.01) continue; // Filter dust

        // Get token price from CoinGecko with correct chain
        const priceUSD = await getTokenPrice(tokenAddr, chainIds[chain]);
        const balanceUSD = balance * priceUSD;

        // Get symbol from address (common stablecoins)
        const symbol = getTokenSymbol(tokenAddr);

        allTokens.push({
          symbol,
          name: symbol, // Use symbol as name for simplicity
          balanceUSD,
          balance: balance.toFixed(balanceData.decimals),
          priceUSD,
          address: tokenAddr,
        });
      }
    } catch (error) {
      console.warn(`[Dashboard] Failed to fetch tokens for ${chain}:`, error);
    }
  }

  return allTokens;
}

// Helper: Get token price using Chainlink (primary) with CoinGecko fallback
async function getTokenPrice(tokenAddress: string, chainId: number): Promise<number> {
  try {
    // Use Chainlink Data Feeds with automatic CoinGecko fallback
    const price = await getTokenPriceWithFallback(tokenAddress, chainId);
    return price;
  } catch (error) {
    console.warn('[Dashboard] Failed to fetch token price:', error);
    return 0;
  }
}

// Helper: Get token symbol from contract address
// Sourced from the token registry (lib/tokens/registry.ts) — single source of
// truth. Returns 'TOKEN' for addresses not in the registry.
function getTokenSymbol(tokenAddress: string): string {
  return symbolForAddress(tokenAddress) || 'TOKEN';
}

// Helper: Calculate total portfolio value
function calculateTotalValue(balances: ChainBalance[], tokens: TokenHolding[]): number {
  const nativeValue = balances.reduce((sum, b) => sum + b.balanceUSD, 0);
  const tokenValue = tokens.reduce((sum, t) => sum + t.balanceUSD, 0);
  return nativeValue + tokenValue;
}

// Helper: Extract native balances
function extractNativeBalances(balances: ChainBalance[]) {
  return balances.map(b => ({
    chainId: b.chainId,
    name: b.name,
    balance: b.nativeBalance,
    balanceUSD: b.balanceUSD
  }));
}

// Helper: Calculate weighted 24h portfolio change using CoinDesk
async function calculate24hChange(
  balances: ChainBalance[],
  tokens: TokenHolding[]
): Promise<number> {
  try {
    const coindesk = getCoinDeskClient();

    // Collect all unique symbols we need prices for
    const symbolValueMap = new Map<string, number>(); // symbol → total USD value

    // Native asset symbols
    for (const chain of balances) {
      const sym = getNativeSymbol(chain.chainId);
      if (sym && chain.balanceUSD > 0) {
        symbolValueMap.set(sym, (symbolValueMap.get(sym) || 0) + chain.balanceUSD);
      }
    }

    // Token symbols
    for (const token of tokens) {
      // Look up chainId from token address patterns
      const chainId = getChainIdForToken(token.address);
      const sym = resolveSymbol(token.address, chainId);
      if (sym && token.balanceUSD > 0) {
        symbolValueMap.set(sym, (symbolValueMap.get(sym) || 0) + token.balanceUSD);
      }
    }

    if (symbolValueMap.size === 0) return 0;

    // Stablecoins are pegged to $1 — skip them from CoinDesk lookup (they 404).
    // Registry stablecoin symbols + symbol-only classifications (FRAX/LUSD/BUSD).
    const stableSymbols = new Set([...REGISTRY_STABLE_SYMBOLS, 'FRAX', 'LUSD', 'BUSD']);
    const symbols = Array.from(symbolValueMap.keys()).filter(s => !stableSymbols.has(s));
    if (symbols.length === 0) return 0; // All stablecoins — no 24h change
    const prices = await coindesk.getMultiPrice(symbols);

    // Calculate weighted 24h change
    const totalValue = Array.from(symbolValueMap.values()).reduce((a, b) => a + b, 0);
    if (totalValue === 0) return 0;

    let weightedChange = 0;
    for (const [symbol, value] of symbolValueMap.entries()) {
      const priceData = prices.get(symbol);
      if (priceData) {
        const weight = value / totalValue;
        weightedChange += priceData.changePct24h * weight;
      }
    }

    return weightedChange;
  } catch (error) {
    console.warn('[Dashboard:Overview] Failed to calculate 24h change:', error);
    return 0;
  }
}

// Helper: Infer chain ID from token address (for known tokens)
function getChainIdForToken(tokenAddress: string): number {
  const addr = tokenAddress.toLowerCase();
  const chainMap: Record<string, number> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 8453,
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 8453,
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 137,
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 137,
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 137,
    '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': 137,
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 1,
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 1,
    '0x6b175474e89094c44da98b954eedeac495271d0f': 1,
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 42161,
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 42161,
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 42161,
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 42161,
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 42161,
  };
  return chainMap[addr] || 8453; // default to Base
}

// Helper: Get native token price using Chainlink Data Feeds
async function getNativeTokenPrice(chainId: number): Promise<number> {
  try {
    // Use Chainlink oracle for accurate, decentralized price data
    const price = await getChainlinkNativePrice(chainId);
    return price;
  } catch (error) {
    // If Chainlink fails, try Etherscan ethprice for ETH-based chains
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
    console.warn(`[Dashboard] All price sources failed for chain ${chainId}, returning 0`);
    return 0;
  }
}
