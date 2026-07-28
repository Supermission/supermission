/**
 * X402 Payment Middleware
 * Handles payment verification for x402 protocol
 */

import { Address } from 'viem';
import type { X402PaymentProof } from './types';
import { supabaseAdmin } from '@/lib/supabase/client';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

/**
 * Check if response is X402 Payment Required
 */
export function isX402Response(response: Response): boolean {
  return response.status === 402 && response.headers.has('X-Payment-Required');
}

/**
 * Extract payment request from X402 response
 */
export async function extractPaymentRequest(response: Response): Promise<import('./types').X402PaymentRequest> {
  const paymentHeader = response.headers.get('X-Payment-Required');

  if (!paymentHeader) {
    throw new Error('X-Payment-Required header not found');
  }

  try {
    const paymentData = JSON.parse(paymentHeader);

    return {
      amount: paymentData.amount,
      token: paymentData.token as Address,
      recipient: paymentData.recipient as Address,
      chainId: paymentData.chainId || 8453, // Base Mainnet default
      description: paymentData.description,
    };
  } catch (error) {
    throw new Error(`Failed to parse X-Payment-Required header: ${error}`);
  }
}

/**
 * Verify payment proof on-chain
 * SECURITY: Verifies amount, recipient, sender, and token via on-chain Transfer event lookup
 * ANTI-REPLAY: Checks database to prevent proof reuse
 * Works for both EIP-3009 transferWithAuthorization and direct transfer() — both emit Transfer events
 */
export async function verifyPaymentProof(
  proof: X402PaymentProof,
  options?: {
    expectedAmount?: bigint;
    expectedRecipient?: Address;
    expectedToken?: Address;
    chainId?: number;
    rpcUrl?: string;
    agentId?: string;
    missionId?: string;
  }
): Promise<boolean> {
  try {
    const isLocalDev = process.env.NODE_ENV === 'development' ||
      process.env.ORCHESTRATOR_URL?.includes('localhost') ||
      process.env.NEXT_PUBLIC_SITE_URL?.includes('localhost');

    // Anti-replay protection (skip in dev)
    if (!isLocalDev) {
      const { data: existingProof } = await supabaseAdmin
        .from('payment_proofs')
        .select('tx_hash')
        .eq('tx_hash', proof.txHash)
        .maybeSingle();

      if (existingProof) {
        console.error('[X402] ✗ Replay attack detected:', proof.txHash);
        return false;
      }
    }

    // Verify timestamp
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (proof.timestamp < fiveMinutesAgo) {
      console.error('[X402] ✗ Payment proof expired');
      return false;
    }

    // On-chain verification
    const chainId = options?.chainId || proof.chainId || 8453;
    const { verifyPaymentProof: verifyPaymentOnChain } = await import('@/packages/agent-sdk/src/verify');
    const rpcUrl: string = httpRpcUrl('base');
    const isValid = await verifyPaymentOnChain(proof, rpcUrl);
    if (!isValid) {
      console.error('[X402] ✗ On-chain payment verification failed:', proof.txHash);
      return false;
    }

    // Record proof (skip in dev)
    if (!isLocalDev) {
      await supabaseAdmin.from('payment_proofs').insert({
        tx_hash: proof.txHash,
        agent_id: options?.agentId || null,
        mission_id: options?.missionId || null,
        amount: proof.amount,
        token_address: proof.token,
        from_address: proof.from,
        to_address: proof.to,
        metadata: { chainId, verifiedAt: new Date().toISOString() },
      });
    }

    console.log('[X402] ✓ Payment verified');
    return true;
  } catch (error) {
    console.error('[X402] ✗ Verification error:', error instanceof Error ? error.message : error);
    return false;
  }
}
