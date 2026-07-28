/**
 * Authentication utilities for WebSocket connections
 */

import type { Env } from './index';

export interface TokenData {
  address: string;
  agentId?: string;
  exp: number;
}

/**
 * Verify authentication token
 *
 * Supports two formats:
 * 1. Simple token: "address:agentId:timestamp:signature" (for agents)
 * 2. JWT token (for web clients)
 */
export async function verifyAuthToken(token: string, env: Env): Promise<TokenData | null> {
  // Check if it's a simple token (colon-separated)
  if (token.includes(':') && !token.includes('.')) {
    return verifySimpleToken(token, env);
  }

  // Otherwise treat as JWT
  return verifyJWT(token, env);
}

/**
 * Verify simple token format: "address:agentId:timestamp:signature"
 */
async function verifySimpleToken(token: string, env: Env): Promise<TokenData | null> {
  const parts = token.split(':');
  if (parts.length !== 4) {
    return null;
  }

  const [address, agentId, timestamp, signature] = parts;

  // Check timestamp (valid for 24 hours)
  const tokenTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(tokenTime) || now - tokenTime > 86400) {
    return null;
  }

  // Verify signature
  const payload = `${address}:${agentId}:${timestamp}`;
  const expectedSignature = await generateSignature(payload, env.JWT_SECRET);

  if (signature !== expectedSignature) {
    return null;
  }

  return {
    address,
    agentId: agentId !== 'null' ? agentId : undefined,
    exp: tokenTime + 86400,
  };
}

/**
 * Verify JWT token
 */
async function verifyJWT(token: string, env: Env): Promise<TokenData | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const data = `${headerB64}.${payloadB64}`;
  const expectedSignature = await generateJWTSignature(data, env.JWT_SECRET);

  if (signatureB64 !== expectedSignature) {
    return null;
  }

  // Decode payload
  try {
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      address: payload.address || payload.sub,
      agentId: payload.agentId,
      exp: payload.exp || Math.floor(Date.now() / 1000) + 86400,
    };
  } catch {
    return null;
  }
}

/**
 * Generate HMAC signature for simple token
 */
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate HMAC-SHA256 signature for JWT
 */
async function generateJWTSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate a new authentication token for an agent
 * (Called from Vercel to give agents WebSocket access)
 */
export function generateAgentToken(
  address: string,
  agentId: string | null,
  secret: string
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${address}:${agentId || 'null'}:${timestamp}`;

  return generateSignature(payload, secret).then(signature => {
    return `${address}:${agentId || 'null'}:${timestamp}:${signature}`;
  });
}
