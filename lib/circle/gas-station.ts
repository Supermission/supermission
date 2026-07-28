/**
 * Circle Gas Station — pay gas fees in USDC instead of ETH.
 * Alternative to Privy gas sponsorship for agent server wallets.
 */

import { circleRequest } from './client';
import { isCircleFeatureEnabled, CIRCLE_CONFIG } from './config';

export interface SponsoredTxRequest {
  to: string;
  data: string;
  value?: string;
  chainId: number;
  from: string;
}

export interface SponsoredTxResult {
  success: boolean;
  txHash?: string;
  gasPaidInUSDC?: string;
  error?: string;
}

export function shouldUseGasStation(): boolean {
  return isCircleFeatureEnabled('gasStation') && !!CIRCLE_CONFIG.gasStation.policyId;
}

export async function estimateGasInUSDC(
  tx: SponsoredTxRequest
): Promise<{ gasCostUSDC: string; gasCostWei: string } | null> {
  if (!shouldUseGasStation()) return null;

  try {
    const result = await circleRequest<{ data: any }>(
      '/v1/w3s/developer/transactions/transfer/estimateFee',
      {
        method: 'POST',
        body: {
          blockchain: chainIdToBlockchain(tx.chainId),
          walletAddress: tx.from,
          destinationAddress: tx.to,
          tokenId: 'usdc',
          amounts: ['0.01'],
        },
      }
    );

    return {
      gasCostUSDC: result.data?.estimatedFee?.gasLimit || '0',
      gasCostWei: result.data?.estimatedFee?.baseFee || '0',
    };
  } catch (error) {
    console.error('[Circle Gas Station] Estimate failed:', error);
    return null;
  }
}

function chainIdToBlockchain(chainId: number): string {
  switch (chainId) {
    case 1: return 'ETH';
    case 8453: return 'BASE';
    case 137: return 'MATIC';
    case 42161: return 'ARB';
    default: return 'BASE';
  }
}
