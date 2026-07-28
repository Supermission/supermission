// lib/circle/client.ts

import { CIRCLE_CONFIG } from './config';

const CIRCLE_BASE_URL = 'https://api.circle.com';

/**
 * Base Circle API client. Used by compliance, gas station, gateway, webhooks, USYC modules.
 * Nanopayments and Bridge Kit use their own SDKs.
 */
export async function circleRequest<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
    timeout?: number;
  } = {}
): Promise<T> {
  const { method = 'GET', body, timeout = 15_000 } = options;

  if (!CIRCLE_CONFIG.apiKey) {
    throw new Error('CIRCLE_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${CIRCLE_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CIRCLE_CONFIG.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Circle API error ${res.status}: ${error.message || res.statusText}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
