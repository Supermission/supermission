/**
 * Circle Nanopayments — gasless micro-payments via batched settlement.
 *
 * Uses @circle-fin/x402-batching SDK:
 * - Client side: BatchEvmScheme signs EIP-3009 transferWithAuthorization
 * - Server side: BatchFacilitatorClient verifies and settles payments
 *
 * This module is ONLY active when CIRCLE_NANOPAYMENTS_ENABLED=true.
 * Otherwise, the existing Privy-based on-chain transfer flow is used.
 */

import { isCircleFeatureEnabled } from './config';

export interface NanopaymentVerifyResult {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface NanopaymentSettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  error?: string;
}

/**
 * Check if nanopayments are available and should be used.
 */
export function shouldUseNanopayments(): boolean {
  return isCircleFeatureEnabled('nanopayments');
}

/**
 * Check if a payment requirements object supports Circle batched settlement.
 */
export async function checkBatchingSupport(
  requirements: { extra?: Record<string, unknown> }
): Promise<boolean> {
  if (!shouldUseNanopayments()) return false;
  const { supportsBatching } = await import('@circle-fin/x402-batching');
  return supportsBatching(requirements);
}

/**
 * Verify a batched payment on the server side.
 */
export async function verifyBatchPayment(
  paymentPayload: Record<string, unknown>,
  paymentRequirements: Record<string, unknown>,
): Promise<NanopaymentVerifyResult> {
  if (!shouldUseNanopayments()) {
    return { isValid: false, invalidReason: 'Circle Nanopayments not enabled' };
  }

  try {
    const { BatchFacilitatorClient } = await import('@circle-fin/x402-batching/server');
    const facilitator = new BatchFacilitatorClient();
    const result = await facilitator.verify(paymentPayload as any, paymentRequirements as any);
    return {
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      payer: result.payer,
    };
  } catch (error) {
    console.error('[Circle Nanopayments] Verify failed:', error);
    return {
      isValid: false,
      invalidReason: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Settle a verified batched payment on the server side.
 */
export async function settleBatchPayment(
  paymentPayload: Record<string, unknown>,
  paymentRequirements: Record<string, unknown>,
): Promise<NanopaymentSettleResult> {
  if (!shouldUseNanopayments()) {
    return { success: false, error: 'Circle Nanopayments not enabled' };
  }

  try {
    const { BatchFacilitatorClient } = await import('@circle-fin/x402-batching/server');
    const facilitator = new BatchFacilitatorClient();
    const result = await facilitator.settle(paymentPayload as any, paymentRequirements as any);
    return {
      success: result.success,
      transaction: result.transaction,
      network: result.network,
      payer: result.payer,
      error: result.errorReason,
    };
  } catch (error) {
    console.error('[Circle Nanopayments] Settle failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Settlement failed',
    };
  }
}
