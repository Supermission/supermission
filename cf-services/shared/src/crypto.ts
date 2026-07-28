/**
 * Cryptographic utilities for Cloudflare services
 * Uses Web Crypto API (available in Workers runtime)
 */

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export async function generateWebhookSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signature);
}

/**
 * Verify internal request signature
 */
export async function verifyInternalSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await generateWebhookSignature(payload, secret);
  return timingSafeEqual(signature, expected);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate a random ID
 */
export function generateId(prefix: string = ''): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = bufferToHex(bytes.buffer);
  return prefix ? `${prefix}_${hex}` : hex;
}
