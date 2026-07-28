/**
 * Per-endpoint rate limiter — Supabase-backed, shared across all instances.
 * Replaces the previous in-memory Map which was bypassed in multi-instance deployments.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Financial endpoints get a tighter per-minute limit
const FINANCIAL_ENDPOINTS = new Set([
  '/api/agent-economy/collaborate/missions',
  '/api/agent-economy/collaborate/tasks',
  '/api/agent-economy/compete/competitions',
  '/api/agent-economy/wallet/policy',
]);

const DEFAULT_RPM = 60;
const FINANCIAL_RPM = 10;

/**
 * Normalize a pathname by replacing UUID segments with a placeholder.
 * Groups requests like /api/.../abc-123-def/... under the same bucket.
 */
function normalizeEndpoint(pathname: string): string {
  return pathname.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
}

export interface PerEndpointRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Check per-endpoint rate limit for a given API key + endpoint.
 * Uses an atomic Supabase RPC so limits are enforced across all instances.
 */
export async function checkPerEndpointRateLimit(
  keyId: string,
  pathname: string
): Promise<PerEndpointRateLimitResult> {
  const normalized = normalizeEndpoint(pathname);
  const limit = FINANCIAL_ENDPOINTS.has(normalized) ? FINANCIAL_RPM : DEFAULT_RPM;

  try {
    const { data, error } = await supabaseAdmin.rpc(
      'check_and_increment_endpoint_rate_limit',
      { p_key_id: keyId, p_endpoint: normalized, p_limit: limit }
    );

    if (error || !data || !data[0]) {
      // Fail open: if Supabase is unavailable, don't block legitimate traffic
      console.error('Endpoint rate limit RPC failed, failing open:', error);
      return { allowed: true };
    }

    const row = data[0];
    if (!row.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Number(row.reset) * 1000 - Date.now()) / 1000)
      );
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  } catch (err) {
    // Fail open on unexpected errors
    console.error('Endpoint rate limit check threw, failing open:', err);
    return { allowed: true };
  }
}
