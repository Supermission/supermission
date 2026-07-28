/**
 * Webhook Producer
 *
 * HTTP endpoint for Vercel to enqueue webhooks for delivery
 */

import { createSupabaseClient, verifyInternalSignature, generateId } from '@supermission/cf-shared';
import type { WebhookMessage, WebhookEvent, ApiResponse } from '@supermission/cf-shared';
import { WEBHOOK_MAX_ATTEMPTS } from '@supermission/cf-shared';
import type { Env } from './index';

interface EnqueueRequest {
  agentId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
}

interface EnqueueResponse {
  queued: number;
  deliveryIds: string[];
}

/**
 * Handle webhook enqueue request from Vercel
 */
export async function handleEnqueueRequest(
  request: Request,
  env: Env
): Promise<Response> {
  // Verify internal authentication
  const authHeader = request.headers.get('Authorization');
  const timestamp = request.headers.get('X-Timestamp');
  const signature = request.headers.get('X-Signature');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: 'Missing authorization' }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== env.INTERNAL_SECRET) {
    // Try signature-based auth for extra security
    if (!timestamp || !signature) {
      return jsonResponse({ success: false, error: 'Invalid authorization' }, 401);
    }

    const body = await request.text();
    const payload = `${timestamp}.${body}`;
    const isValid = await verifyInternalSignature(payload, signature, env.INTERNAL_SECRET);

    if (!isValid) {
      return jsonResponse({ success: false, error: 'Invalid signature' }, 401);
    }

    // Re-parse body
    try {
      var requestBody = JSON.parse(body) as EnqueueRequest;
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
  } else {
    try {
      var requestBody = await request.json() as EnqueueRequest;
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
  }

  // Validate request
  if (!requestBody.agentId || !requestBody.event || !requestBody.data) {
    return jsonResponse({ success: false, error: 'Missing required fields: agentId, event, data' }, 400);
  }

  try {
    const supabase = createSupabaseClient(env);

    // Find active webhooks for this agent and event
    const { data: webhooks, error: webhookError } = await supabase
      .from('agent_webhooks')
      .select('id, url, secret')
      .eq('agent_id', requestBody.agentId)
      .eq('is_active', true)
      .contains('events', [requestBody.event]);

    if (webhookError) {
      console.error('[Producer] Failed to fetch webhooks:', webhookError);
      return jsonResponse({ success: false, error: 'Database error' }, 500);
    }

    if (!webhooks || webhooks.length === 0) {
      // No webhooks to trigger - this is fine, not an error
      return jsonResponse<EnqueueResponse>({
        success: true,
        data: { queued: 0, deliveryIds: [] },
      });
    }

    // Create delivery records
    const deliveryIds: string[] = [];
    const deliveries = webhooks.map(wh => {
      const deliveryId = generateId('dlv');
      deliveryIds.push(deliveryId);
      return {
        id: deliveryId,
        webhook_id: wh.id,
        event_type: requestBody.event,
        payload: {
          event: requestBody.event,
          timestamp: new Date().toISOString(),
          agentId: requestBody.agentId,
          data: requestBody.data,
        },
        status: 'pending',
        attempts: 0,
        max_attempts: WEBHOOK_MAX_ATTEMPTS,
      };
    });

    const { error: insertError } = await supabase
      .from('webhook_deliveries')
      .insert(deliveries);

    if (insertError) {
      console.error('[Producer] Failed to create deliveries:', insertError);
      return jsonResponse({ success: false, error: 'Failed to create delivery records' }, 500);
    }

    // Enqueue messages for delivery
    const messages: WebhookMessage[] = webhooks.map((wh, i) => ({
      deliveryId: deliveryIds[i],
      webhookId: wh.id,
      url: wh.url,
      secret: wh.secret,
      event: requestBody.event,
      agentId: requestBody.agentId,
      data: requestBody.data,
      attempt: 1,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      createdAt: new Date().toISOString(),
    }));

    // Batch send to queue
    await env.WEBHOOK_QUEUE.sendBatch(messages.map(m => ({ body: m })));

    console.log(`[Producer] Queued ${messages.length} webhooks for agent ${requestBody.agentId}, event ${requestBody.event}`);

    return jsonResponse<EnqueueResponse>({
      success: true,
      data: { queued: messages.length, deliveryIds },
    });
  } catch (error) {
    console.error('[Producer] Unexpected error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * Handle DLQ listing request
 */
export async function handleDlqRequest(
  request: Request,
  env: Env
): Promise<Response> {
  // Verify internal auth
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.INTERNAL_SECRET}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const supabase = createSupabaseClient(env);

    // Get failed deliveries from database
    const { data: failed, error } = await supabase
      .from('webhook_deliveries')
      .select('*, agent_webhooks(url, agent_id)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return jsonResponse({ success: false, error: 'Database error' }, 500);
    }

    return jsonResponse({
      success: true,
      data: {
        count: failed?.length || 0,
        deliveries: failed || [],
      },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
}

/**
 * Helper to create JSON response
 */
function jsonResponse<T>(body: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
