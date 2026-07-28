/**
 * AP2 Mandates - Intent Mandate
 * For human-not-present scenarios where user pre-authorizes actions
 */

import { Address, keccak256, stringToBytes } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/client';

// Use raw client to bypass strict typing for new tables
import {
  IntentMandate,
  CreateIntentMandateRequest,
  IntentMandateTypedData,
  MandateStatus,
} from './types';
import { CHAIN_ID, EIP712_DOMAIN } from '../constants';
import { generateNonce } from '../wallet/crypto';

/**
 * Create a new intent mandate
 */
export async function createIntentMandate(
  request: CreateIntentMandateRequest
): Promise<{ mandate: IntentMandate; typedData: IntentMandateTypedData }> {
  const id = uuidv4();
  const nonce = generateNonce();
  const expiresInSeconds = request.expiresInSeconds || 3600; // Default 1 hour
  const intentExpiry = new Date(Date.now() + expiresInSeconds * 1000);

  const mandate: IntentMandate = {
    id,
    type: 'intent',
    userAddress: request.userAddress,
    userSignature: '', // Will be set after signing
    naturalLanguageDescription: request.naturalLanguageDescription,
    merchants: request.merchants || null,
    skus: request.skus || null,
    maxAmount: BigInt(request.maxAmount),
    currency: request.currency || 'USDC',
    userCartConfirmationRequired: request.userCartConfirmationRequired ?? false,
    requiresRefundability: request.requiresRefundability ?? false,
    intentExpiry,
    status: 'active',
    createdAt: new Date(),
  };

  // Create EIP-712 typed data for signing
  const typedData: IntentMandateTypedData = {
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: CHAIN_ID,
      verifyingContract: '0x0000000000000000000000000000000000000000' as Address, // Platform contract
    },
    types: {
      IntentMandate: [
        { name: 'description', type: 'string' },
        { name: 'maxAmount', type: 'uint256' },
        { name: 'currency', type: 'string' },
        { name: 'merchants', type: 'address[]' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'IntentMandate',
    message: {
      description: mandate.naturalLanguageDescription,
      maxAmount: mandate.maxAmount,
      currency: mandate.currency,
      merchants: mandate.merchants || [],
      expiry: BigInt(Math.floor(intentExpiry.getTime() / 1000)) as unknown as number,
      nonce,
    },
  };

  return { mandate, typedData };
}

/**
 * Save an intent mandate with signature
 */
export async function saveIntentMandate(
  mandate: IntentMandate,
  userSignature: string
): Promise<{ success: boolean; mandateId?: string; error?: string }> {
  try {
    const { error } = await supabaseAdmin.from('ap2_mandates').insert({
      id: mandate.id,
      type: 'intent',
      mandate_data: {
        userAddress: mandate.userAddress,
        naturalLanguageDescription: mandate.naturalLanguageDescription,
        merchants: mandate.merchants,
        skus: mandate.skus,
        maxAmount: mandate.maxAmount.toString(),
        currency: mandate.currency,
        userCartConfirmationRequired: mandate.userCartConfirmationRequired,
        requiresRefundability: mandate.requiresRefundability,
        intentExpiry: mandate.intentExpiry.toISOString(),
      },
      signatures: {
        user: userSignature,
      },
      status: 'active',
      expires_at: mandate.intentExpiry.toISOString(),
    });

    if (error) {
      console.error('Failed to save intent mandate:', error);
      return { success: false, error: 'Failed to save mandate' };
    }

    return { success: true, mandateId: mandate.id };
  } catch (error) {
    console.error('Error saving intent mandate:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get an intent mandate by ID
 */
export async function getIntentMandate(
  mandateId: string
): Promise<IntentMandate | null> {
  const { data, error } = await supabaseAdmin
    .from('ap2_mandates')
    .select('*')
    .eq('id', mandateId)
    .eq('type', 'intent')
    .single();

  if (error || !data) {
    return null;
  }

  const mandateData = data.mandate_data as Record<string, unknown>;
  const signatures = data.signatures as Record<string, string>;

  return {
    id: data.id,
    type: 'intent',
    userAddress: mandateData.userAddress as Address,
    userSignature: signatures.user || '',
    naturalLanguageDescription: mandateData.naturalLanguageDescription as string,
    merchants: mandateData.merchants as Address[] | null,
    skus: mandateData.skus as string[] | null,
    maxAmount: BigInt(mandateData.maxAmount as string),
    currency: mandateData.currency as string,
    userCartConfirmationRequired: mandateData.userCartConfirmationRequired as boolean,
    requiresRefundability: mandateData.requiresRefundability as boolean,
    intentExpiry: new Date(mandateData.intentExpiry as string),
    status: data.status as MandateStatus,
    createdAt: new Date(data.created_at),
    usedAt: data.updated_at !== data.created_at
      ? new Date(data.updated_at)
      : undefined,
    linkedPaymentMandateId: mandateData.linkedPaymentMandateId as string | undefined,
  };
}

/**
 * Verify an intent mandate can be used for a transaction
 */
export async function verifyIntentMandate(
  mandateId: string,
  transactionAmount: bigint,
  merchantAddress?: Address
): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const mandate = await getIntentMandate(mandateId);

  if (!mandate) {
    return { valid: false, errors: ['Mandate not found'] };
  }

  // Check status
  if (mandate.status !== 'active') {
    errors.push(`Mandate is ${mandate.status}`);
  }

  // Check expiry
  if (new Date() > mandate.intentExpiry) {
    errors.push('Mandate has expired');
  }

  // Check amount
  if (transactionAmount > mandate.maxAmount) {
    errors.push(
      `Transaction amount ${transactionAmount} exceeds mandate limit ${mandate.maxAmount}`
    );
  }

  // Check merchant authorization
  if (mandate.merchants && mandate.merchants.length > 0 && merchantAddress) {
    const isAuthorized = mandate.merchants.some(
      (m) => m.toLowerCase() === merchantAddress.toLowerCase()
    );
    if (!isAuthorized) {
      errors.push('Merchant not authorized by mandate');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Use an intent mandate (mark as used)
 */
export async function useIntentMandate(
  mandateId: string,
  paymentMandateId: string
): Promise<{ success: boolean; error?: string }> {
  // First get current mandate_data
  const { data: current } = await supabaseAdmin
    .from('ap2_mandates')
    .select('mandate_data')
    .eq('id', mandateId)
    .single();

  const currentData = (current?.mandate_data as Record<string, unknown>) || {};
  const updatedData = { ...currentData, linkedPaymentMandateId: paymentMandateId };

  const { error } = await supabaseAdmin
    .from('ap2_mandates')
    .update({
      status: 'used',
      mandate_data: updatedData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mandateId)
    .eq('status', 'active');

  if (error) {
    console.error('Failed to use intent mandate:', error);
    return { success: false, error: 'Failed to update mandate' };
  }

  return { success: true };
}

/**
 * Revoke an intent mandate
 */
export async function revokeIntentMandate(
  mandateId: string,
  userAddress: Address
): Promise<{ success: boolean; error?: string }> {
  // Verify ownership first
  const mandate = await getIntentMandate(mandateId);
  if (!mandate) {
    return { success: false, error: 'Mandate not found' };
  }

  if (mandate.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    return { success: false, error: 'Not authorized to revoke this mandate' };
  }

  if (mandate.status !== 'active') {
    return { success: false, error: `Cannot revoke mandate with status ${mandate.status}` };
  }

  const { error } = await supabaseAdmin
    .from('ap2_mandates')
    .update({
      status: 'revoked',
      updated_at: new Date().toISOString(),
    })
    .eq('id', mandateId);

  if (error) {
    console.error('Failed to revoke mandate:', error);
    return { success: false, error: 'Failed to revoke mandate' };
  }

  return { success: true };
}
