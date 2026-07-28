import { NextRequest, NextResponse } from 'next/server';
import { Address, formatUnits } from 'viem';
import { getQuickNodeClient } from '@/lib/quicknode/client';
import { STABLECOINS, type SupportedChain } from '@/lib/quicknode/config';
import { getNativeTokenPrice as getChainlinkNativePrice, getTokenPriceWithFallback } from '@/lib/chainlink/price-feeds';
import { getCoinDeskClient } from '@/lib/coindesk/client';
import { symbolForAddress, STABLECOIN_SYMBOLS as REGISTRY_STABLE_SYMBOLS, byAddress } from '@/lib/tokens/registry';
import { robinhoodClient } from '@/lib/viem/clients';
import { ROBINHOOD_USDG_ADDRESS, ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import { serverHttpRpcUrl } from '@/lib/rpc/endpoints';

interface TokenHolding {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  balanceRaw: string;
  decimals: number;
  priceUSD: number;
  balanceUSD: number;
  logo?: string;
  chainId: number;
}

interface ChainBalance {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeBalanceUSD: number;
  tokenCount: number;
  totalBalanceUSD: number;
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

    // Fetch data from the QuickNode-backed chains in parallel.
    const chains: Array<{ chain: SupportedChain; chainId: number; name: string; symbol: string }> = [
      { chain: 'base', chainId: 8453, name: 'Base', symbol: 'ETH' },
      { chain: 'polygon', chainId: 137, name: 'Polygon', symbol: 'POL' },
      { chain: 'ethereum', chainId: 1, name: 'Ethereum', symbol: 'ETH' },
      { chain: 'arbitrum', chainId: 42161, name: 'Arbitrum', symbol: 'ETH' },
    ];

    // Run all chains fully in parallel — Etherscan V2 supports 5 req/s,
    // and each chain makes only 1 addresstokenbalance call. Robinhood Chain
    // (4663) is fetched alongside via a dedicated viem client (it's not a
    // QuickNodeClient SupportedChain — see fetchRobinhoodData).
    const [results, robinhoodResult] = await Promise.all([
      Promise.allSettled(
        chains.map(async (chainInfo) => {
          try {
            return await fetchChainData(address, chainInfo);
          } catch (error) {
            console.warn('[dashboard/wallet/overview] chain fetch failed:', chainInfo.name, error);
            return null;
          }
        })
      ),
      fetchRobinhoodData(address).catch((error) => {
        console.warn('[dashboard/wallet/overview] Robinhood fetch failed:', error);
        return null;
      }),
    ]);

    const chainBalances: ChainBalance[] = [];
    const allTokens: TokenHolding[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      chainBalances.push(result.value.chainBalance);
      allTokens.push(...result.value.tokens);
    }

    // Robinhood Chain — always surfaced as a first-class chain row (fetchRobinhoodData
    // degrades every read to 0 rather than throwing), so it shows like Base/Ethereum
    // even at $0. Only skipped if the whole fetch unexpectedly rejected.
    if (robinhoodResult) {
      chainBalances.push(robinhoodResult.chainBalance);
      allTokens.push(...robinhoodResult.tokens);
    }

    // Calculate totals
    const totalPortfolioUSD = chainBalances.reduce((sum, c) => sum + c.totalBalanceUSD, 0);
    const totalTokenCount = allTokens.length;
    const totalNativeUSD = chainBalances.reduce((sum, c) => sum + c.nativeBalanceUSD, 0);
    const totalTokensUSD = allTokens.reduce((sum, t) => sum + t.balanceUSD, 0);

    // Sort tokens by USD value
    const sortedTokens = allTokens.sort((a, b) => b.balanceUSD - a.balanceUSD);

    // Calculate weighted 24h portfolio change (non-blocking — defaults to 0 on failure)
    const change24h = await calculate24hChange(chainBalances, sortedTokens);

    return NextResponse.json({
      success: true,
      data: {
        address,
        summary: {
          totalPortfolioUSD,
          totalTokenCount,
          totalChains: chainBalances.length,
          totalNativeUSD,
          totalTokensUSD,
          change24h,
        },
        chains: chainBalances,
        tokens: sortedTokens,
        timestamp: Date.now()
      }
    }, {
      headers: { 'Cache-Control': 'private, s-maxage=15, stale-while-revalidate=60' },
    });

  } catch (error: any) {
    console.error('[Dashboard:Wallet] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wallet data', details: error.message },
      { status: 500 }
    );
  }
}

