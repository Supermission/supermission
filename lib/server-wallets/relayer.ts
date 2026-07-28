/**
 * Relayer Utility
 *
 * Centralizes on-chain write transactions for relayer operations
 * using Privy Server Wallets. Requires PRIVY_APP_SECRET env var.
 *
 * Includes exponential backoff retry for transient errors.
 */

import {
  Address,
  Abi,
  encodeFunctionData,
  Hash,
} from 'viem';
import { withServerWalletRateLimit } from './request-queue';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Cached Privy client and relayer wallet ID
let cachedPrivyClient: any = null;
let cachedRelayerWalletId: string | null = null;
let cachedRelayerAddress: Address | null = null;

function getRpcUrl(): string {
  return httpRpcUrl('base');
}

async function getPrivyClientAndAddress(): Promise<{
  privyClient: any;
  relayerAddress: Address;
  walletId: string;
}> {
  if (cachedPrivyClient && cachedRelayerAddress && cachedRelayerWalletId) {
    return { privyClient: cachedPrivyClient, relayerAddress: cachedRelayerAddress, walletId: cachedRelayerWalletId };
  }

  if (!process.env.PRIVY_APP_SECRET || !process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    throw new Error('PRIVY_APP_SECRET and NEXT_PUBLIC_PRIVY_APP_ID are required for relayer operations');
  }

  const { PrivyClient } = await import('@privy-io/node');
  const privyClient = new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  });

  // Get or create relayer wallet
  let walletId: string;
  let address: Address;

  try {
    const newWallet = await withServerWalletRateLimit(() =>
      privyClient.wallets().create({ chain_type: 'ethereum' })
    ) as any;
    walletId = newWallet.id;
    address = newWallet.address as Address;
  } catch (error) {
    console.error('[Relayer] Failed to initialize Privy wallet:', error);
    throw error;
  }

  cachedPrivyClient = privyClient;
  cachedRelayerWalletId = walletId;
  cachedRelayerAddress = address;
  return { privyClient, relayerAddress: address, walletId };
}

/**
 * Check if an error is transient (worth retrying).
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('service unavailable') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504')
  );
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RelayContractCallParams {
  contractAddress: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

export interface RelayTransactionParams {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
  gas?: bigint;
}

/**
 * Relay a contract call on-chain via Privy Server Wallet.
 *
 * Retries transient errors up to 3 times with exponential backoff.
 */
export async function relayContractCall(
  params: RelayContractCallParams
): Promise<Hash> {
  const data = encodeFunctionData({
    abi: params.abi,
    functionName: params.functionName,
    args: params.args as unknown[],
  });

  return relayTransaction({
    to: params.contractAddress,
    data,
  });
}

/**
 * Relay a raw transaction on-chain via Privy Server Wallet.
 *
 * Retries transient errors up to 3 times with exponential backoff.
 */
export async function relayTransaction(
  params: RelayTransactionParams
): Promise<Hash> {
  let lastError: unknown;
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { privyClient, walletId } = await getPrivyClientAndAddress();

      const transaction: Record<string, string> = {
        to: params.to as string,
        data: params.data as string,
      };
      if (params.value) {
        transaction.value = `0x${params.value.toString(16)}`;
      }

      const result = await withServerWalletRateLimit(() =>
        privyClient.wallets().ethereum.sendTransaction({
          walletId,
          caip2: 'eip155:8453', // Base mainnet
          transaction,
        })
      ) as any;

      return (result.hash || result.transactionHash) as Hash;
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === MAX_RETRIES - 1) {
        break;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[Relayer] Transient error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Get the relayer's address (for logging/auditing).
 * Returns null if Privy is not configured.
 */
export async function getRelayerAddress(): Promise<Address | null> {
  if (!process.env.PRIVY_APP_SECRET || !process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return null;
  }

  try {
    const { relayerAddress } = await getPrivyClientAndAddress();
    return relayerAddress;
  } catch {
    return null;
  }
}
