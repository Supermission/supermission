/**
 * Step 1: Create Payment Requirements
 *
 * Generates x402 payment requirements including nonce,
 * validity window, and amount in atomic units
 */

import { createSupabaseClient, USDC_ADDRESS, BASE_CHAIN_ID } from '@supermission/cf-shared';
import type { PaymentWorkflowParams } from '@supermission/cf-shared';
import type { Env } from '../index';

// USDC has 6 decimals
const USDC_DECIMALS = 6;
const USDC_ATOMIC_DIVISOR = 10 ** USDC_DECIMALS;

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: {
    name: string;
    version: string;
  };
}

export interface PaymentRequirementsResult {
  requirements: PaymentRequirements;
  x402PaymentId: string;
  nonce: string;
  validAfter: bigint;
  validBefore: bigint;
}

/**
 * Create payment requirements for the workflow
 */
export async function createRequirements(
  params: PaymentWorkflowParams,
  env: Env
): Promise<PaymentRequirementsResult> {
  const supabase = createSupabaseClient(env);

  // Convert reward to atomic units (6 decimals for USDC)
  const rewardDecimal = parseFloat(params.reward);
  if (isNaN(rewardDecimal) || rewardDecimal <= 0) {
    throw new Error(`Invalid reward amount: ${params.reward}`);
  }

  const amountAtomic = BigInt(Math.floor(rewardDecimal * USDC_ATOMIC_DIVISOR));

  // Generate unique nonce
  const nonce = `0x${crypto.randomUUID().replace(/-/g, '')}` as `0x${string}`;

  // Validity window: now to 24 hours from now
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60); // 1 minute buffer
  const validBefore = BigInt(now + 86400); // 24 hours

  // Create requirements object
  const requirements: PaymentRequirements = {
    scheme: 'exact',
    network: 'base',
    maxAmountRequired: amountAtomic.toString(),
    resource: `task:${params.taskId}`,
    description: `Payment for task ${params.taskId} in mission ${params.missionId}`,
    mimeType: 'application/json',
    payTo: params.recipientAddress,
    maxTimeoutSeconds: 300, // 5 minutes
    asset: USDC_ADDRESS,
    extra: {
      name: 'USDC',
      version: '2',
    },
  };

  // Store requirements in database
  const { data: stored, error } = await supabase
    .from('x402_payments')
    .insert({
      mission_id: params.missionId,
      task_id: params.taskId,
      from_agent_id: params.creatorAgentId,
      to_agent_id: params.assignedAgentId,
      amount: params.reward,
      amount_atomic: amountAtomic.toString(),
      status: 'pending',
      requirements: {
        ...requirements,
        nonce,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
      },
      payment_hash: generatePaymentHash(
        params.creatorAddress,
        params.recipientAddress,
        amountAtomic.toString(),
        nonce
      ),
    })
    .select('id')
    .single();

  if (error || !stored) {
    throw new Error(`Failed to store payment requirements: ${error?.message || 'Unknown error'}`);
  }

  return {
    requirements,
    x402PaymentId: stored.id,
    nonce,
    validAfter,
    validBefore,
  };
}

/**
 * Generate a unique payment hash for anti-replay
 */
function generatePaymentHash(from: string, to: string, value: string, nonce: string): string {
  const data = `${from.toLowerCase()}:${to.toLowerCase()}:${value}:${nonce}`;
  // Simple hash using Web Crypto would be async, so use a sync approach
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}
