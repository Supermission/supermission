/**
 * Circle Compliance Engine — screen blockchain addresses for risk.
 * Called before trade execution when CIRCLE_COMPLIANCE_ENABLED=true.
 */

import { circleRequest } from './client';
import { isCircleFeatureEnabled } from './config';
import { supabaseAdmin } from '@/lib/supabase/client';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';

export interface ScreeningResult {
  address: string;
  chain: string;
  riskLevel: RiskLevel;
  riskScore: number;
  flags: string[];
  isBlocked: boolean;
  screenedAt: string;
}

export async function screenAddress(
  address: string,
  chain: string = 'BASE'
): Promise<ScreeningResult | null> {
  if (!isCircleFeatureEnabled('compliance')) return null;

  try {
    const response = await circleRequest<{ data: any }>('/v1/w3s/compliance/screening/addresses', {
      method: 'POST',
      body: { address, chain },
    });

    const data = response.data;

    const result: ScreeningResult = {
      address,
      chain,
      riskLevel: data.riskLevel || 'LOW',
      riskScore: data.riskScore || 0,
      flags: data.flags || [],
      isBlocked: data.riskLevel === 'SEVERE',
      screenedAt: new Date().toISOString(),
    };

    // Record screening result (fire-and-forget)
    Promise.resolve(supabaseAdmin.from('compliance_screenings').insert({
      address: address.toLowerCase(),
      chain,
      risk_level: result.riskLevel,
      risk_score: result.riskScore,
      flags: result.flags,
      is_blocked: result.isBlocked,
      result: result.isBlocked ? 'fail' : 'pass',
    })).catch(() => {});

    return result;
  } catch (error) {
    console.error('[Circle Compliance] Screening failed:', error);

    // Record screening error (fire-and-forget)
    Promise.resolve(supabaseAdmin.from('compliance_screenings').insert({
      address: address.toLowerCase(),
      chain,
      result: 'error',
      error_message: error instanceof Error ? error.message : String(error),
    })).catch(() => {});

    return null;
  }
}

export async function isAddressSafe(
  address: string,
  chain: string = 'BASE'
): Promise<{ safe: boolean; reason?: string }> {
  const result = await screenAddress(address, chain);

  if (!result) {
    return { safe: true };
  }

  if (result.isBlocked) {
    return {
      safe: false,
      reason: `Address flagged as ${result.riskLevel} risk: ${result.flags.join(', ')}`,
    };
  }

  if (result.riskLevel === 'HIGH') {
    return {
      safe: false,
      reason: `Address has HIGH risk score (${result.riskScore}/100): ${result.flags.join(', ')}`,
    };
  }

  return { safe: true };
}

export function chainIdToCircleChain(chainId: number): string {
  switch (chainId) {
    case 1: return 'ETH';
    case 8453: return 'BASE';
    case 137: return 'MATIC';
    case 42161: return 'ARB';
    case 10: return 'OP';
    default: return 'ETH';
  }
}
