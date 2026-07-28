/**
 * Webhook Delivery Worker
 *
 * Handles reliable webhook delivery via Cloudflare Queues:
 * - HTTP endpoint for Vercel to enqueue webhooks
 * - Queue consumer for batch processing with retry
 * - Dead letter queue for failed deliveries
 */

import { createSupabaseClient } from '@supermission/cf-shared';
import { deliverWebhook, updateDeliveryStatus } from './consumer';
import { handleEnqueueRequest, handleDlqRequest } from './producer';
import type { WebhookMessage } from '@supermission/cf-shared';

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;

  // Internal auth
  INTERNAL_SECRET: string;

  // Queues
  WEBHOOK_QUEUE: Queue<WebhookMessage>;
  WEBHOOK_DLQ: Queue<WebhookMessage & { error: string }>;

  // Config
  ENVIRONMENT: string;
}

export default {
  /**
   * HTTP handler for producer endpoint and health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Enqueue webhook for delivery
    if (url.pathname === '/enqueue' && request.method === 'POST') {
      return handleEnqueueRequest(request, env);
    }

    // List DLQ messages (for debugging)
    if (url.pathname === '/dlq' && request.method === 'GET') {
      return handleDlqRequest(request, env);
    }

    // Retry failed delivery from DLQ
    if (url.pathname === '/dlq/retry' && request.method === 'POST') {
      return handleDlqRetry(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Queue consumer for webhook delivery
   */
  async queue(batch: MessageBatch<WebhookMessage>, env: Env): Promise<void> {
    const supabase = createSupabaseClient(env);

    for (const msg of batch.messages) {
      const webhook = msg.body;

      try {
        // Attempt delivery
        const result = await deliverWebhook(webhook);

        if (result.success) {
          // Update delivery record as completed
          await updateDeliveryStatus(supabase, webhook.deliveryId, {
            status: 'delivered',
            responseStatus: result.statusCode,
            deliveredAt: new Date().toISOString(),
          });

          // Update webhook success tracking
          await supabase
            .from('agent_webhooks')
            .update({
              last_success_at: new Date().toISOString(),
              failure_count: 0,
            })
            .eq('id', webhook.webhookId);

          msg.ack();
        } else {
          // Check if we've exhausted retries
          if (webhook.attempt >= webhook.maxAttempts) {
            console.error(`[Webhook] Exhausted retries for ${webhook.deliveryId}:`, result.error);

            // Send to DLQ
            await env.WEBHOOK_DLQ.send({
              ...webhook,
              error: result.error || `HTTP ${result.statusCode}`,
            });

            // Update delivery as permanently failed
            await updateDeliveryStatus(supabase, webhook.deliveryId, {
              status: 'failed',
              errorMessage: result.error || `HTTP ${result.statusCode}`,
              responseStatus: result.statusCode,
            });

            // Update webhook failure tracking
            await supabase
              .from('agent_webhooks')
              .update({
                failure_count: webhook.attempt,
                last_failure_at: new Date().toISOString(),
                last_failure_reason: result.error || `HTTP ${result.statusCode}`,
              })
              .eq('id', webhook.webhookId);

            msg.ack();
          } else {
            // Retry with exponential backoff: 30s, 60s, 120s, 240s, 480s
            const delaySeconds = 30 * Math.pow(2, webhook.attempt - 1);

            console.log(`[Webhook] Retrying ${webhook.deliveryId} in ${delaySeconds}s (attempt ${webhook.attempt}/${webhook.maxAttempts})`);

            // Update delivery status to retrying
            await updateDeliveryStatus(supabase, webhook.deliveryId, {
              status: 'retrying',
              attempts: webhook.attempt,
              errorMessage: result.error || `HTTP ${result.statusCode}`,
              responseStatus: result.statusCode,
            });

            // Requeue with incremented attempt and delay
            msg.retry({ delaySeconds });
          }
        }
      } catch (error) {
        console.error(`[Webhook] Unexpected error for ${webhook.deliveryId}:`, error);

        // For unexpected errors, retry with backoff
        if (webhook.attempt >= webhook.maxAttempts) {
          await env.WEBHOOK_DLQ.send({
            ...webhook,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          msg.ack();
        } else {
          msg.retry({ delaySeconds: 30 * Math.pow(2, webhook.attempt - 1) });
        }
      }
    }
  },
};

/**
 * Handle DLQ retry request
 */
async function handleDlqRetry(request: Request, env: Env): Promise<Response> {
  // Verify internal auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.INTERNAL_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json() as { deliveryId: string };

    // Get delivery from database
    const supabase = createSupabaseClient(env);
    const { data: delivery, error } = await supabase
      .from('webhook_deliveries')
      .select('*, agent_webhooks(url, secret)')
      .eq('id', body.deliveryId)
      .single();

    if (error || !delivery) {
      return new Response(JSON.stringify({ error: 'Delivery not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Requeue with reset attempt counter
    const message: WebhookMessage = {
      deliveryId: delivery.id,
      webhookId: delivery.webhook_id,
      url: delivery.agent_webhooks.url,
      secret: delivery.agent_webhooks.secret,
      event: delivery.event_type,
      agentId: delivery.payload.agentId,
      data: delivery.payload.data,
      attempt: 1,
      maxAttempts: 5,
      createdAt: new Date().toISOString(),
    };

    await env.WEBHOOK_QUEUE.send(message);

    // Update delivery status
    await supabase
      .from('webhook_deliveries')
      .update({ status: 'pending', attempts: 0 })
      .eq('id', body.deliveryId);

    return new Response(JSON.stringify({ success: true, message: 'Requeued for delivery' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to retry' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
