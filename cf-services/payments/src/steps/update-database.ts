/**
 * Step 4: Finalize Database Records
 *
 * Updates all database records after successful on-chain settlement
 */

import { createSupabaseClient } from '@supermission/cf-shared';
import type { PaymentWorkflowParams } from '@supermission/cf-shared';
import type { Env } from '../index';
import type { SettleResult } from './settle-on-chain';

// USDC has 6 decimals
const USDC_DECIMALS = 6;
const USDC_ATOMIC_DIVISOR = 10 ** USDC_DECIMALS;

/**
 * Update all database records after successful settlement
 */
export async function finalizeDatabase(
  params: PaymentWorkflowParams,
  settleResult: SettleResult,
  env: Env
): Promise<void> {
  const supabase = createSupabaseClient(env);

  // 1. Update mission_payments record
  const { error: paymentError } = await supabase
    .from('mission_payments')
    .update({
      status: 'completed',
      tx_hash: settleResult.txHash,
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.paymentRecordId);

  if (paymentError) {
    console.error('[DB] Failed to update mission_payments:', paymentError);
    throw new Error(`Failed to update mission_payments: ${paymentError.message}`);
  }

  // 2. Update x402_payments record (find by task_id)
  const { error: x402Error } = await supabase
    .from('x402_payments')
    .update({
      status: 'completed',
      tx_hash: settleResult.txHash,
      receipt: {
        txHash: settleResult.txHash,
        blockNumber: settleResult.blockNumber,
        gasUsed: settleResult.gasUsed,
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('task_id', params.taskId);

  if (x402Error) {
    console.error('[DB] Failed to update x402_payments:', x402Error);
    // Non-fatal - continue with other updates
  }

  // 3. Log to payment_transactions for UI display
  const amountDecimal = parseFloat(params.reward);

  const { error: txLogError } = await supabase
    .from('payment_transactions')
    .insert({
      from_address: params.creatorAddress,
      to_address: params.recipientAddress,
      amount: amountDecimal,
      token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      tx_hash: settleResult.txHash,
      purpose: 'agent_to_agent',
      metadata: {
        mission_id: params.missionId,
        task_id: params.taskId,
        from_agent_id: params.creatorAgentId,
        to_agent_id: params.assignedAgentId,
        settlement_type: 'x402_workflow',
        block_number: settleResult.blockNumber.toString(),
        gas_used: settleResult.gasUsed.toString(),
        settled_at: new Date().toISOString(),
      },
    });

  if (txLogError) {
    console.error('[DB] Failed to log to payment_transactions:', txLogError);
    // Non-fatal - don't fail the workflow
  }

  // 4. Update spending tx hash for tracking
  const { error: spendingError } = await supabase
    .from('wallet_spending')
    .insert({
      wallet_id: params.creatorWalletId,
      amount: params.reward,
      recipient: params.recipientAddress,
      tx_hash: settleResult.txHash,
      purpose: `task_payment:${params.taskId}`,
      created_at: new Date().toISOString(),
    });

  if (spendingError) {
    console.error('[DB] Failed to log wallet_spending:', spendingError);
    // Non-fatal - don't fail the workflow
  }

  console.log(`[DB] Successfully finalized payment ${params.paymentRecordId} with tx ${settleResult.txHash}`);
}
