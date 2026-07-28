/**
 * Privy Server Wallet Manager for Autonomous Agents
 * Provisions and manages wallets for AI agents using Privy Server SDK
 */

import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { withServerWalletRateLimit } from './request-queue';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Type definitions for agent wallet
export interface AgentWalletData {
  address: Address;
  agentId: string;
  createdAt: Date;
  privateKey?: string; // Optional: Only returned on creation, never stored
}

export interface CreateWalletParams {
  agentId: string;
  idempotencyKey?: string;
  exportPrivateKey?: boolean;
}

export interface WalletBalance {
  wei: bigint;
  eth: string;
  usdc?: string;
}

// Public client for balance queries
const publicClient = createPublicClient({
  chain: base,
  transport: http(httpRpcUrl('base'), { timeout: 10_000 }),
});

/**
 * Privy Server Wallet Manager
 * Creates and manages wallets for autonomous agents via Privy Node SDK
 */
export class ServerWalletManager {
  private appId: string;
  private appSecret: string;

  constructor(config: {
    apiKeyId: string;
    apiKeySecret: string;
    walletSecret: string;
    networkId?: string;
    rpcUrl?: string;
  }) {
    // Map old CDP config params to Privy params
    this.appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || config.apiKeyId;
    this.appSecret = process.env.PRIVY_APP_SECRET || config.apiKeySecret;
  }

  /**
   * Create a new wallet for an agent
   */
  async createWallet(params: CreateWalletParams): Promise<AgentWalletData> {
    try {
      const { PrivyClient } = await import('@privy-io/node');

      const privy = new PrivyClient({
        appId: this.appId,
        appSecret: this.appSecret,
      });

      console.log('[Privy Wallet Manager] Creating wallet for agent:', params.agentId);

      // Create wallet via Privy server wallets API
      const wallet = await withServerWalletRateLimit(() =>
        privy.wallets().create({ chain_type: 'ethereum' })
      ) as any;

      const address = wallet.address as Address;

      console.log('[Privy Wallet Manager] Created wallet:', address);

      return {
        address,
        agentId: params.agentId,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error('[Privy Wallet Manager] Failed to create wallet:', error);
      throw new Error(
        `Failed to create wallet for agent ${params.agentId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get wallet balance (native token)
   */
  async getBalance(address: Address): Promise<WalletBalance> {
    try {
      const balance = await publicClient.getBalance({ address });

      const ethBalance = (Number(balance) / 1e18).toFixed(6);

      return {
        wei: balance,
        eth: ethBalance,
      };
    } catch (error) {
      console.error('[Privy Wallet Manager] Failed to get balance:', error);
      throw error;
    }
  }

  /**
   * Get wallet details
   */
  async getWalletInfo(address: Address) {
    try {
      const balance = await publicClient.getBalance({ address });

      return {
        address,
        networkId: 'base',
        chainId: '8453',
        balance: balance.toString(),
      };
    } catch (error) {
      console.error('[Privy Wallet Manager] Failed to get wallet info:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance for server-side usage
 */
let serverWalletManager: ServerWalletManager | null = null;
let serverManagerCreatedAt: number = 0;
const SERVER_WALLET_TTL_MS = parseInt(
  process.env.SERVER_WALLET_TTL_MS || String(60 * 60 * 1000), // 1 hour default
  10
);

export function getServerWalletManager(): ServerWalletManager {
  // Return existing if still within TTL
  if (serverWalletManager && Date.now() - serverManagerCreatedAt <= SERVER_WALLET_TTL_MS) {
    return serverWalletManager;
  }

  // Check for Privy credentials
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'Missing Privy credentials. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET'
    );
  }

  const newManager = new ServerWalletManager({
    apiKeyId: appId,
    apiKeySecret: appSecret,
    walletSecret: '',
    networkId: process.env.NETWORK_ID || 'base',
  });
  serverWalletManager = newManager;
  serverManagerCreatedAt = Date.now();

  return serverWalletManager;
}

// Legacy alias
export const getCdpWalletManager = getServerWalletManager;
export const CdpWalletManager = ServerWalletManager;
