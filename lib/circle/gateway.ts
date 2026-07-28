/**
 * Circle Gateway — Unified USDC Balance across chains.
 * Deposit on any chain, spend on any chain instantly.
 *
 * Only active when CIRCLE_GATEWAY_ENABLED=true.
 */

import { circleRequest } from './client';
import { isCircleFeatureEnabled } from './config';

export interface UnifiedBalance {
  totalUSDC: string;
  byChain: Record<string, string>;
  lastUpdated: string;
}

export interface DepositAddress {
  address: string;
  chain: string;
  expiresAt: string;
}

export function isGatewayEnabled(): boolean {
  return isCircleFeatureEnabled('gateway');
}

export async function getUnifiedBalance(
  walletAddress: string
): Promise<UnifiedBalance | null> {
  if (!isGatewayEnabled()) return null;

  try {
    const result = await circleRequest<{ data: any }>(
      `/v1/gateway/balances?address=${walletAddress}`,
    );

    const balances = result.data?.balances || [];
    const byChain: Record<string, string> = {};
    let total = 0;

    for (const bal of balances) {
      byChain[bal.chain] = bal.amount;
      total += parseFloat(bal.amount);
    }

    return {
      totalUSDC: total.toFixed(6),
      byChain,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Circle Gateway] Balance fetch failed:', error);
    return null;
  }
}

export async function getDepositAddress(
  walletAddress: string,
  chain: string = 'BASE'
): Promise<DepositAddress | null> {
  if (!isGatewayEnabled()) return null;

  try {
    const result = await circleRequest<{ data: any }>(
      '/v1/gateway/deposits',
      {
        method: 'POST',
        body: {
          destinationAddress: walletAddress,
          chain,
          currency: 'USDC',
        },
      }
    );

    return {
      address: result.data?.address || walletAddress,
      chain,
      expiresAt: result.data?.expiresAt || '',
    };
  } catch (error) {
    console.error('[Circle Gateway] Deposit address failed:', error);
    return null;
  }
}
