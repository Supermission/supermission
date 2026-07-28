/**
 * Circle CCTP V2 Bridge via Bridge Kit SDK.
 * Native USDC burn-and-mint — no wrapped tokens, no liquidity pools.
 *
 * Replaces the Polymarket-specific bridge when CIRCLE_BRIDGE_ENABLED=true.
 * Falls back to existing Polymarket bridge when disabled.
 *
 * NOTE: The Bridge Kit requires an adapter (e.g. from @circle-fin/adapter-viem-v2)
 * to sign transactions. The adapter is passed in by the caller (hook or API route).
 */

import { isCircleFeatureEnabled } from './config';

/** Chain ID → Bridge Kit chain name mapping */
const CHAIN_ID_TO_BRIDGE_CHAIN: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  43114: 'Avalanche',
};

export interface CircleBridgeParams {
  sourceChainId: number;
  destChainId: number;
  /** Human-readable amount, e.g. "100.50" */
  amount: string;
  /** The adapter instance from @circle-fin/adapter-viem-v2 or similar */
  adapter: unknown;
  /** Optional: separate adapter for destination chain */
  destAdapter?: unknown;
  /** Optional: custom recipient address on destination chain */
  recipientAddress?: string;
  /** Optional: use Circle's Forwarder to handle the mint tx */
  useForwarder?: boolean;
}

export interface CircleBridgeResult {
  success: boolean;
  state?: 'pending' | 'success' | 'error';
  amount?: string;
  sourceTxHash?: string;
  steps?: Array<{ name: string; explorerUrl?: string }>;
  error?: string;
}

export function shouldUseCircleBridge(): boolean {
  return isCircleFeatureEnabled('bridge');
}

export function isCCTPSupported(sourceChainId: number, destChainId: number): boolean {
  return sourceChainId in CHAIN_ID_TO_BRIDGE_CHAIN && destChainId in CHAIN_ID_TO_BRIDGE_CHAIN;
}

export function chainIdToBridgeChain(chainId: number): string | null {
  return CHAIN_ID_TO_BRIDGE_CHAIN[chainId] ?? null;
}

/**
 * Execute a cross-chain USDC bridge via Circle CCTP V2 Bridge Kit.
 *
 * The caller must provide a compatible adapter (e.g. created via
 * `createViemAdapterFromPrivateKey` or `createViemAdapterFromWalletClient`
 * from `@circle-fin/adapter-viem-v2`).
 */
export async function executeBridge(
  params: CircleBridgeParams
): Promise<CircleBridgeResult> {
  if (!shouldUseCircleBridge()) {
    return { success: false, error: 'Circle Bridge not enabled' };
  }

  const sourceChain = chainIdToBridgeChain(params.sourceChainId);
  const destChain = chainIdToBridgeChain(params.destChainId);

  if (!sourceChain || !destChain) {
    return {
      success: false,
      error: `CCTP not supported for chain ${params.sourceChainId} -> ${params.destChainId}`,
    };
  }

  try {
    const { BridgeKit } = await import('@circle-fin/bridge-kit');

    const kit = new BridgeKit();

    // Build destination context
    const to: Record<string, unknown> = {
      adapter: params.destAdapter ?? params.adapter,
      chain: destChain,
    };
    if (params.recipientAddress) {
      to.recipientAddress = params.recipientAddress;
    }
    if (params.useForwarder) {
      to.useForwarder = true;
    }

    const result = await kit.bridge({
      from: { adapter: params.adapter, chain: sourceChain } as any,
      to: to as any,
      amount: params.amount,
    });

    // Extract first approve/burn tx hash from steps
    const sourceTxHash = result.steps?.find(
      (s: any) => s.name === 'burn' || s.name === 'approve'
    )?.txHash;

    return {
      success: result.state === 'success',
      state: result.state,
      amount: result.amount,
      sourceTxHash,
      steps: result.steps?.map((s: any) => ({
        name: s.name,
        explorerUrl: s.explorerUrl,
      })),
    };
  } catch (error) {
    console.error('[Circle Bridge] Transfer failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bridge transfer failed',
    };
  }
}
