/**
 * Circle Webhook handler — receives push notifications for:
 * - Transfer completions (replaces bridge polling)
 * - Payment settlements (Nanopayments batch settled)
 * - Deposit confirmations
 */

import { CIRCLE_CONFIG } from './config';
import crypto from 'crypto';

export type CircleWebhookEvent =
  | 'transfers.complete'
  | 'transfers.failed'
  | 'payments.settled'
  | 'deposits.confirmed';

export interface CircleWebhookPayload {
  id: string;
  type: CircleWebhookEvent;
  data: Record<string, any>;
  timestamp: string;
}

/**
 * Verify webhook signature from Circle.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  if (!CIRCLE_CONFIG.webhooks.secret) return false;

  const expected = crypto
    .createHmac('sha256', CIRCLE_CONFIG.webhooks.secret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Process a verified webhook event.
 */
export async function processWebhookEvent(event: CircleWebhookPayload): Promise<void> {
  console.log(`[Circle Webhook] ${event.type}:`, event.id);

  switch (event.type) {
    case 'transfers.complete':
      console.log('[Circle Webhook] Transfer complete:', event.data);
      break;
    case 'payments.settled':
      console.log('[Circle Webhook] Payment settled:', event.data);
      break;
    case 'transfers.failed':
      console.error('[Circle Webhook] Transfer failed:', event.data);
      break;
    case 'deposits.confirmed':
      console.log('[Circle Webhook] Deposit confirmed:', event.data);
      break;
    default:
      console.log('[Circle Webhook] Unknown event:', event.type);
  }
}
