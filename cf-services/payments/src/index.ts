/**
 * Payment Workflow Worker
 *
 * Handles durable payment execution via Cloudflare Workflows:
 * - HTTP endpoint for Vercel to trigger payment workflows
 * - Workflow definition with saga pattern
 * - Automatic retry and compensation on failure
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { createSupabaseClient, verifyInternalSignature } from '@supermission/cf-shared';
import type { PaymentWorkflowParams, PaymentWorkflowResult, WebhookMessage } from '@supermission/cf-shared';
import { createRequirements } from './steps/create-requirements';
import { signPayment } from './steps/sign-payment';
import { settleOnChain } from './steps/settle-on-chain';
import { finalizeDatabase } from './steps/update-database';
import { compensatePayment } from './compensation';

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;

  // Internal auth
  INTERNAL_SECRET: string;

  // Blockchain
  BASE_RPC_URL: string;
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;

  // Bindings
  PAYMENT_WORKFLOW: Workflow<PaymentWorkflowParams>;
  WEBHOOK_QUEUE: Queue<WebhookMessage>;

  // Config
  ENVIRONMENT: string;
}

/**
 * Payment Workflow - Durable saga pattern for x402 payments
 */
export class PaymentWorkflow extends WorkflowEntrypoint<Env, PaymentWorkflowParams> {
  async run(event: WorkflowEvent<PaymentWorkflowParams>, step: WorkflowStep): Promise<PaymentWorkflowResult> {
    const params = event.payload;
    const result: PaymentWorkflowResult = {
      status: 'completed',
      steps: [],
    };

    let requirements: Awaited<ReturnType<typeof createRequirements>> | null = null;
    let signedPayload: Awaited<ReturnType<typeof signPayment>> | null = null;
    let txHash: string | null = null;

    try {
      // Step 1: Create payment requirements
      const reqResult = await step.do('create-requirements', {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      }, async () => {
        return createRequirements(params, this.env);
      });

      requirements = reqResult;
      result.steps.push({ name: 'create-requirements', status: 'completed' });

      // Step 2: Sign payment via CDP
      const signResult = await step.do('sign-payment', {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      }, async () => {
        return signPayment(params, requirements!, this.env);
      });

      signedPayload = signResult;
      result.steps.push({ name: 'sign-payment', status: 'completed' });

      // Step 3: Settle on-chain (CRITICAL - most retries, longest timeout)
      const settleResult = await step.do('settle-on-chain', {
        retries: { limit: 5, delay: '30 seconds', backoff: 'exponential' },
        timeout: '5 minutes',
      }, async () => {
        return settleOnChain(params, signedPayload!, this.env);
      });

      txHash = settleResult.txHash;
      result.txHash = txHash;
      result.steps.push({ name: 'settle-on-chain', status: 'completed' });

      // Step 4: Update database records (after on-chain success)
      await step.do('finalize-database', {
        retries: { limit: 5, delay: '5 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      }, async () => {
        return finalizeDatabase(params, settleResult, this.env);
      });

      result.steps.push({ name: 'finalize-database', status: 'completed' });

      // Step 5: Trigger webhook notification
      await step.do('trigger-webhook', {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '10 seconds',
      }, async () => {
        await this.env.WEBHOOK_QUEUE.send({
          deliveryId: `dlv_${crypto.randomUUID().replace(/-/g, '')}`,
          webhookId: '', // Will be looked up by consumer
          url: '', // Will be looked up by consumer
          secret: '', // Will be looked up by consumer
          event: 'payment.received',
          agentId: params.assignedAgentId,
          data: {
            missionId: params.missionId,
            taskId: params.taskId,
            amount: params.reward,
            txHash,
            fromAddress: params.creatorAddress,
            toAddress: params.recipientAddress,
          },
          attempt: 1,
          maxAttempts: 5,
          createdAt: new Date().toISOString(),
        });
      });

      result.steps.push({ name: 'trigger-webhook', status: 'completed' });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.status = 'failed';
      result.error = errorMessage;

      // Run compensation to clean up partial state
      const lastCompletedStep = result.steps[result.steps.length - 1]?.name || 'none';

      await step.do('compensate', {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      }, async () => {
        await compensatePayment(params, lastCompletedStep, errorMessage, this.env);
      });

      // Trigger failure webhook
      await step.do('trigger-failure-webhook', {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
        timeout: '10 seconds',
      }, async () => {
        await this.env.WEBHOOK_QUEUE.send({
          deliveryId: `dlv_${crypto.randomUUID().replace(/-/g, '')}`,
          webhookId: '',
          url: '',
          secret: '',
          event: 'payment.failed',
          agentId: params.assignedAgentId,
          data: {
            missionId: params.missionId,
            taskId: params.taskId,
            amount: params.reward,
            error: errorMessage,
            failedStep: lastCompletedStep,
          },
          attempt: 1,
          maxAttempts: 5,
          createdAt: new Date().toISOString(),
        });
      });

      return result;
    }
  }
}

export default {
  /**
   * HTTP handler for workflow trigger endpoint
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Trigger new payment workflow
    if (url.pathname === '/trigger' && request.method === 'POST') {
      return handleTriggerRequest(request, env);
    }

    // Get workflow status
    if (url.pathname.startsWith('/status/') && request.method === 'GET') {
      const instanceId = url.pathname.split('/status/')[1];
      return handleStatusRequest(instanceId, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Handle workflow trigger request
 */
async function handleTriggerRequest(request: Request, env: Env): Promise<Response> {
  // Verify internal auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.INTERNAL_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const params = await request.json() as PaymentWorkflowParams;

    // Validate required fields
    const required = [
      'paymentRecordId', 'taskId', 'missionId', 'assignedAgentId',
      'assignedAgentName', 'assignedAgentWalletId', 'recipientAddress',
      'creatorAgentName', 'creatorWalletId', 'creatorAddress', 'reward'
    ];

    for (const field of required) {
      if (!params[field as keyof PaymentWorkflowParams]) {
        return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Create workflow instance
    const instance = await env.PAYMENT_WORKFLOW.create({
      id: `payment-${params.paymentRecordId}`,
      params,
    });

    return new Response(JSON.stringify({
      success: true,
      workflowId: instance.id,
      status: await instance.status(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Payments] Trigger error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle workflow status request
 */
async function handleStatusRequest(instanceId: string, env: Env): Promise<Response> {
  try {
    const instance = await env.PAYMENT_WORKFLOW.get(instanceId);
    const status = await instance.status();

    return new Response(JSON.stringify({
      success: true,
      workflowId: instanceId,
      status,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Workflow not found',
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
