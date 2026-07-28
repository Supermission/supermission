/**
 * Testnet Configuration for AI Agent
 * Base Sepolia for testing DeFi operations
 */

import { baseSepolia } from 'viem/chains';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Base Sepolia (testnet)
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// Testnet RPC URLs (fallback to public RPCs if not configured)
export const TESTNET_RPC_URLS: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]:
    process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL ||
    'https://sepolia.base.org',
};

// Testnet Tokens (Base Sepolia)
// These are test tokens deployed on Base Sepolia
export const BASE_SEPOLIA_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin (Test)',
    chains: {
      [BASE_SEPOLIA_CHAIN_ID]: {
        // Base Sepolia USDC test token
        contractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
      },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether (Test)',
    chains: {
      [BASE_SEPOLIA_CHAIN_ID]: {
        // Base Sepolia WETH
        contractAddress: '0x4200000000000000000000000000000000000006' as `0x${string}`,
      },
    },
  },
];

// Testnet Faucets
export const TESTNET_FAUCETS = {
  [BASE_SEPOLIA_CHAIN_ID]: {
    name: 'Base Sepolia Faucet',
    url: 'https://portal.cdp.coinbase.com/products/faucet',
    description: 'Get test ETH for Base Sepolia',
  },
};

// Check if testnet mode is enabled
export function isTestnetMode(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_EXECUTION_MODE === 'testnet';
}

// Get chain ID based on mode
export function getAgentChainId(): number {
  return isTestnetMode() ? BASE_SEPOLIA_CHAIN_ID : 8453; // Base mainnet default
}

// Get RPC URL for chain
export function getRpcUrlForChain(chainId: number): string {
  if (chainId === BASE_SEPOLIA_CHAIN_ID) {
    return TESTNET_RPC_URLS[BASE_SEPOLIA_CHAIN_ID];
  }

  // Mainnet RPC URLs
  const mainnetUrls: Record<number, string> = {
    8453: httpRpcUrl('base'),
    137: httpRpcUrl('polygon'),
    42161: httpRpcUrl('arbitrum'),
    1: httpRpcUrl('ethereum'),
  };

  return mainnetUrls[chainId] || '';
}

// Get chain name
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: 'Base',
    137: 'Polygon',
    42161: 'Arbitrum',
    1: 'Ethereum',
    [BASE_SEPOLIA_CHAIN_ID]: 'Base Sepolia (Testnet)',
  };

  return names[chainId] || 'Unknown Chain';
}

// Get block explorer URL
export function getBlockExplorerUrl(chainId: number): string {
  const explorers: Record<number, string> = {
    8453: 'https://basescan.org',
    137: 'https://polygonscan.com',
    42161: 'https://arbiscan.io',
    1: 'https://etherscan.io',
    [BASE_SEPOLIA_CHAIN_ID]: 'https://sepolia.basescan.org',
  };

  return explorers[chainId] || '';
}

// Testnet configuration warnings
export function getTestnetWarnings(): string[] {
  if (!isTestnetMode()) return [];

  return [
    '⚠️ TESTNET MODE ENABLED',
    'Using Base Sepolia testnet for testing',
    'Transactions will NOT use real funds',
    'Get test ETH from: https://portal.cdp.coinbase.com/products/faucet',
  ];
}
