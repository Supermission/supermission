/**
 * GOAT Plugin Configuration
 * Defines which DeFi protocols and tools are available per chain
 *
 * LI.FI plugin provides swap and cross-chain bridge capabilities across 35+ chains.
 * ERC-20 plugin handles token balance checks and transfers.
 */

import { erc20 } from '@goat-sdk/plugin-erc20';
import type { PluginBase } from '@goat-sdk/core';
import { BASE_SEPOLIA_TOKENS, isTestnetMode, BASE_SEPOLIA_CHAIN_ID } from './testnet-config';
import { lifiPlugin } from './plugins/lifi.plugin';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_USDG_ADDRESS, ROBINHOOD_WETH_ADDRESS } from '@/lib/chains/robinhood';

// Token configurations per chain
// Base Chain Tokens
const BASE_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
    chains: {
      8453: { contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chains: {
      8453: { contractAddress: '0x4200000000000000000000000000000000000006' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    chains: {
      8453: { contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' as `0x${string}` },
    },
  },
  {
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD',
    chains: {
      8453: { contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    chains: {
      8453: { contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as `0x${string}` },
    },
  },
];

// Polygon Tokens
const POLYGON_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDC.e',
    name: 'Bridged USD Coin',
    chains: {
      137: { contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chains: {
      137: { contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    chains: {
      137: { contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' as `0x${string}` },
    },
  },
  {
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD',
    chains: {
      137: { contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as `0x${string}` },
    },
  },
];

// Arbitrum Tokens
const ARBITRUM_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
    chains: {
      42161: { contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chains: {
      42161: { contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    chains: {
      42161: { contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}` },
    },
  },
  {
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD',
    chains: {
      42161: { contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as `0x${string}` },
    },
  },
];

// Ethereum Mainnet Tokens
const ETHEREUM_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
    chains: {
      1: { contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chains: {
      1: { contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    chains: {
      1: { contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F' as `0x${string}` },
    },
  },
  {
    decimals: 6,
    symbol: 'USDT',
    name: 'Tether USD',
    chains: {
      1: { contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as `0x${string}` },
    },
  },
];

// Robinhood Chain Tokens (USDG stablecoin + WETH). LiFi supports chain 4663,
// so lifiPlugin() below handles swaps + cross-chain bridging for these.
const ROBINHOOD_TOKENS = [
  {
    decimals: 6,
    symbol: 'USDG',
    name: 'Global Dollar',
    chains: {
      [ROBINHOOD_CHAIN_ID]: { contractAddress: ROBINHOOD_USDG_ADDRESS as `0x${string}` },
    },
  },
  {
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chains: {
      [ROBINHOOD_CHAIN_ID]: { contractAddress: ROBINHOOD_WETH_ADDRESS as `0x${string}` },
    },
  },
];

/**
 * Get available plugins for a specific chain
 * Returns plugins with tools configured for that chain
 *
 * @param chainId - Target chain ID
 * @returns Array of GOAT plugins
 */
export function getPluginsForChain(chainId: number): PluginBase[] {
  let result: PluginBase[];

  switch (chainId) {
    case BASE_SEPOLIA_CHAIN_ID: { // Base Sepolia (Testnet)
      result = [
        erc20({ tokens: BASE_SEPOLIA_TOKENS }) as any,
      ];
      break;
    }

    case 8453: { // Base Mainnet
      result = [
        erc20({ tokens: BASE_TOKENS }) as any,
        lifiPlugin() as any,
      ];
      break;
    }

    case 137: // Polygon
      result = [
        erc20({ tokens: POLYGON_TOKENS }) as any,
        lifiPlugin() as any,
      ];
      break;

    case 42161: // Arbitrum
      result = [
        erc20({ tokens: ARBITRUM_TOKENS }) as any,
        lifiPlugin() as any,
      ];
      break;

    case 1: // Ethereum
      result = [
        erc20({ tokens: ETHEREUM_TOKENS }) as any,
        lifiPlugin() as any,
      ];
      break;

    case ROBINHOOD_CHAIN_ID: // Robinhood Chain (4663)
      result = [
        erc20({ tokens: ROBINHOOD_TOKENS }) as any,
        lifiPlugin() as any,
      ];
      break;

    default:
      // Fallback: ERC-20 support only with no pre-configured tokens
      result = [erc20({ tokens: [] }) as any];
  }

  // Circle fallback tools (compliance, bridge check, USYC)
  try {
    const { createCirclePlugin } = require('./plugins/circle.plugin');
    const circlePlugin = createCirclePlugin();
    if (circlePlugin.tools.length > 0) {
      result.push(circlePlugin as any);
    }
  } catch {
    // Circle plugin not available — skip silently
  }

  return result;
}

/**
 * Get all available tokens across all chains
 * Useful for multi-chain operations and portfolio views
 */
export function getAllTokens() {
  return {
    base: BASE_TOKENS,
    polygon: POLYGON_TOKENS,
    arbitrum: ARBITRUM_TOKENS,
    ethereum: ETHEREUM_TOKENS,
  };
}

/**
 * Get all plugins (for cross-chain operations)
 * Note: This may include duplicate tools across chains
 */
export function getAllPlugins(): PluginBase[] {
  // Combine all tokens for cross-chain support
  const allTokens = [
    ...BASE_TOKENS,
    ...POLYGON_TOKENS,
    ...ARBITRUM_TOKENS,
    ...ETHEREUM_TOKENS,
  ];

  return [
    erc20({ tokens: allTokens }) as any,
    lifiPlugin() as any,
  ];
}

/**
 * Check if a chain supports a specific protocol
 */
export function supportsProtocol(chainId: number, protocol: 'lifi' | 'erc20'): boolean {
  const supportedChains: Record<string, number[]> = {
    lifi: [1, 8453, 137, 42161, 10, 43114, 56, ROBINHOOD_CHAIN_ID], // major EVM chains + Robinhood Chain
    erc20: [1, 8453, 137, 42161, 56, 10, 43114, ROBINHOOD_CHAIN_ID], // all EVM chains + Robinhood Chain
  };

  return supportedChains[protocol]?.includes(chainId) ?? false;
}
