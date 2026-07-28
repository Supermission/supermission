/**
 * A2A x402 Extension - Payment Requirements
 * Creates payment requirements for agent-to-agent transactions
 */

import { Address, keccak256, encodePacked } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  PaymentRequirements,
  CreatePaymentRequirementsRequest,
  X402PaymentRequired,
} from './types';
import { USDC_ADDRESS, CHAIN_ID } from '../constants';


/**
 * Creates payment requirements for a resource/service
 */
export function createPaymentRequirements(
  request: CreatePaymentRequirementsRequest
): PaymentRequirements {
  const expiresAt = request.expiresInSeconds
    ? Math.floor(Date.now() / 1000) + request.expiresInSeconds
    : Math.floor(Date.now() / 1000) + 3600; // Default 1 hour

  return {
    x402Version: 1,
    scheme: 'exact',
    network: request.network || 'base',
    asset: request.asset || USDC_ADDRESS,
    payTo: request.payTo,
    maxAmountRequired: request.amount,
    description: request.description,
    resource: request.resource,
    expiresAt,
  };
}

/**
 * Creates the x402 payment-required message format
 */
export function createPaymentRequiredMessage(
  requirements: PaymentRequirements
): X402PaymentRequired {
  return {
    type: 'payment-required',
    'x402.payment.required': {
      accepts: [
        {
          scheme: requirements.scheme,
          network: requirements.network,
          asset: requirements.asset,
          payTo: requirements.payTo,
          maxAmountRequired: requirements.maxAmountRequired,
        },
      ],
    },
  };
}

/**
 * Generate a unique payment hash for anti-replay protection
 * Uses keccak256 for collision resistance
 */
export function generatePaymentHash(
  from: Address,
  to: Address,
  amount: string,
  nonce: string
): string {
  return keccak256(
    encodePacked(
      ['address', 'address', 'string', 'string'],
      [from, to, amount, nonce]
    )
  );
}

/**
 * Store payment requirements in database
 */
export async function storePaymentRequirements(
  requirements: PaymentRequirements,
  fromAgentId?: string
): Promise<string> {
  const paymentId = uuidv4();
  const paymentHash = generatePaymentHash(
    fromAgentId as Address || '0x0000000000000000000000000000000000000000',
    requirements.payTo,
    requirements.maxAmountRequired,
    paymentId
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any).from('x402_payments').insert({
    id: paymentId,
    payment_hash: paymentHash,
    from_agent_id: fromAgentId || null,
    to_address: requirements.payTo,
    amount: requirements.maxAmountRequired,
    token: requirements.asset,
    status: 'pending',
    requirements: requirements,
  });

  if (error) {
    console.error('Failed to store payment requirements:', error);
    throw new Error('Failed to store payment requirements');
  }

  return paymentId;
}

/**
 * Get payment requirements by ID
 */
export async function getPaymentRequirements(
  paymentId: string
): Promise<PaymentRequirements | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any)
    .from('x402_payments')
    .select('requirements')
    .eq('id', paymentId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.requirements as unknown as PaymentRequirements;
}

/**
 * Check if payment is expired
 */
export function isPaymentExpired(requirements: PaymentRequirements): boolean {
  if (!requirements.expiresAt) {
    return false;
  }
  return Math.floor(Date.now() / 1000) > requirements.expiresAt;
}

/**
 * Validate payment requirements structure
 */
export function validatePaymentRequirements(
  requirements: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!requirements || typeof requirements !== 'object') {
    return { valid: false, errors: ['Requirements must be an object'] };
  }

  const req = requirements as Record<string, unknown>;

  if (req.x402Version !== 1) {
    errors.push('Invalid x402Version, expected 1');
  }

  if (req.scheme !== 'exact') {
    errors.push('Invalid scheme, expected "exact"');
  }

  if (req.network !== 'base') {
    errors.push('Invalid network, expected "base"');
  }

  if (!req.asset || typeof req.asset !== 'string') {
    errors.push('Missing or invalid asset address');
  }

  if (!req.payTo || typeof req.payTo !== 'string') {
    errors.push('Missing or invalid payTo address');
  }

  if (!req.maxAmountRequired || typeof req.maxAmountRequired !== 'string') {
    errors.push('Missing or invalid maxAmountRequired');
  } else {
    // Require positive integer atomic units (no decimals or scientific notation)
    if (!/^\d+$/.test(req.maxAmountRequired)) {
      errors.push('maxAmountRequired must be an integer string in atomic units');
    } else {
      try {
        if (BigInt(req.maxAmountRequired) <= 0n) {
          errors.push('maxAmountRequired must be greater than 0');
        }
      } catch {
        errors.push('maxAmountRequired must be a valid integer');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
