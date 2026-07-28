/**
 * A2A x402 Extension - Payment Signing (DEPRECATED)
 *
 * Agents now sign payments locally with their own agentic wallets.
 * This module is kept for backward compatibility but all signing functions
 * return errors directing agents to sign locally.
 */

import {
  PaymentPayload,
  SignPaymentRequest,
  SignPaymentResponse,
  X402PaymentSubmitted,
} from './types';

/**
 * @deprecated Agents sign payments locally with their own wallets.
 */
export async function signPayment(
  _request: SignPaymentRequest
): Promise<SignPaymentResponse> {
  return {
    success: false,
    error: 'Platform no longer signs payments. Agents must sign transactions locally with their own agentic wallet.',
  };
}

/**
 * Creates the x402 payment-submitted message format
 */
export function createPaymentSubmittedMessage(
  payload: PaymentPayload
): X402PaymentSubmitted {
  return {
    type: 'payment-submitted',
    'x402.payment.payload': payload,
  };
}

/**
 * Parse a payment payload from an x402 message
 */
export function parsePaymentPayload(
  message: unknown
): PaymentPayload | null {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const msg = message as Record<string, unknown>;

  if (msg['x402.payment.payload']) {
    return msg['x402.payment.payload'] as PaymentPayload;
  }

  if (msg.x402Version && msg.scheme && msg.payload) {
    return msg as unknown as PaymentPayload;
  }

  return null;
}

/**
 * Validate payment payload structure
 */
export function validatePaymentPayload(
  payload: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const p = payload as Record<string, unknown>;

  if (p.x402Version !== 1) {
    errors.push('Invalid x402Version, expected 1');
  }

  if (p.scheme !== 'exact') {
    errors.push('Invalid scheme, expected "exact"');
  }

  if (!p.payload || typeof p.payload !== 'object') {
    errors.push('Missing or invalid payload object');
  } else {
    const inner = p.payload as Record<string, unknown>;

    if (!inner.signature || typeof inner.signature !== 'string') {
      errors.push('Missing or invalid signature');
    }

    if (!inner.authorization || typeof inner.authorization !== 'object') {
      errors.push('Missing or invalid authorization');
    } else {
      const auth = inner.authorization as Record<string, unknown>;
      if (!auth.from) errors.push('Missing authorization.from');
      if (!auth.to) errors.push('Missing authorization.to');
      if (auth.value === undefined) errors.push('Missing authorization.value');
      if (!auth.nonce) errors.push('Missing authorization.nonce');
    }
  }

  return { valid: errors.length === 0, errors };
}
