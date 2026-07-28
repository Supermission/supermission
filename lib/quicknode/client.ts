/**
 * QuickNode Pro Client
 * Multi-chain RPC client with automatic fallbacks and rate limiting
 */

import { createPublicClient, http, fallback, formatEther, type Address, type PublicClient } from 'viem';
import { base, polygon, mainnet, arbitrum } from 'viem/chains';
import { CHAIN_CONFIGS, RATE_LIMIT } from './config';
import type { SupportedChain, TokenBalance, NFTCollection, NFTToken, Transaction } from '../wallet-intelligence/types';

// ERC-20 ABI (minimal)
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
] as const;

// ERC-721 ABI (minimal)
const ERC721_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
] as const;

// Rate limiter (simple token bucket)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(requestsPerSecond: number) {
    this.capacity = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerSecond;
  }

  async acquire(): Promise<void> {
    await this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until token available
    const waitTime = 1000 / this.refillRate;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    return this.acquire();
  }

  private async refill(): Promise<void> {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// Global rate limiter
const rateLimiter = new RateLimiter(RATE_LIMIT.requestsPerSecond);

/**
 * QuickNode RPC Client
 */
export class QuickNodeClient {
  private clients: Map<SupportedChain, PublicClient>;

  constructor() {
    this.clients = new Map();
    this.initializeClients();
  }

  private initializeClients(): void {
    const getRpcUrls = (chain: SupportedChain): string[] => {
      const primary = CHAIN_CONFIGS[chain].rpcUrl?.trim();
      const publicFallbacks: Record<SupportedChain, string[]> = {
        base: ['https://mainnet.base.org'],
        polygon: ['https://polygon-rpc.com'],
        ethereum: ['https://eth.llamarpc.com'],
        arbitrum: ['https://arb1.arbitrum.io/rpc'],
      };

      const urls = [
        ...(primary ? [primary] : []),
        ...publicFallbacks[chain],
      ];

      // Remove duplicates while preserving order
      return [...new Set(urls)];
    };

    const createChainClient = (
      chain: SupportedChain,
      viemChain: typeof base | typeof polygon | typeof mainnet | typeof arbitrum
    ): PublicClient => {
      const urls = getRpcUrls(chain);
      const transports = urls.map((url) => http(url, { timeout: 10_000 }));
      return createPublicClient({
        chain: viemChain,
        transport: transports.length === 1 ? transports[0] : fallback(transports),
        // Coalesce concurrent balanceOf fan-out (batchGetTokenBalances) into a
        // single Multicall3 request. Multicall3 is deployed at 0xcA11…CA11 on
        // all four chains. This is viem-level aggregation, NOT transport-level
        // JSON-RPC batching (which QuickNode advises against).
        batch: { multicall: true },
      }) as PublicClient;
    };

    // Base client
    this.clients.set('base', createChainClient('base', base));

    // Polygon client
    this.clients.set('polygon', createChainClient('polygon', polygon));

    // Ethereum client
    this.clients.set('ethereum', createChainClient('ethereum', mainnet));

    // Arbitrum client
    this.clients.set('arbitrum', createChainClient('arbitrum', arbitrum));

  }

  private getClient(chain: SupportedChain): PublicClient {
    const client = this.clients.get(chain);
    if (!client) {
      throw new Error(`Client not initialized for chain: ${chain}`);
    }
    return client;
  }

  /**
   * Fetch native token balance (ETH, MATIC)
   */
  async getNativeBalance(chain: SupportedChain, address: Address): Promise<bigint> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      const balance = await client.getBalance({ address });
      return balance;
    } catch (error) {
      console.error(`[QuickNode] Error fetching native balance on ${chain}:`, error);
      return 0n;
    }
  }

  /**
   * Fetch transaction count (nonce)
   */
  async getTransactionCount(chain: SupportedChain, address: Address): Promise<number> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      const count = await client.getTransactionCount({ address });
      return count;
    } catch (error) {
      console.error(`[QuickNode] Error fetching transaction count on ${chain}:`, error);
      return 0;
    }
  }

  /**
   * Fetch ERC-20 token balance
   * Pass knownDecimals to skip the on-chain decimals() read (saves 1 RPC call per token).
   */
  async getTokenBalance(
    chain: SupportedChain,
    tokenAddress: Address,
    walletAddress: Address,
    knownDecimals?: number
  ): Promise<{ balance: bigint; decimals: number } | null> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      if (knownDecimals !== undefined) {
        const balance = await client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
        });
        return { balance: balance as bigint, decimals: knownDecimals };
      }

      const [balance, decimals] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);

      return { balance: balance as bigint, decimals: decimals as number };
    } catch (error) {
      console.error(`[QuickNode] Error fetching token balance on ${chain}:`, error);
      return null;
    }
  }

  /**
   * Fetch ERC-20 token metadata
   */
  async getTokenMetadata(
    chain: SupportedChain,
    tokenAddress: Address
  ): Promise<{ symbol: string; name: string; decimals: number } | null> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name',
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);

      return {
        symbol: symbol as string,
        name: name as string,
        decimals: decimals as number,
      };
    } catch (error) {
      console.error(`[QuickNode] Error fetching token metadata on ${chain}:`, error);
      return null;
    }
  }

  /**
   * Fetch NFT balance for a specific collection
   */
  async getNFTBalance(
    chain: SupportedChain,
    collectionAddress: Address,
    walletAddress: Address
  ): Promise<bigint | null> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      const balance = await client.readContract({
        address: collectionAddress,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      });

      return balance as bigint;
    } catch (error) {
      console.error(`[QuickNode] Error fetching NFT balance on ${chain}:`, error);
      return null;
    }
  }

  /**
   * Fetch NFT collection metadata
   */
  async getNFTCollectionMetadata(
    chain: SupportedChain,
    collectionAddress: Address
  ): Promise<{ name: string; symbol: string } | null> {
    await rateLimiter.acquire();
    const client = this.getClient(chain);

    try {
      const [name, symbol] = await Promise.all([
        client.readContract({
          address: collectionAddress,
          abi: ERC721_ABI,
          functionName: 'name',
        }),
        client.readContract({
          address: collectionAddress,
          abi: ERC721_ABI,
          functionName: 'symbol',
        }),
      ]);

      return {
        name: name as string,
        symbol: symbol as string,
      };
    } catch (error) {
      console.error(`[QuickNode] Error fetching NFT collection metadata on ${chain}:`, error);
      return null;
    }
  }

  /**
   * Fetch recent transactions using Alchemy/Etherscan APIs
   * Note: QuickNode doesn't have a direct transaction history endpoint
   * This would require integration with Alchemy Transfers API or Etherscan API
   */
  async getTransactionHistory(
    chain: SupportedChain,
    address: Address,
    limit: number = 10
  ): Promise<Transaction[]> {
    // This is a placeholder - in production, you would:
    // 1. Use Alchemy's getAssetTransfers API
    // 2. Use Etherscan/Basescan/Polygonscan API
    // 3. Use a subgraph query

    console.warn('[QuickNode] Transaction history requires additional API integration');
    return [];
  }

  /**
   * Batch fetch multiple token balances in parallel
   */
  async batchGetTokenBalances(
    chain: SupportedChain,
    tokenAddresses: Address[],
    walletAddress: Address
  ): Promise<Map<Address, { balance: bigint; decimals: number }>> {
    const results = new Map<Address, { balance: bigint; decimals: number }>();

    // Process in batches of 10 (concurrent limit)
    const batchSize = RATE_LIMIT.maxConcurrent;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (tokenAddress) => {
          const result = await this.getTokenBalance(chain, tokenAddress, walletAddress);
          return { tokenAddress, result };
        })
      );

      batchResults.forEach(({ tokenAddress, result }) => {
        if (result) {
          results.set(tokenAddress, result);
        }
      });
    }

    return results;
  }

  /**
   * Batch fetch multiple token metadata in parallel
   */
  async batchGetTokenMetadata(
    chain: SupportedChain,
    tokenAddresses: Address[]
  ): Promise<Map<Address, { symbol: string; name: string; decimals: number }>> {
    const results = new Map<Address, { symbol: string; name: string; decimals: number }>();

    // Process in batches of 10 (concurrent limit)
    const batchSize = RATE_LIMIT.maxConcurrent;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (tokenAddress) => {
          const result = await this.getTokenMetadata(chain, tokenAddress);
          return { tokenAddress, result };
        })
      );

      batchResults.forEach(({ tokenAddress, result }) => {
        if (result) {
          results.set(tokenAddress, result);
        }
      });
    }

    return results;
  }

  /**
   * Get current ETH/MATIC price in USD
   * Note: This requires a price oracle or external API
   */
  async getNativeTokenPrice(chain: SupportedChain): Promise<number> {
    // Try Etherscan ethprice for ETH-based chains, return 0 for others
    const ethChains = new Set<SupportedChain>(['base', 'ethereum', 'arbitrum']);
    if (ethChains.has(chain)) {
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
      } catch (err) {
        console.warn(`[QuickNode] ETH price fetch failed for ${chain}:`, (err as Error).message ?? err);
      }
    }
    console.warn(`[QuickNode] No price source available for ${chain}, returning 0`);
    return 0;
  }
}

// Singleton instance
let clientInstance: QuickNodeClient | null = null;

export function getQuickNodeClient(): QuickNodeClient {
  if (!clientInstance) {
    clientInstance = new QuickNodeClient();
  }
  return clientInstance;
}
