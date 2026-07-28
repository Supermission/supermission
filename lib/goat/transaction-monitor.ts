/**
 * Transaction Monitoring System
 * Real-time tracking of on-chain transactions with status updates
 */

import { createPublicClient, http, type Hash, type TransactionReceipt } from 'viem';
import { CHAIN_MAP, type SupportedChainId, getChainName, getRpcUrl } from './wallet-provider';

export interface TransactionStatus {
  hash: Hash;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: bigint;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  timestamp?: number;
  error?: string;
}

export interface MonitorOptions {
  confirmations?: number; // Number of confirmations to wait for (default: 1)
  timeout?: number; // Max wait time in ms (default: 60000)
  onUpdate?: (status: TransactionStatus) => void; // Callback for status updates
}

/**
 * Monitor a transaction and stream status updates
 *
 * @param txHash - Transaction hash to monitor
 * @param chainId - Chain ID where transaction was submitted
 * @param options - Monitoring options
 * @returns Final transaction status
 */
export async function monitorTransaction(
  txHash: Hash,
  chainId: SupportedChainId,
  options: MonitorOptions = {}
): Promise<TransactionStatus> {
  const {
    confirmations = 1,
    timeout = 60000, // 60 seconds default
    onUpdate,
  } = options;

  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // Create public client for this chain
  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId), { timeout: 10_000 }),
  });

  console.log(`[TxMonitor] Monitoring ${txHash} on ${getChainName(chainId)}`);

  // Initial status
  const initialStatus: TransactionStatus = {
    hash: txHash,
    status: 'pending',
    confirmations: 0,
  };

  if (onUpdate) {
    onUpdate(initialStatus);
  }

  try {
    // Wait for transaction receipt with timeout
    const receipt = await Promise.race([
      publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transaction timeout')), timeout)
      ),
    ]);

    // Build final status
    const finalStatus: TransactionStatus = {
      hash: txHash,
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      confirmations,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      timestamp: Date.now(),
    };

    console.log(
      `[TxMonitor] Transaction ${receipt.status}: ${txHash} (block ${receipt.blockNumber})`
    );

    if (onUpdate) {
      onUpdate(finalStatus);
    }

    return finalStatus;
  } catch (error: any) {
    console.error('[TxMonitor] Error:', error);

    const errorStatus: TransactionStatus = {
      hash: txHash,
      status: 'failed',
      confirmations: 0,
      error: error.message || 'Unknown error',
      timestamp: Date.now(),
    };

    if (onUpdate) {
      onUpdate(errorStatus);
    }

    return errorStatus;
  }
}

/**
 * Get current status of a transaction (no waiting)
 *
 * @param txHash - Transaction hash to check
 * @param chainId - Chain ID
 * @returns Current transaction status or null if not found
 */
export async function getTransactionStatus(
  txHash: Hash,
  chainId: SupportedChainId
): Promise<TransactionStatus | null> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(getRpcUrl(chainId), { timeout: 10_000 }),
  });

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    if (!receipt) {
      return null;
    }

    // Get current block to calculate confirmations
    const currentBlock = await publicClient.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber);

    return {
      hash: txHash,
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      confirmations,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('[TxMonitor] Error fetching status:', error);
    return null;
  }
}

/**
 * Get block explorer URL for a transaction
 *
 * @param txHash - Transaction hash
 * @param chainId - Chain ID
 * @returns Block explorer URL
 */
export function getExplorerUrl(txHash: Hash, chainId: SupportedChainId): string {
  const explorers: Record<SupportedChainId, string> = {
    8453: 'https://basescan.org/tx',
    84532: 'https://sepolia.basescan.org/tx',
    137: 'https://polygonscan.com/tx',
    42161: 'https://arbiscan.io/tx',
    1: 'https://etherscan.io/tx',
    56: 'https://bscscan.com/tx',
    10: 'https://optimistic.etherscan.io/tx',
    4663: 'https://robinhoodchain.blockscout.com/tx',
  };

  const baseUrl = explorers[chainId] || 'https://basescan.org/tx';
  return `${baseUrl}/${txHash}`;
}

/**
 * Format gas cost for display
 *
 * @param gasUsed - Gas units used
 * @param gasPrice - Effective gas price in wei
 * @param ethPriceUSD - Current ETH price in USD (optional)
 * @returns Formatted gas cost string
 */
export function formatGasCost(
  gasUsed: bigint,
  gasPrice: bigint,
  ethPriceUSD?: number
): string {
  const totalWei = gasUsed * gasPrice;
  const totalEth = Number(totalWei) / 1e18;

  if (ethPriceUSD) {
    const totalUSD = totalEth * ethPriceUSD;
    return `${totalEth.toFixed(6)} ETH ($${totalUSD.toFixed(2)})`;
  }

  return `${totalEth.toFixed(6)} ETH`;
}

/**
 * Estimate time until confirmation based on chain
 *
 * @param chainId - Chain ID
 * @returns Estimated seconds until confirmation
 */
export function estimateConfirmationTime(chainId: SupportedChainId): number {
  const blockTimes: Record<SupportedChainId, number> = {
    8453: 2, // Base: ~2 seconds
    84532: 2, // Base Sepolia: ~2 seconds
    137: 2, // Polygon: ~2 seconds
    42161: 0.25, // Arbitrum: ~0.25 seconds
    1: 12, // Ethereum: ~12 seconds
    56: 3, // BSC: ~3 seconds
    10: 2, // Optimism: ~2 seconds
    4663: 0.25, // Robinhood Chain (Arbitrum L2): ~sub-second soft confirmation
  };

  return blockTimes[chainId] || 2;
}
