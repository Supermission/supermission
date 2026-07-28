/**
 * AP2 Mandates - Payment Mandate
 * Sent to payment networks for accountability
 */

import { Address } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/client';

// Use raw client to bypass strict typing for new tables
import {
  PaymentMandate,
  CreatePaymentMandateRequest,
  MandateStatus,
} from './types';
import { verifyIntentMandate, useIntentMandate } from './intent-mandate';
import { verifyCartMandate, useCartMandate } from './cart-mandate';

/**
 * Create a payment mandate with linked authorization mandates
 */
export async function createPaymentMandate(
  request: CreatePaymentMandateRequest
): Promise<{ success: boolean; mandate?: PaymentMandate; error?: string }> {
  try {
    const id = uuidv4();
    const totalAmount = BigInt(request.totalAmount);

    // Verify linked mandates if provided
    if (request.intentMandateId) {
      const verification = await verifyIntentMandate(
        request.intentMandateId,
        totalAmount,
        request.merchantAddress
      );
      if (!verification.valid) {
        return {
          success: false,
          error: `Intent mandate verification failed: ${verification.errors.join(', ')}`,
        };
      }
    }

    if (request.cartMandateId) {
      const verification = await verifyCartMandate(
        request.cartMandateId,
        totalAmount
      );
      if (!verification.valid) {
        return {
          success: false,
          error: `Cart mandate verification failed: ${verification.errors.join(', ')}`,
        };
      }
    }

    // Create the payment mandate
    const mandate: PaymentMandate = {
      id,
      type: 'payment',
      aiAgentPresent: request.aiAgentPresent ?? true,
      transactionModality: request.transactionModality,
      paymentDetailsId: request.paymentDetailsId,
      totalAmount,
      currency: request.currency || 'USDC',
      merchantAgentId: request.merchantAgentId,
      merchantAddress: request.merchantAddress,
      userAddress: request.userAddress,
      userAuthorization: '', // Verifiable presentation - to be set
      linkedMandates: {
        intentMandateId: request.intentMandateId,
        cartMandateId: request.cartMandateId,
      },
      timestamp: new Date(),
      createdAt: new Date(),
      status: 'active',
    };

    // Save to database
    const { error } = await supabaseAdmin.from('ap2_mandates').insert({
      id: mandate.id,
      type: 'payment',
      mandate_data: {
        aiAgentPresent: mandate.aiAgentPresent,
        transactionModality: mandate.transactionModality,
        paymentDetailsId: mandate.paymentDetailsId,
        totalAmount: mandate.totalAmount.toString(),
        currency: mandate.currency,
        merchantAgentId: mandate.merchantAgentId,
        merchantAddress: mandate.merchantAddress,
        userAddress: mandate.userAddress,
        linkedMandates: mandate.linkedMandates,
        timestamp: mandate.timestamp.toISOString(),
      },
      signatures: {},
      status: 'active',
    });

    if (error) {
      console.error('Failed to save payment mandate:', error);
      return { success: false, error: 'Failed to save payment mandate' };
    }

    // Mark linked mandates as used
    if (request.intentMandateId) {
      await useIntentMandate(request.intentMandateId, id);
    }
    if (request.cartMandateId) {
      await useCartMandate(request.cartMandateId, id);
    }

    return { success: true, mandate };
  } catch (error) {
    console.error('Error creating payment mandate:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get a payment mandate by ID
 */
export async function getPaymentMandate(
  mandateId: string
): Promise<PaymentMandate | null> {
  const { data, error } = await supabaseAdmin
    .from('ap2_mandates')
    .select('*')
    .eq('id', mandateId)
    .eq('type', 'payment')
    .single();

  if (error || !data) {
    return null;
  }

  const mandateData = data.mandate_data as Record<string, unknown>;
  const linkedMandates = mandateData.linkedMandates as Record<string, string> || {};

  return {
    id: data.id,
    type: 'payment',
    aiAgentPresent: mandateData.aiAgentPresent as boolean,
    transactionModality: mandateData.transactionModality as 'human-present' | 'human-not-present',
    paymentDetailsId: mandateData.paymentDetailsId as string,
    totalAmount: BigInt(mandateData.totalAmount as string),
    currency: mandateData.currency as string,
    merchantAgentId: mandateData.merchantAgentId as string,
    merchantAddress: mandateData.merchantAddress as Address,
    userAddress: mandateData.userAddress as Address,
    userAuthorization: mandateData.userAuthorization as string || '',
    linkedMandates: {
      intentMandateId: linkedMandates.intentMandateId,
      cartMandateId: linkedMandates.cartMandateId,
    },
    timestamp: new Date(mandateData.timestamp as string),
    createdAt: new Date(data.created_at),
    status: data.status as MandateStatus,
    settlementTxHash: mandateData.settlementTxHash as string | undefined,
  };
}

/**
 * Update payment mandate with settlement transaction
 */
export async function settlePaymentMandate(
  mandateId: string,
  txHash: string
): Promise<{ success: boolean; error?: string }> {
  // First get current mandate_data
  const { data: current } = await supabaseAdmin
    .from('ap2_mandates')
    .select('mandate_data')
    .eq('id', mandateId)
    .single();

  const currentData = (current?.mandate_data as Record<string, unknown>) || {};
  const updatedData = { ...currentData, settlementTxHash: txHash };

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
    console.error('Failed to settle payment mandate:', error);
    return { success: false, error: 'Failed to update mandate' };
  }

  return { success: true };
}

/**
 * Get accountability chain for a payment mandate
 */
export async function getAccountabilityChain(
  paymentMandateId: string
): Promise<{
  paymentMandate: PaymentMandate | null;
  intentMandate?: unknown;
  cartMandate?: unknown;
}> {
  const paymentMandate = await getPaymentMandate(paymentMandateId);

  if (!paymentMandate) {
    return { paymentMandate: null };
  }

  const result: {
    paymentMandate: PaymentMandate;
    intentMandate?: unknown;
    cartMandate?: unknown;
  } = { paymentMandate };

  // Fetch linked mandates
  if (paymentMandate.linkedMandates.intentMandateId) {
    const { getIntentMandate } = await import('./intent-mandate');
    result.intentMandate = await getIntentMandate(
      paymentMandate.linkedMandates.intentMandateId
    );
  }

  if (paymentMandate.linkedMandates.cartMandateId) {
    const { getCartMandate } = await import('./cart-mandate');
    result.cartMandate = await getCartMandate(
      paymentMandate.linkedMandates.cartMandateId
    );
  }

  return result;
}

/**
 * Get payment mandates for a user
 */
export async function getUserPaymentMandates(
  userAddress: Address,
  limit: number = 50
): Promise<PaymentMandate[]> {
  const { data, error } = await supabaseAdmin
    .from('ap2_mandates')
    .select('*')
    .eq('type', 'payment')
    .contains('mandate_data', { userAddress })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map((record) => {
    const mandateData = record.mandate_data as Record<string, unknown>;
    const linkedMandates = mandateData.linkedMandates as Record<string, string> || {};

    return {
      id: record.id,
      type: 'payment' as const,
      aiAgentPresent: mandateData.aiAgentPresent as boolean,
      transactionModality: mandateData.transactionModality as 'human-present' | 'human-not-present',
      paymentDetailsId: mandateData.paymentDetailsId as string,
      totalAmount: BigInt(mandateData.totalAmount as string),
      currency: mandateData.currency as string,
      merchantAgentId: mandateData.merchantAgentId as string,
      merchantAddress: mandateData.merchantAddress as Address,
      userAddress: mandateData.userAddress as Address,
      userAuthorization: mandateData.userAuthorization as string || '',
      linkedMandates: {
        intentMandateId: linkedMandates.intentMandateId,
        cartMandateId: linkedMandates.cartMandateId,
      },
      timestamp: new Date(mandateData.timestamp as string),
      createdAt: new Date(record.created_at),
      status: record.status as MandateStatus,
      settlementTxHash: mandateData.settlementTxHash as string | undefined,
    };
  });
}
