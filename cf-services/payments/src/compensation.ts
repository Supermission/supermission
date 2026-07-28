/**
 * Compensation Handlers
 *
 * Rollback partial state on workflow failure
 */

import { createSupabaseClient } from '@supermission/cf-shared';
import type { PaymentWorkflowParams } from '@supermission/cf-shared';
import type { Env } from './index';

/**
 * Compensate for payment workflow failure
 *
 * @param params - Original workflow parameters
 * @param failedStep - Name of the step that failed
 * @param error - Error message from the failure
 * @param env - Worker environment
 */
export async function compensatePayment(
  params: PaymentWorkflowParams,
  failedStep: string,
  error: string,
  env: Env
): Promise<void> {
  const supabase = createSupabaseClient(env);

  console.log(`[Compensation] Starting compensation for payment ${params.paymentRecordId}, failed at: ${failedStep}`);

  try {
    // 1. Update mission_payments to failed status
    await supabase
      .from('mission_payments')
      .update({
        status: 'failed',
        error_message: error,
        failed_step: failedStep,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.paymentRecordId);

    // 2. Update x402_payments if we created one
    if (failedStep !== 'none' && failedStep !== 'create-requirements') {
      await supabase
        .from('x402_payments')
        .update({
          status: 'failed',
          error_message: error,
          updated_at: new Date().toISOString(),
        })
        .eq('task_id', params.taskId)
        .eq('status', 'pending')
        .or('status.eq.signing,status.eq.settling');
    }

    // 3. Release anti-replay claim if we got past signing
    if (failedStep === 'settle-on-chain' || failedStep === 'finalize-database') {
      // Try to release any anti-replay claim
      const { data: claim } = await supabase
        .from('x402_payment_anti_replay')
        .select('payment_hash')
        .eq('to_address', params.recipientAddress)
        .eq('status', 'settling')
        .single();

      if (claim) {
        await supabase
          .from('x402_payment_anti_replay')
          .update({ status: 'released' })
          .eq('payment_hash', claim.payment_hash);
      }
    }

    // 4. Log compensation event
    await supabase
      .from('workflow_events')
      .insert({
        workflow_type: 'payment',
        workflow_id: `payment-${params.paymentRecordId}`,
        event_type: 'compensation',
        event_data: {
          failedStep,
          error,
          params: {
            paymentRecordId: params.paymentRecordId,
            taskId: params.taskId,
            missionId: params.missionId,
            reward: params.reward,
          },
        },
        created_at: new Date().toISOString(),
      });

    console.log(`[Compensation] Completed compensation for payment ${params.paymentRecordId}`);
  } catch (compError) {
    // Log compensation failure but don't throw - we're already in error handling
    console.error(`[Compensation] Failed to compensate payment ${params.paymentRecordId}:`, compError);

    // Try to at least log the compensation failure
    try {
      await supabase
        .from('workflow_events')
        .insert({
          workflow_type: 'payment',
          workflow_id: `payment-${params.paymentRecordId}`,
          event_type: 'compensation_failed',
          event_data: {
            originalError: error,
            compensationError: compError instanceof Error ? compError.message : 'Unknown',
          },
          created_at: new Date().toISOString(),
        });
    } catch {
      // Final fallback - just log to console
      console.error(`[Compensation] Complete failure for ${params.paymentRecordId}`);
    }
  }
}