// Helper: Fetch data for a single chain using QuickNode
async function fetchChainData(
  address: Address,
  chainInfo: { chain: SupportedChain; chainId: number; name: string; symbol: string }
) {
  const qnClient = getQuickNodeClient();

  try {
    // Fetch native balance, native price, and ERC-20 tokens all in parallel
    const [balanceWei, nativePrice, erc20Tokens] = await Promise.all([
      qnClient.getNativeBalance(chainInfo.chain, address),
      getNativeTokenPrice(chainInfo.chainId),
      fetchTokenHoldings(address, chainInfo.chain, chainInfo.chainId),
    ]);
    const nativeBalance = parseFloat(formatUnits(balanceWei, 18));
    const nativeBalanceUSD = nativeBalance * nativePrice;

    // Include native asset (ETH/POL) as a token entry so it appears in holdings list.
    // Previously only stablecoins were in tokens[], so native assets were invisible in holdings.
    const tokens: TokenHolding[] = [];
    if (nativeBalance > 0.0001) {
      tokens.push({
        address: '0x0000000000000000000000000000000000000000', // zero address = native asset
        symbol: chainInfo.symbol,
        name: chainInfo.symbol === 'ETH' ? 'Ethereum' : chainInfo.symbol === 'POL' ? 'Polygon' : chainInfo.symbol,
        balance: nativeBalance.toFixed(18),
        balanceRaw: balanceWei.toString(),
        decimals: 18,
        priceUSD: nativePrice,
        balanceUSD: nativeBalanceUSD,
        chainId: chainInfo.chainId,
      });
    }
    tokens.push(...erc20Tokens);

    const tokenBalanceUSD = tokens.reduce((sum, t) => sum + t.balanceUSD, 0);
    // totalBalanceUSD is now just tokenBalanceUSD since native is included in tokens
    const totalBalanceUSD = tokenBalanceUSD;

    const chainBalance: ChainBalance = {
      chainId: chainInfo.chainId,
      name: chainInfo.name,
      nativeSymbol: chainInfo.symbol,
      nativeBalance,
      nativeBalanceUSD,
      tokenCount: tokens.length,
      totalBalanceUSD,
    };

    return { chainBalance, tokens };
  } catch (error) {
    console.warn(`[Dashboard:Wallet] Failed to fetch data for ${chainInfo.name}:`, error);
    return null;
  }
}

// Minimal ERC-20 balanceOf ABI for the direct Robinhood balance read.
const ERC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

