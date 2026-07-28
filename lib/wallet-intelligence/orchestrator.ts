/**
 * Multi-Chain Orchestrator
 * Coordinates parallel data fetching across all chains and aggregates results
 * Uses QuickNode RPC + BaseScan/PolygonScan APIs + CoinGecko for prices
 */

import { type Address, formatEther, formatUnits, isAddress } from 'viem';
import { getQuickNodeClient } from '../quicknode/client';
import { CHAIN_CONFIGS, STABLECOINS } from '../quicknode/config';
import { detectDeFiPositions } from './enrichers/defi-enricher';
import { mapWithLimit } from '../utils/concurrency';
import type {
  SupportedChain,
  ChainData,
  TokenBalance,
  NFTCollection,
  DeFiPosition,
  SocialIdentity,
  OrchestratorResult,
  EnrichedChainData,
} from './types';

// API keys from env
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || '';

// Block explorer base URLs
const EXPLORER_API: Record<SupportedChain, string> = {
  base: 'https://api.basescan.org/api',
  polygon: 'https://api.polygonscan.com/api',
  ethereum: 'https://api.etherscan.io/api',
  arbitrum: 'https://api.arbiscan.io/api',
};

// Well-known tokens to always check (even if not in transfer history)
const WELL_KNOWN_TOKENS: Record<SupportedChain, Array<{ address: string; symbol: string; name: string; decimals: number }>> = {
  base: [
    { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', symbol: 'USDbC', name: 'USD Base Coin', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
    { address: '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', symbol: 'wstETH', name: 'Wrapped liquid staked Ether 2.0', decimals: 18 },
    { address: '0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c', symbol: 'rETH', name: 'Rocket Pool ETH', decimals: 18 },
    { address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631', symbol: 'AERO', name: 'Aerodrome Finance', decimals: 18 },
    { address: '0x532f27101965dd16442e59d40670faf5ebb142e4', symbol: 'BRETT', name: 'Brett', decimals: 18 },
    { address: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  ],
  polygon: [
    { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', symbol: 'USDC.e', name: 'USD Coin (PoS)', decimals: 6 },
    { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', symbol: 'WMATIC', name: 'Wrapped Matic', decimals: 18 },
    { address: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    { address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39', symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  ],
  ethereum: [
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    { address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', symbol: 'stETH', name: 'Liquid staked Ether 2.0', decimals: 18 },
  ],
  arbitrum: [
    { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
    { address: '0xf97f4df75117a78c1a5a0dbb814af92458539fb4', symbol: 'LINK', name: 'ChainLink Token', decimals: 18 },
  ],
};

// CoinGecko chain platform IDs
const COINGECKO_PLATFORM: Record<SupportedChain, string> = {
  base: 'base',
  polygon: 'polygon-pos',
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
};

// CoinGecko native token IDs
const NATIVE_TOKEN_COINGECKO_ID: Record<SupportedChain, string> = {
  base: 'ethereum',
  polygon: 'matic-network',
  ethereum: 'ethereum',
  arbitrum: 'ethereum',
};

// ============================================
// PRICE FETCHING (CoinGecko)
// ============================================

/**
 * Fetch native token price (ETH, MATIC) from CoinGecko
 */
async function fetchNativePrice(chain: SupportedChain): Promise<number> {
  try {
    const coinId = NATIVE_TOKEN_COINGECKO_ID[chain];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
    const headers: Record<string, string> = {};
    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return data[coinId]?.usd || 0;
  } catch (err) {
    console.warn(`[Orchestrator] CoinGecko native price failed for ${chain}:`, err);
    // Fallback prices
    const fallbacks: Record<SupportedChain, number> = {
      base: 2600,
      polygon: 0.40,
      ethereum: 2600,
      arbitrum: 2600,
    };
    return fallbacks[chain] || 0;
  }
}

/**
 * Batch fetch ERC-20 token prices from CoinGecko
 */
async function fetchTokenPrices(
  chain: SupportedChain,
  contractAddresses: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (contractAddresses.length === 0) return prices;

  try {
    const platform = COINGECKO_PLATFORM[chain];
    const addresses = contractAddresses.map((a) => a.toLowerCase()).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${addresses}&vs_currencies=usd`;
    const headers: Record<string, string> = {};
    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();

    Object.entries(data).forEach(([addr, priceObj]: [string, any]) => {
      if (priceObj?.usd) {
        prices.set(addr.toLowerCase(), priceObj.usd);
      }
    });
  } catch (err) {
    console.warn(`[Orchestrator] CoinGecko token price fetch failed for ${chain}:`, err);
  }
  return prices;
}

// ============================================
// TOKEN BALANCE FETCHING
// ============================================

interface RawTokenTransfer {
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

/**
 * Fetch ERC-20 token list from block explorer (BaseScan/PolygonScan)
 * Uses tokentx to discover tokens, then checks current balances
 */
async function fetchTokensFromExplorer(
  chain: SupportedChain,
  walletAddress: string
): Promise<TokenBalance[]> {
  const apiUrl = EXPLORER_API[chain];
  const apiKey = BASESCAN_API_KEY;
  const client = getQuickNodeClient();

  // Track all discovered token contracts
  const uniqueTokens = new Map<string, RawTokenTransfer>();

  // Step 1: Always add well-known tokens for this chain
  for (const wk of WELL_KNOWN_TOKENS[chain]) {
    uniqueTokens.set(wk.address.toLowerCase(), {
      contractAddress: wk.address.toLowerCase(),
      tokenName: wk.name,
      tokenSymbol: wk.symbol,
      tokenDecimal: wk.decimals.toString(),
    });
  }

  // Step 2: Discover additional tokens from transfer history (explorer API)
  try {
    if (apiKey) {
      const txUrl = `${apiUrl}?module=account&action=tokentx&address=${walletAddress}&page=1&offset=200&sort=desc&apikey=${apiKey}`;
      const txRes = await fetch(txUrl);
      if (txRes.ok) {
        const txData = await txRes.json();
        if (txData.status === '1' && txData.result?.length) {
          for (const tx of txData.result) {
            const addr = tx.contractAddress?.toLowerCase();
            if (addr && !uniqueTokens.has(addr)) {
              uniqueTokens.set(addr, {
                contractAddress: addr,
                tokenName: tx.tokenName || 'Unknown',
                tokenSymbol: tx.tokenSymbol || '???',
                tokenDecimal: tx.tokenDecimal || '18',
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`[Orchestrator] Explorer token discovery failed for ${chain}:`, err);
  }

  console.log(`[Orchestrator] Checking ${uniqueTokens.size} tokens on ${chain} (${WELL_KNOWN_TOKENS[chain].length} well-known + explorer)`);

  // Step 3: Fetch current balance for each token via RPC
  const tokenEntries = Array.from(uniqueTokens.values()).slice(0, 40);

  const MAX_CONCURRENT_RPC = 8;
  const balanceResults = await mapWithLimit(
    tokenEntries,
    MAX_CONCURRENT_RPC,
    async (token) => {
      try {
        // Pass known decimals to skip the on-chain decimals() RPC call
        const knownDecimals = token.tokenDecimal ? parseInt(token.tokenDecimal) : undefined;
        const result = await client.getTokenBalance(
          chain,
          token.contractAddress as Address,
          walletAddress as Address,
          knownDecimals
        );
        return { token, result };
      } catch {
        return { token, result: null };
      }
    }
  );

  // Filter out zero balances
  const nonZeroTokens = balanceResults.filter(
    ({ result }) => result && result.balance > 0n
  );

  if (nonZeroTokens.length === 0) return [];

  // Step 4: Fetch prices for all non-zero tokens
  const tokenAddresses = nonZeroTokens.map(({ token }) => token.contractAddress);
  const prices = await fetchTokenPrices(chain, tokenAddresses);

  // Step 5: Build enriched token balances
  const tokenBalances: TokenBalance[] = nonZeroTokens.map(({ token, result }) => {
    const decimals = parseInt(token.tokenDecimal) || 18;
    const balance = result!.balance;
    const balanceFormatted = formatUnits(balance, decimals);
    const balanceNumber = parseFloat(balanceFormatted);
    const price = prices.get(token.contractAddress.toLowerCase());
    const balanceUSD = price ? balanceNumber * price : 0;

    const isSpam = detectSpamToken(token.tokenSymbol, token.tokenName);

    return {
      address: token.contractAddress,
      symbol: token.tokenSymbol,
      name: token.tokenName,
      decimals,
      balance: balance.toString(),
      balanceFormatted,
      balanceUSD,
      price,
      isSpam,
    };
  });

  // Filter spam and sort by value
  return tokenBalances
    .filter((t) => !t.isSpam)
    .sort((a, b) => b.balanceUSD - a.balanceUSD);
}

/**
 * Detect scam/spam tokens
 */
function detectSpamToken(symbol: string, name: string): boolean {
  const lower = (symbol + ' ' + name).toLowerCase();
  const scamKeywords = [
    'visit', 'claim', 'airdrop', 'free', 'reward', 'bonus',
    'prize', 'gift', 'www.', '.com', '.io', 'http', '.org',
    '.xyz', 'voucher', 'ticket',
  ];
  return scamKeywords.some((kw) => lower.includes(kw));
}

// ============================================
// NFT FETCHING
// ============================================

/**
 * Fetch NFTs from block explorer (ERC-721 transfers)
 */
async function fetchNFTsFromExplorer(
  chain: SupportedChain,
  walletAddress: string
): Promise<NFTCollection[]> {
  const apiUrl = EXPLORER_API[chain];
  const apiKey = BASESCAN_API_KEY;

  try {
    const url = `${apiUrl}?module=account&action=tokennfttx&address=${walletAddress}&page=1&offset=100&sort=desc${apiKey ? `&apikey=${apiKey}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    if (data.status !== '1' || !data.result?.length) return [];

    // Group by collection and count net holdings (received - sent)
    const collections = new Map<string, { name: string; symbol: string; received: number; sent: number }>();

    for (const tx of data.result) {
      const addr = tx.contractAddress?.toLowerCase();
      if (!addr) continue;

      if (!collections.has(addr)) {
        collections.set(addr, {
          name: tx.tokenName || 'Unknown NFT',
          symbol: tx.tokenSymbol || '???',
          received: 0,
          sent: 0,
        });
      }

      const entry = collections.get(addr)!;
      if (tx.to?.toLowerCase() === walletAddress.toLowerCase()) {
        entry.received++;
      } else if (tx.from?.toLowerCase() === walletAddress.toLowerCase()) {
        entry.sent++;
      }
    }

    // Build NFT collections (only those with positive balance)
    const nftCollections: NFTCollection[] = [];
    for (const [addr, info] of collections) {
      const netCount = info.received - info.sent;
      if (netCount > 0) {
        nftCollections.push({
          contractAddress: addr,
          name: info.name,
          symbol: info.symbol,
          tokenCount: netCount,
          tokens: [],
        });
      }
    }

    return nftCollections;
  } catch (err) {
    console.warn(`[Orchestrator] NFT fetch failed for ${chain}:`, err);
    return [];
  }
}

// ============================================
// SOCIAL IDENTITY
// ============================================

export async function fetchSocialIdentity(address: Address): Promise<SocialIdentity> {
  return {
    ens: undefined,
    lens: undefined,
    farcaster: undefined,
  };
}

// ============================================
// CHAIN DATA FETCHING
// ============================================

/**
 * Fetch complete wallet data for a single chain
 */
async function fetchChainData(
  chain: SupportedChain,
  walletAddress: Address
): Promise<EnrichedChainData> {
  const startTime = Date.now();
  const client = getQuickNodeClient();
  const config = CHAIN_CONFIGS[chain];
  const errors: string[] = [];

  try {
    // Phase 1: Fetch native balance, tx count, native price in parallel
    const [nativeBalance, transactionCount, nativePrice] = await Promise.all([
      client.getNativeBalance(chain, walletAddress),
      client.getTransactionCount(chain, walletAddress),
      fetchNativePrice(chain),
    ]);

    const nativeBalanceFormatted = formatEther(nativeBalance);
    const nativeBalanceUSD = parseFloat(nativeBalanceFormatted) * nativePrice;

    // Phase 2: Fetch tokens and NFTs in parallel
    const [tokenBalances, nftCollections] = await Promise.all([
      fetchTokensFromExplorer(chain, walletAddress).catch((err) => {
        errors.push(`Token fetch: ${err.message}`);
        return [] as TokenBalance[];
      }),
      fetchNFTsFromExplorer(chain, walletAddress).catch((err) => {
        errors.push(`NFT fetch: ${err.message}`);
        return [] as NFTCollection[];
      }),
    ]);

    // Phase 3: Detect DeFi positions from token holdings
    const defiPositions = detectDeFiPositions(chain, tokenBalances);

    // Calculate total chain value
    const totalValueUSD =
      nativeBalanceUSD +
      tokenBalances.reduce((sum, t) => sum + t.balanceUSD, 0) +
      nftCollections.reduce((sum, n) => sum + (n.estimatedValue || 0), 0) +
      defiPositions.reduce((sum, d) => sum + d.valueUSD, 0);

    const executionTime = Date.now() - startTime;
    console.log(
      `[Orchestrator] ${chain}: ${executionTime}ms | ` +
      `Native: ${nativeBalanceFormatted} ($${nativeBalanceUSD.toFixed(2)}) | ` +
      `Tokens: ${tokenBalances.length} | NFTs: ${nftCollections.length} | DeFi: ${defiPositions.length}`
    );

    return {
      chainId: config.id,
      chainName: config.name,
      nativeBalance: nativeBalance.toString(),
      nativeBalanceFormatted,
      nativeBalanceUSD,
      tokenBalances,
      nftCollections,
      defiPositions,
      totalValueUSD,
      transactionCount,
      lastActivity: undefined,
      enrichmentStatus: errors.length > 0 ? 'partial' : 'complete',
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error(`[Orchestrator] Error fetching data for ${chain}:`, error);
    return {
      chainId: config.id,
      chainName: config.name,
      nativeBalance: '0',
      nativeBalanceFormatted: '0',
      nativeBalanceUSD: 0,
      tokenBalances: [],
      nftCollections: [],
      defiPositions: [],
      totalValueUSD: 0,
      transactionCount: 0,
      lastActivity: undefined,
      enrichmentStatus: 'failed',
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ============================================
// ORCHESTRATION
// ============================================

/**
 * Orchestrate multi-chain data fetching (standard mode)
 */
export async function orchestrateWalletAnalysis(
  walletAddress: string,
  selectedChains?: SupportedChain[]
): Promise<OrchestratorResult> {
  const startTime = Date.now();

  if (!isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const chainsToFetch: SupportedChain[] = selectedChains || ['base', 'polygon', 'ethereum'];
  console.log(`[Orchestrator] Starting analysis for ${walletAddress} on: ${chainsToFetch.join(', ')}`);

  // Fetch all chains in parallel
  const chainResults = await Promise.all(
    chainsToFetch.map((chain) => fetchChainData(chain, walletAddress as Address))
  );

  // Aggregate
  const allTokens: TokenBalance[] = [];
  const allNFTs: NFTCollection[] = [];
  const allDeFiPositions: DeFiPosition[] = [];
  let totalValueUSD = 0;

  chainResults.forEach((chainData) => {
    allTokens.push(...chainData.tokenBalances);
    allNFTs.push(...chainData.nftCollections);
    allDeFiPositions.push(...chainData.defiPositions);
    totalValueUSD += chainData.totalValueUSD;
  });

  const executionTimeMs = Date.now() - startTime;
  console.log(
    `[Orchestrator] Complete in ${executionTimeMs}ms | ` +
    `Total: $${totalValueUSD.toFixed(2)} | ` +
    `Tokens: ${allTokens.length} | NFTs: ${allNFTs.length} | DeFi: ${allDeFiPositions.length}`
  );

  return {
    chains: chainResults,
    aggregatedData: { totalValueUSD, allTokens, allNFTs, allDeFiPositions },
    executionTimeMs,
  };
}

/**
 * Quick mode orchestration (native balances only, no tokens)
 */
export async function orchestrateQuickAnalysis(
  walletAddress: string,
  selectedChains?: SupportedChain[]
): Promise<OrchestratorResult> {
  const startTime = Date.now();

  if (!isAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const chainsToFetch: SupportedChain[] = selectedChains || ['base', 'polygon', 'ethereum'];
  const client = getQuickNodeClient();

  const quickPromises = chainsToFetch.map(async (chain) => {
    const config = CHAIN_CONFIGS[chain];
    const [nativeBalance, transactionCount, nativePrice] = await Promise.all([
      client.getNativeBalance(chain, walletAddress as Address),
      client.getTransactionCount(chain, walletAddress as Address),
      fetchNativePrice(chain),
    ]);

    const nativeBalanceFormatted = formatEther(nativeBalance);
    const nativeBalanceUSD = parseFloat(nativeBalanceFormatted) * nativePrice;

    return {
      chainId: config.id,
      chainName: config.name,
      nativeBalance: nativeBalance.toString(),
      nativeBalanceFormatted,
      nativeBalanceUSD,
      tokenBalances: [] as TokenBalance[],
      nftCollections: [] as NFTCollection[],
      defiPositions: [] as DeFiPosition[],
      totalValueUSD: nativeBalanceUSD,
      transactionCount,
      lastActivity: undefined,
      enrichmentStatus: 'partial' as const,
    };
  });

  const chainResults = await Promise.all(quickPromises);
  const totalValueUSD = chainResults.reduce((sum, c) => sum + c.totalValueUSD, 0);

  return {
    chains: chainResults,
    aggregatedData: { totalValueUSD, allTokens: [], allNFTs: [], allDeFiPositions: [] },
    executionTimeMs: Date.now() - startTime,
  };
}
