/**
 * Webhook Consumer
 *
 * Handles actual webhook delivery with HMAC signing
 */

import { generateWebhookSignature, WEBHOOK_TIMEOUT_MS } from '@supermission/cf-shared';
import type { WebhookMessage, WebhookPayload } from '@supermission/cf-shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  responseBody?: string;
}

/**
 * Deliver a webhook to the target URL
 */
export async function deliverWebhook(webhook: WebhookMessage): Promise<DeliveryResult> {
  const payload: WebhookPayload = {
    event: webhook.event,
    timestamp: new Date().toISOString(),
    agentId: webhook.agentId,
    data: webhook.data,
  };

  const body = JSON.stringify(payload);

  try {
    // Generate HMAC signature
    const signature = await generateWebhookSignature(body, webhook.secret);

    // Make the request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': webhook.event,
          'X-Webhook-Timestamp': payload.timestamp,
          'X-Webhook-Delivery': webhook.deliveryId,
          'User-Agent': 'Supermission-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for success (2xx status codes)
      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
        };
      }

      // Non-2xx response
      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch {
        // Ignore response body read errors
      }

      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseBody: responseBody?.slice(0, 500), // Truncate for safety
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout (${WEBHOOK_TIMEOUT_MS}ms)`,
        };
      }

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: false,
      error: 'Unknown delivery error',
    };
  }
}

/**
 * Update delivery status in Supabase
 */
export async function updateDeliveryStatus(
  supabase: SupabaseClient,
  deliveryId: string,
  updates: {
    status: 'pending' | 'delivered' | 'failed' | 'retrying';
    attempts?: number;
    responseStatus?: number;
    errorMessage?: string;
    deliveredAt?: string;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status: updates.status,
    last_attempt_at: new Date().toISOString(),
  };

  if (updates.attempts !== undefined) {
    updateData.attempts = updates.attempts;
  }
  if (updates.responseStatus !== undefined) {
    updateData.response_status = updates.responseStatus;
  }
  if (updates.errorMessage !== undefined) {
    updateData.error_message = updates.errorMessage;
  }
  if (updates.deliveredAt !== undefined) {
    updateData.delivered_at = updates.deliveredAt;
  }

  const { error } = await supabase
    .from('webhook_deliveries')
    .update(updateData)
    .eq('id', deliveryId);

  if (error) {
    console.error(`[Consumer] Failed to update delivery ${deliveryId}:`, error);
  }
}
