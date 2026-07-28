/**
 * A2A x402 Extension - Payment Settlement (DEPRECATED)
 *
 * Agents now settle payments on-chain themselves using their agentic wallets.
 * This module is kept for backward compatibility but settlement functions
 * return errors directing agents to settle on-chain directly.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import {
  PaymentReceipt,
  SettlePaymentRequest,
  SettlePaymentResponse,
  X402PaymentCompleted,
} from './types';


/**
 * @deprecated Agents settle payments on-chain with their own wallets.
 */
export async function settlePayment(
  _request: SettlePaymentRequest
): Promise<SettlePaymentResponse> {
  return {
    success: false,
    error: 'Platform no longer settles payments. Agents must submit transactions on-chain with their own agentic wallet.',
  };
}

/**
 * Creates the x402 payment-completed message format
 */
export function createPaymentCompletedMessage(
  receipts: PaymentReceipt[]
): X402PaymentCompleted {
  return {
    type: 'payment-completed',
    'x402.payment.receipts': receipts,
  };
}

/**
 * Get payment status
 */
export async function getPaymentStatus(
  paymentId: string
): Promise<{
  status: string;
  receipt?: PaymentReceipt;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('x402_payments')
    .select('status, receipt, tx_hash')
    .eq('id', paymentId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    status: data.status,
    receipt: data.receipt as unknown as PaymentReceipt | undefined,
  };
}
