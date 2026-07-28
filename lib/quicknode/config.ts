/**
 * QuickNode Pro Configuration
 * Multi-chain RPC endpoints for wallet intelligence
 */

import { ChainConfig, SupportedChain } from '../wallet-intelligence/types';
import { trackedAddressesFor } from '../tokens/registry';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Re-export types for use in other modules
export type { SupportedChain, ChainConfig };

export const CHAIN_CONFIGS: Record<SupportedChain, ChainConfig> = {
  base: {
    id: 8453,
    name: 'Base',
    rpcUrl: httpRpcUrl('base'),
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://basescan.org',
  },
  polygon: {
    id: 137,
    name: 'Polygon',
    rpcUrl: httpRpcUrl('polygon'),
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    blockExplorer: 'https://polygonscan.com',
  },
  ethereum: {
    id: 1,
    name: 'Ethereum',
    rpcUrl: httpRpcUrl('ethereum'),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://etherscan.io',
  },
  arbitrum: {
    id: 42161,
    name: 'Arbitrum',
    rpcUrl: httpRpcUrl('arbitrum'),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorer: 'https://arbiscan.io',
  },
};

// QuickNode rate limits (Pro tier: 25 req/sec)
export const RATE_LIMIT = {
  requestsPerSecond: 25,
  maxConcurrent: 10,
  retryAttempts: 3,
  retryDelay: 1000, // ms
};

// Cache TTL (time to live) in seconds
export const CACHE_TTL = {
  tokenMetadata: 3600, // 1 hour (rarely changes)
  tokenBalance: 60, // 1 minute
  nftMetadata: 3600, // 1 hour
  nftBalance: 300, // 5 minutes
  transactions: 60, // 1 minute
  defiPositions: 300, // 5 minutes
};

// Well-known contract addresses for DeFi detection
export const DEFI_PROTOCOLS: Record<SupportedChain, Record<string, string>> = {
  base: {
    // Aave V3
    '0xa238dd80c259a72e81d7e4664a9801593f98d1c5': 'Aave V3 Pool',
    // Uniswap V3
    '0x33128a8fc17869897dce68ed026d694621f6fdfd': 'Uniswap V3 Factory',
    // Compound III
    '0x46e6b214b524310239732d51387075e0e70970bf': 'Compound III',
  },
  polygon: {
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
    // Uniswap V3
    '0x1f98431c8ad98523631ae4a59f267346ea31f984': 'Uniswap V3 Factory',
    // QuickSwap
    '0x5757371414417b8c6caad45baef941abc7d3ab32': 'QuickSwap Router',
  },
  ethereum: {},
  arbitrum: {
    // Aave V3
    '0x794a61358d6845594f94dc1db02a252b5b4814ad': 'Aave V3 Pool',
    // Uniswap V3
    '0x1f98431c8ad98523631ae4a59f267346ea31f984': 'Uniswap V3 Factory',
    // GMX
    '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a': 'GMX Router',
  },
};

// Known blue-chip NFT collections (to be expanded)
export const BLUE_CHIP_NFTS: Record<SupportedChain, string[]> = {
  base: [
    // Add Base blue-chip collections as they emerge
  ],
  polygon: [
    // Add Polygon blue-chip collections
  ],
  ethereum: [],
  arbitrum: [],
};

// Legacy alias — some files still import STABLECOINS
export { TRACKED_TOKENS as STABLECOINS };

// All ERC-20 tokens to query per chain (stables + blue-chips).
// Native assets (ETH/POL) are fetched separately via getNativeBalance.
// Derived from the token registry (lib/tokens/registry.ts) — the single source
// of truth. Add/remove a tracked token by editing its registry entry's
// `trackedForDiscovery` flag rather than this file.
export const TRACKED_TOKENS: Record<SupportedChain, Set<string>> = {
  base: trackedAddressesFor('base'),
  polygon: trackedAddressesFor('polygon'),
  ethereum: trackedAddressesFor('ethereum'),
  arbitrum: trackedAddressesFor('arbitrum'),
};

// Minimum token balance to include (filter dust)
export const MIN_TOKEN_BALANCE_USD = 0.01;

// Maximum tokens to fetch metadata for (performance)
export const MAX_TOKENS_TO_ENRICH = 20;

// Validate configuration on module load
export function validateConfig(): void {
  const missingVars: string[] = [];

  Object.entries(CHAIN_CONFIGS).forEach(([chain, config]) => {
    if (!config.rpcUrl) {
      missingVars.push(`${chain.toUpperCase()}_RPC_URL`);
    }
  });

  if (missingVars.length > 0) {
    console.warn(
      `[QuickNode Config] Missing environment variables: ${missingVars.join(', ')}`
    );
  }
}

// Helper to get chain config by ID
export function getChainById(chainId: number): ChainConfig | undefined {
  return Object.values(CHAIN_CONFIGS).find((config) => config.id === chainId);
}

// Helper to get chain config by name
export function getChainByName(name: SupportedChain): ChainConfig {
  return CHAIN_CONFIGS[name];
}

// Auto-validate on import
validateConfig();