// Helper: Fetch Robinhood Chain (4663) holdings — native ETH + USDG.
// Robinhood is NOT a QuickNodeClient SupportedChain, so it uses the shared
// `robinhoodClient` viem instance (QuickNode Robinhood endpoint, public
// fallback if unset). USDG is a $1-pegged stablecoin with no Chainlink/CoinGecko
// coverage on this chain, so it's priced at its registry peg. Returns null when
// the wallet holds nothing here, so no empty Robinhood row is shown.
async function fetchRobinhoodData(address: Address) {
  // USDG metadata (symbol/name/decimals/peg) from the token registry — single
  // source of truth. Falls back to hardcoded facts if the entry is ever removed.
  const usdgMeta = byAddress(ROBINHOOD_USDG_ADDRESS, ROBINHOOD_CHAIN_ID);
  const usdgDecimals = usdgMeta?.decimals ?? 6;
  const usdgSymbol = usdgMeta?.symbol ?? 'USDG';
  const usdgName = usdgMeta?.name ?? 'Global Dollar';
  const usdgPrice = usdgMeta?.pegUsd ?? 1;

  // Each read degrades to a safe default on failure so the Robinhood chain row
  // ALWAYS surfaces (like Base/Ethereum show at $0) — a flaky/misconfigured
  // Robinhood RPC must not make the whole chain disappear from the dashboard.
  const [balanceWei, usdgRaw, ethPrice] = await Promise.all([
    robinhoodClient.getBalance({ address }).catch((e) => {
      console.warn('[dashboard/wallet/overview] Robinhood native balance read failed:', e);
      return 0n;
    }),
    (robinhoodClient.readContract({
      address: ROBINHOOD_USDG_ADDRESS as Address,
      abi: ERC20_BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>).catch((e) => {
      console.warn('[dashboard/wallet/overview] Robinhood USDG balance read failed:', e);
      return 0n;
    }),
    // Native gas token on Robinhood Chain is ETH — price off the Ethereum
    // mainnet ETH/USD feed (ETH is fungible across chains).
    getNativeTokenPrice(1).catch(() => 0),
  ]);

  const nativeBalance = parseFloat(formatUnits(balanceWei, 18));
  const nativeBalanceUSD = nativeBalance * ethPrice;
  const usdgBalance = parseFloat(formatUnits(usdgRaw, usdgDecimals));

  // Always surface Robinhood as a first-class chain row (like Base/Ethereum/etc.
  // show at $0) — it's a supported chain now, so users should see it even empty.
  const tokens: TokenHolding[] = [];

  if (nativeBalance > 0.0001) {
    tokens.push({
      address: '0x0000000000000000000000000000000000000000', // native asset
      symbol: 'ETH',
      name: 'Ethereum',
      balance: nativeBalance.toFixed(18),
      balanceRaw: balanceWei.toString(),
      decimals: 18,
      priceUSD: ethPrice,
      balanceUSD: nativeBalanceUSD,
      chainId: ROBINHOOD_CHAIN_ID,
    });
  }

  if (usdgBalance > 0) {
    tokens.push({
      address: ROBINHOOD_USDG_ADDRESS.toLowerCase(),
      symbol: usdgSymbol,
      name: usdgName,
      balance: usdgBalance.toFixed(usdgDecimals),
      balanceRaw: usdgRaw.toString(),
      decimals: usdgDecimals,
      priceUSD: usdgPrice,
      balanceUSD: usdgBalance * usdgPrice,
      chainId: ROBINHOOD_CHAIN_ID,
    });
  }

  const totalBalanceUSD = tokens.reduce((sum, t) => sum + t.balanceUSD, 0);

  const chainBalance: ChainBalance = {
    chainId: ROBINHOOD_CHAIN_ID,
    name: 'Robinhood',
    nativeSymbol: 'ETH',
    nativeBalance,
    nativeBalanceUSD,
    tokenCount: tokens.length,
    totalBalanceUSD,
  };

  return { chainBalance, tokens };
}

// PRIMARY token discovery. Uses QuickNode's indexed Token API (v2)
// `qn_getWalletTokenBalance` when the Token & NFT API v2 add-on is provisioned on
// that chain's endpoint; otherwise transparently falls back to the Etherscan V2
// discovery below. QuickNode returns ALL ERC-20 balances for the wallet in one
// (paginated) indexed call — no per-token balanceOf fan-out — collapsing the
// prior multi-second latency into a single round trip per chain.
async function discoverTokenBalancesPrimary(
  address: Address,
  chain: SupportedChain,
): Promise<Map<string, { balance: bigint; decimals: number; symbol: string }>> {
  const viaQuickNode = await discoverTokenBalancesQuickNode(address, chain);
  // null == QuickNode add-on not provisioned / method unsupported / transport
  // failure on this chain → fall back to the Etherscan discovery so nothing breaks.
  if (viaQuickNode !== null) return viaQuickNode;
  return discoverTokenBalances(address, chain);
}

// Discover ALL ERC-20 balances via QuickNode's indexed Token API v2
// (`qn_getWalletTokenBalance`). Docs: https://www.quicknode.com/docs/ethereum/qn_getWalletTokenBalance_v2
//
// Request:  POST <serverHttpRpcUrl(chain)> JSON-RPC
//           { method: 'qn_getWalletTokenBalance', params: [{ wallet, page, perPage: 100 }] }
// Response: result.result[] of { name, symbol, decimals (string), address, totalBalance (raw
//           smallest-unit string) }, plus result.totalPages / result.pageNumber for pagination.
//
// Returns the discovered balances Map, or `null` to signal the caller to fall
// back to Etherscan — used when the add-on isn't enabled on this chain (JSON-RPC
// error / method-not-found), an HTTP error, or any transport/parse failure. A
// successful call with zero tokens returns an empty Map (NOT null), so we don't
// needlessly hit Etherscan for wallets that legitimately hold nothing.
async function discoverTokenBalancesQuickNode(
  address: Address,
  chain: SupportedChain,
): Promise<Map<string, { balance: bigint; decimals: number; symbol: string }> | null> {
  const url = serverHttpRpcUrl(chain);
  const discovered = new Map<string, { balance: bigint; decimals: number; symbol: string }>();

  const perPage = 100;
  let page = 1;
  const MAX_PAGES = 10; // safety cap: up to 1000 tokens per wallet

  try {
    while (page <= MAX_PAGES) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'qn_getWalletTokenBalance',
          params: [{ wallet: address, page, perPage }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      // HTTP-level failure → treat as unsupported, fall back to Etherscan.
      if (!res.ok) return null;

      const json = await res.json();

      // JSON-RPC error (e.g. method not found because the Token API v2 add-on
      // isn't provisioned on this endpoint) → signal fallback.
      if (json?.error) return null;

      const result = json?.result;
      if (!result || !Array.isArray(result.result)) return null;

      for (const token of result.result) {
        const addr = (token.address || '').toLowerCase();
        if (!addr) continue;

        const decimals = parseInt(token.decimals, 10) || 18;
        // Filter spam (decimals 0 are almost always phishing tokens).
        if (decimals === 0) continue;

        // totalBalance is a raw smallest-unit integer string (e.g. "4130990642").
        let balance: bigint;
        try {
          balance = BigInt(token.totalBalance ?? token.total_balance ?? '0');
        } catch {
          continue; // non-integer balance — skip this token, keep the rest.
        }
        if (balance <= 0n) continue;

        discovered.set(addr, {
          balance,
          decimals,
          symbol: token.symbol || 'TOKEN',
        });
      }

      const totalPages = Number(result.totalPages) || 1;
      if (page >= totalPages) break;
      page++;
    }
  } catch {
    // Network/parse/timeout failure → fall back to Etherscan discovery.
    return null;
  }

  return discovered;
}

// Etherscan V2 chain IDs
const ETHERSCAN_CHAIN_IDS: Record<string, number> = {
  base: 8453,
  polygon: 137,
  ethereum: 1,
  arbitrum: 42161,
};

// Discover ALL ERC-20 tokens in a wallet via Etherscan V2 addresstokenbalance endpoint.
// Single call returns all token balances with metadata (symbol, decimals).
// Falls back to the old tokentx + tokenbalance approach if addresstokenbalance is unavailable (e.g. Lite plan).
async function discoverTokenBalances(
  address: Address,
  chain: SupportedChain,
): Promise<Map<string, { balance: bigint; decimals: number; symbol: string }>> {
  const discovered = new Map<string, { balance: bigint; decimals: number; symbol: string }>();

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return discovered;

  const chainId = ETHERSCAN_CHAIN_IDS[chain];
  if (!chainId) return discovered;

  try {
    // Single call to get ALL ERC-20 token balances with metadata
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=addresstokenbalance&address=${address}&page=1&offset=100&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      // addresstokenbalance may not be available on Lite plan — fall back to old approach
      return discoverTokenBalancesFallback(address, chain);
    }

    for (const token of data.result) {
      const addr = (token.TokenAddress || '').toLowerCase();
      if (!addr) continue;

      const decimals = parseInt(token.TokenDivisor) || 18;
      // Filter spam (decimals 0)
      if (decimals === 0) continue;

      const rawBalance = token.TokenQuantity || '0';
      const balance = BigInt(rawBalance);
      if (balance <= 0n) continue;

      discovered.set(addr, {
        balance,
        decimals,
        symbol: token.TokenSymbol || 'TOKEN',
      });
    }
  } catch {
    // Fall back to the old tokentx + tokenbalance approach
    return discoverTokenBalancesFallback(address, chain);
  }

  return discovered;
}

// Fallback: Discover ERC-20 tokens via the old 2-step approach (tokentx + tokenbalance).
// Used when addresstokenbalance is not available on the current Etherscan plan.
async function discoverTokenBalancesFallback(
  address: Address,
  chain: SupportedChain,
): Promise<Map<string, { balance: bigint; decimals: number; symbol: string }>> {
  const discovered = new Map<string, { balance: bigint; decimals: number; symbol: string }>();

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return discovered;

  const chainId = ETHERSCAN_CHAIN_IDS[chain];
  if (!chainId) return discovered;

  try {
    // Step 1: Get token transfers to discover which tokens this wallet has
    const txRes = await fetch(
      `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokentx&address=${address}&page=1&offset=100&sort=desc&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const txData = await txRes.json();

    if (txData.status !== '1' || !Array.isArray(txData.result)) return discovered;

    // Extract unique tokens from transfer history
    const uniqueTokens = new Map<string, { symbol: string; decimals: number }>();
    for (const tx of txData.result) {
      const addr = tx.contractAddress?.toLowerCase();
      if (addr && !uniqueTokens.has(addr)) {
        const decimals = parseInt(tx.tokenDecimal) || 18;
        // Filter out spam tokens (decimals: 0 are almost always spam/phishing)
        if (decimals === 0) continue;
        uniqueTokens.set(addr, {
          symbol: tx.tokenSymbol || 'TOKEN',
          decimals,
        });
      }
    }

    // Step 2: Get current balance for each unique token (batched to respect rate limits)
    const tokenEntries = Array.from(uniqueTokens.entries()).slice(0, 30);

    // Etherscan rate limit is 5/sec — chains run in parallel so budget is shared
    for (let i = 0; i < tokenEntries.length; i += 5) {
      const batch = tokenEntries.slice(i, i + 5);
      const balanceResults = await Promise.all(
        batch.map(async ([tokenAddr, meta]) => {
          try {
            const balRes = await fetch(
              `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokenbalance&contractaddress=${tokenAddr}&address=${address}&tag=latest&apikey=${apiKey}`,
              { signal: AbortSignal.timeout(8000) }
            );
            const balData = await balRes.json();
            if (balData.status === '1' && balData.result) {
              const balance = BigInt(balData.result);
              if (balance > 0n) {
                return { addr: tokenAddr, balance, ...meta };
              }
            }
          } catch { /* skip */ }
          return null;
        })
      );

      for (const result of balanceResults) {
        if (result) {
          discovered.set(result.addr, {
            balance: result.balance,
            decimals: result.decimals,
            symbol: result.symbol,
          });
        }
      }

      // Small delay between batches to respect 5/sec rate limit
      if (i + 5 < tokenEntries.length) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
  } catch {
    // Etherscan failed — caller falls back to predefined list
  }

  return discovered;
}

// Helper: Fetch token holdings — predefined list + dynamic discovery for any token in wallet
async function fetchTokenHoldings(
  address: Address,
  chain: SupportedChain,
  chainId: number
): Promise<TokenHolding[]> {
  const qnClient = getQuickNodeClient();

  try {
    // Run both in parallel: predefined token balances + discovery of ALL tokens
    const stablecoins = Array.from(STABLECOINS[chain] || []) as `0x${string}`[];

    const [predefinedBalances, discoveredBalances] = await Promise.all([
      stablecoins.length > 0
        ? qnClient.batchGetTokenBalances(chain, stablecoins, address)
        : new Map(),
      discoverTokenBalancesPrimary(address, chain),
    ]);

    // Merge: predefined tokens + discovered tokens (predefined takes priority for known symbols)
    const mergedTokens = new Map<string, { balance: bigint; decimals: number; symbol?: string }>();

    // Add predefined first
    for (const [tokenAddr, balanceData] of predefinedBalances.entries()) {
      if (balanceData.balance === 0n) continue;
      mergedTokens.set(tokenAddr, balanceData);
    }

    // Add discovered tokens that aren't already in predefined
    for (const [tokenAddr, balanceData] of discoveredBalances.entries()) {
      if (!mergedTokens.has(tokenAddr) && balanceData.balance > 0n) {
        mergedTokens.set(tokenAddr, balanceData);
      }
    }

    // Build token entries and fetch prices for all via getTokenPrice
    const tokenEntries: Array<{ addr: string; balance: number; decimals: number; symbol?: string }> = [];
    for (const [tokenAddr, balanceData] of mergedTokens.entries()) {
      const balance = parseFloat(formatUnits(balanceData.balance, balanceData.decimals));
      tokenEntries.push({
        addr: tokenAddr,
        balance,
        decimals: balanceData.decimals,
        symbol: balanceData.symbol,
      });
    }

    // Fetch prices for all tokens
    const priceResults = tokenEntries.length > 0
      ? await Promise.all(tokenEntries.map(t => getTokenPrice(t.addr, chainId)))
      : [];
    const priceMap = new Map<string, number>();
    tokenEntries.forEach((t, i) => priceMap.set(t.addr, priceResults[i]));

    const holdings: TokenHolding[] = [];
    for (const entry of tokenEntries) {
      const { addr, balance, decimals, symbol: discoveredSymbol } = entry;
      const priceUSD = priceMap.get(addr) || 0;
      const balanceUSD = balance * priceUSD;
      const symbol = getTokenSymbol(addr) !== 'TOKEN' ? getTokenSymbol(addr) : (discoveredSymbol || 'TOKEN');

      if (balance > 0) {
        holdings.push({
          address: addr,
          symbol,
          name: symbol,
          balance: balance.toFixed(decimals),
          balanceRaw: BigInt(Math.round(balance * 10 ** decimals)).toString(),
          decimals,
          priceUSD,
          balanceUSD,
          chainId,
        });
      }
    }

    return holdings;
  } catch (error) {
    console.warn(`[Dashboard:Wallet] Failed to fetch tokens for ${chain}:`, error);
    return [];
  }
}

// Helper: Get token price using Chainlink → CoinDesk → CoinGecko fallback chain
async function getTokenPrice(tokenAddress: string, chainId: number): Promise<number> {
  try {
    const price = await getTokenPriceWithFallback(tokenAddress, chainId);
    return price;
  } catch (error) {
    console.warn('[Dashboard:Wallet] Failed to fetch token price:', error);
    // Only safe to default to $1 for stablecoins; return 0 for unknowns
    // so dust tokens don't inflate portfolio value
    return 0;
  }
}

// Helper: Get token symbol from contract address.
// Sourced from the token registry (lib/tokens/registry.ts) — the single source
// of truth. Returns 'TOKEN' for addresses not in the registry.
function getTokenSymbol(tokenAddress: string): string {
  return symbolForAddress(tokenAddress) || 'TOKEN';
}

// OLD CODE removed - now using QuickNode integration

// Helper: Get native token price for all 5 chains
// Now using Chainlink Data Feeds (decentralized oracles)
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
    console.warn(`[Dashboard:Wallet] All price sources failed for chain ${chainId}, returning 0`);
    return 0;
  }
}

// Helper: Calculate weighted 24h portfolio change using CoinDesk
const NATIVE_SYMBOLS: Record<number, string> = { 8453: 'ETH', 137: 'MATIC', 1: 'ETH', 42161: 'ETH' };
// Registry stablecoin symbols (USDC, USDC.e, pUSD, USDbC, USDG, USDT, DAI) plus
// symbol-only classifications not modeled as tokens (FRAX/LUSD/BUSD). USDG is a
// no-op here (Robinhood is not scanned by this route).
const STABLE_SYMBOLS = new Set([...REGISTRY_STABLE_SYMBOLS, 'FRAX', 'LUSD', 'BUSD']);

async function calculate24hChange(
  chains: ChainBalance[],
  tokens: TokenHolding[]
): Promise<number> {
  try {
    const coindesk = getCoinDeskClient();
    const symbolValueMap = new Map<string, number>();

    // Native assets
    for (const chain of chains) {
      const sym = NATIVE_SYMBOLS[chain.chainId];
      if (sym && chain.nativeBalanceUSD > 0) {
        symbolValueMap.set(sym, (symbolValueMap.get(sym) || 0) + chain.nativeBalanceUSD);
      }
    }

    // Tokens
    for (const token of tokens) {
      if (token.balanceUSD > 0 && !STABLE_SYMBOLS.has(token.symbol)) {
        const sym = token.symbol === 'WETH' ? 'ETH' : token.symbol === 'WBTC' ? 'BTC' : token.symbol === 'WMATIC' ? 'MATIC' : token.symbol;
        symbolValueMap.set(sym, (symbolValueMap.get(sym) || 0) + token.balanceUSD);
      }
    }

    const symbols = Array.from(symbolValueMap.keys()).filter(s => !STABLE_SYMBOLS.has(s));
    if (symbols.length === 0) return 0;

    const prices = await coindesk.getMultiPrice(symbols);
    const totalValue = Array.from(symbolValueMap.values()).reduce((a, b) => a + b, 0);
    if (totalValue === 0) return 0;

    let weightedChange = 0;
    for (const [symbol, value] of symbolValueMap.entries()) {
      const priceData = prices.get(symbol);
      if (priceData) {
        weightedChange += priceData.changePct24h * (value / totalValue);
      }
    }
    return weightedChange;
  } catch {
    return 0;
  }
}
