/**
 * GOAT Wallet Provider
 * Bridges Wagmi/Viem wallet clients with GOAT SDK
 * Supports multi-chain operations (Base, Polygon, Arbitrum, Ethereum, BSC)
 */

import { viem } from '@goat-sdk/wallet-viem';
import { createWalletClient, http, type WalletClient } from 'viem';
import { base, baseSepolia, polygon, arbitrum, mainnet, bsc, optimism } from 'viem/chains';
import { robinhoodChain, ROBINHOOD_CHAIN_ID } from '@/lib/chains/robinhood';
import type { EVMWalletClient } from '@goat-sdk/wallet-evm';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Chain mapping
export const CHAIN_MAP = {
  8453: base,        // Base
  84532: baseSepolia, // Base Sepolia (Testnet)
  137: polygon,      // Polygon
  42161: arbitrum,   // Arbitrum
  1: mainnet,        // Ethereum
  56: bsc,           // BSC
  10: optimism,      // Optimism
  [ROBINHOOD_CHAIN_ID]: robinhoodChain, // Robinhood Chain (4663)
} as const;

export type SupportedChainId = keyof typeof CHAIN_MAP;

/**
 * Get RPC URL for a chain
 */
export function getRpcUrl(chainId: SupportedChainId): string {
  const rpcMap: Record<SupportedChainId, string> = {
    8453: httpRpcUrl('base'),
    84532: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    137: httpRpcUrl('polygon'),
    42161: httpRpcUrl('arbitrum'),
    1: httpRpcUrl('ethereum'),
    56: process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    10: process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    [ROBINHOOD_CHAIN_ID]: httpRpcUrl('robinhood'),
  };
  return rpcMap[chainId];
}

/**
 * Get chain name for display
 */
export function getChainName(chainId: number): string {
  const names: Record<number, string> = {
    8453: 'Base',
    84532: 'Base Sepolia (Testnet)',
    137: 'Polygon',
    42161: 'Arbitrum',
    1: 'Ethereum',
    56: 'BSC',
    10: 'Optimism',
    [ROBINHOOD_CHAIN_ID]: 'Robinhood Chain',
  };
  return names[chainId] || 'Unknown';
}

/**
 * Create GOAT wallet client from Viem wallet client
 * This is the primary method for server-side wallet creation
 *
 * @param walletClient - Viem WalletClient with account
 * @returns GOAT-compatible EVM wallet client
 */
export function createGoatWallet(walletClient: WalletClient): any {
  if (!walletClient.account) {
    throw new Error('Wallet client must have an account');
  }

  // Wrap with GOAT
  // Note: Returning 'any' type due to GOAT SDK internal dependency version conflicts
  // This works correctly at runtime despite TypeScript incompatibility
  return viem(walletClient as any);
}

/**
 * Create GOAT wallet from address and chain (for read-only operations)
 * Note: This creates a wallet without signing capabilities
 * Use this for balance queries and simulations only
 *
 * @param address - Wallet address
 * @param chainId - Target chain ID
 * @returns GOAT-compatible EVM wallet client (read-only)
 */
export function createReadOnlyGoatWallet(
  address: `0x${string}`,
  chainId: SupportedChainId
): any {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const walletClient = createWalletClient({
    account: address,
    chain,
    transport: http(getRpcUrl(chainId), { timeout: 10_000 }),
  });

  // Note: Returning 'any' type due to GOAT SDK internal dependency version conflicts
  return viem(walletClient as any);
}

/**
 * Verify GOAT wallet is functional
 * Useful for debugging and health checks
 */
export async function verifyGoatWallet(wallet: any): Promise<{
  address: string;
  chainId: number;
  balance?: string;
}> {
  try {
    const address = wallet.getAddress();
    const chain = wallet.getChain();

    return {
      address,
      chainId: chain.id,
    };
  } catch (error) {
    throw new Error(
      `GOAT wallet verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
