/**
 * API Key Authentication Middleware
 * Provides authentication, rate limiting, and request logging for protected endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { createHash, randomUUID } from 'crypto';
import { checkPerEndpointRateLimit } from './rate-limit-per-endpoint';


// ==========================================
// Types
// ==========================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp (seconds)
}

export interface AuthContext {
  keyId: string;
  agentId: string | null;
  ownerAddress: string;
  permissions: string[];
  requestId: string;
}

export interface AuthResult {
  success: boolean;
  context?: AuthContext;
  error?: string;
  statusCode?: number;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
}

// ==========================================
// Request ID Generation
// ==========================================

/**
 * Generate a unique request ID for tracing/debugging
 * Format: req_<16 hex chars>
 */
export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ==========================================
// Core Functions
// ==========================================

/**
 * Extract API key from Authorization header
 * Format: Authorization: Bearer sk_xxx
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const key = parts[1];
  // API keys should start with sk_
  if (!key.startsWith('sk_')) {
    return null;
  }

  return key;
}

/**
 * Hash API key for secure storage/lookup
 * We use SHA-256 to hash the full key for comparison
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate API key and return auth context
 */
export async function validateApiKey(key: string): Promise<AuthResult> {
  const keyHash = hashApiKey(key);

  const { data: keyRecord, error } = await supabaseAdmin
    .from('agent_api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .single();

  if (error || !keyRecord) {
    return { success: false, error: 'Invalid API key', statusCode: 401 };
  }

  // Check if key is active
  if (!keyRecord.is_active) {
    return { success: false, error: 'API key is inactive', statusCode: 401 };
  }

  // Check if key is revoked
  if (keyRecord.revoked_at) {
    return { success: false, error: 'API key has been revoked', statusCode: 401 };
  }

  // Check if key is expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return { success: false, error: 'API key has expired', statusCode: 401 };
  }

  return {
    success: true,
    context: {
      keyId: keyRecord.id,
      agentId: keyRecord.agent_id,
      ownerAddress: keyRecord.owner_address,
      permissions: keyRecord.permissions || ['read', 'write'],
      requestId: '', // Placeholder - set in authenticateRequest
    },
  };
}

/**
 * Check rate limit for API key
 * Returns rate limit info including reset time for headers
 */
export async function checkRateLimit(keyId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: number; // Unix timestamp (seconds)
}> {
  // Prefer atomic RPC to avoid race conditions under concurrency.
  try {
    const { data, error } = await supabaseAdmin.rpc('check_and_increment_rate_limit', {
      p_key_id: keyId,
    });

    if (!error && data && data[0]) {
      return {
        allowed: !!data[0].allowed,
        remaining: Number(data[0].remaining || 0),
        limit: Number(data[0].rate_limit || 0),
        reset: Number(data[0].reset || 0),
      };
    }
  } catch {
    // Fall back to legacy logic below
  }

  // Legacy fallback (non-atomic) — retained for backward compatibility if RPC isn't available.
  const { data: keyRecord, error } = await supabaseAdmin
    .from('agent_api_keys')
    .select('rate_limit, requests_today, last_reset_date')
    .eq('id', keyId)
    .single();

  if (error || !keyRecord) {
    return { allowed: false, remaining: 0, limit: 0, reset: 0 };
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const lastReset = keyRecord.last_reset_date;
  const rateLimit = keyRecord.rate_limit || 1000;

  // Calculate reset time (midnight UTC of next day)
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const resetTimestamp = Math.floor(tomorrow.getTime() / 1000);

  // Reset counter if new day
  if (lastReset !== today) {
    await supabaseAdmin
      .from('agent_api_keys')
      .update({
        requests_today: 1,
        last_reset_date: today,
        last_request_at: now.toISOString(),
      })
      .eq('id', keyId);

    return { allowed: true, remaining: rateLimit - 1, limit: rateLimit, reset: resetTimestamp };
  }

  // Check if within limit
  const requestsToday = keyRecord.requests_today || 0;

  if (requestsToday >= rateLimit) {
    return { allowed: false, remaining: 0, limit: rateLimit, reset: resetTimestamp };
  }

  // Increment counter
  await supabaseAdmin
    .from('agent_api_keys')
    .update({
      requests_today: requestsToday + 1,
      last_request_at: now.toISOString(),
    })
    .eq('id', keyId);

  return { allowed: true, remaining: rateLimit - requestsToday - 1, limit: rateLimit, reset: resetTimestamp };
}

/**
 * Check if key has required permission
 */
export function checkPermissions(context: AuthContext, requiredPermission: 'read' | 'write'): boolean {
  return context.permissions.includes(requiredPermission);
}

/**
 * Log API request for analytics/debugging
 */
export async function logRequest(
  keyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  request: NextRequest
): Promise<void> {
  try {
    await supabaseAdmin.from('api_request_logs').insert({
      api_key_id: keyId,
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      user_agent: request.headers.get('user-agent') || 'unknown',
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log request:', error);
  }
}

// ==========================================
// Middleware Wrapper
// ==========================================

/**
 * Authenticate request and return context or error response
 */
export async function authenticateRequest(
  request: NextRequest,
  requiredPermission: 'read' | 'write' = 'read'
): Promise<AuthResult> {
  // Generate request ID for tracing
  const requestId = generateRequestId();

  // Extract API key
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return {
      success: false,
      error: 'Missing or invalid Authorization header. Use: Authorization: Bearer sk_xxx',
      statusCode: 401,
    };
  }

  // Validate key
  const validationResult = await validateApiKey(apiKey);
  if (!validationResult.success) {
    return validationResult;
  }

  const context = validationResult.context!;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(context.keyId);
  const rateLimit: RateLimitInfo = {
    limit: rateLimitResult.limit,
    remaining: rateLimitResult.remaining,
    reset: rateLimitResult.reset,
  };

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: 'Rate limit exceeded. Please try again later.',
      statusCode: 429,
      rateLimit,
    };
  }

  // Per-endpoint rate limit (Supabase-backed, shared across instances)
  const endpointLimit = await checkPerEndpointRateLimit(
    context.keyId,
    request.nextUrl.pathname
  );
  if (!endpointLimit.allowed) {
    return {
      success: false,
      error: 'Per-endpoint rate limit exceeded. Please slow down.',
      statusCode: 429,
      rateLimit,
      retryAfterSeconds: endpointLimit.retryAfterSeconds,
    };
  }

  // Check permissions
  if (!checkPermissions(context, requiredPermission)) {
    return {
      success: false,
      error: `Permission denied. Required: ${requiredPermission}`,
      statusCode: 403,
      rateLimit,
    };
  }

  // Add requestId to context
  context.requestId = requestId;

  return { success: true, context, rateLimit };
}

/**
 * Create error response with proper status code and headers
 */
export function createAuthErrorResponse(result: AuthResult, requestId?: string): NextResponse {
  const response = NextResponse.json(
    { success: false, error: result.error, requestId },
    { status: result.statusCode || 401 }
  );

  // Add rate limit headers if available
  if (result.rateLimit) {
    addRateLimitHeaders(response, result.rateLimit);
  }

  // Add Retry-After header for per-endpoint rate limits
  if (result.retryAfterSeconds) {
    response.headers.set('Retry-After', result.retryAfterSeconds.toString());
  }

  // Add request ID header
  if (requestId) {
    response.headers.set('X-Request-ID', requestId);
  }

  return response;
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(response: NextResponse, rateLimit: RateLimitInfo): void {
  response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimit.reset.toString());
}

/**
 * Add standard agentic headers (request ID, rate limit) to a response
 */
export function addAgenticHeaders(
  response: NextResponse,
  context: AuthContext,
  rateLimit?: RateLimitInfo
): NextResponse {
  response.headers.set('X-Request-ID', context.requestId);
  if (rateLimit) {
    addRateLimitHeaders(response, rateLimit);
  }
  return response;
}

/**
 * Safely parse JSON request body
 * Returns { data, error } to allow proper error handling
 */
export async function safeParseJson<T = Record<string, unknown>>(
  request: NextRequest
): Promise<{ data: T | null; error: NextResponse | null }> {
  try {
    const data = await request.json();
    return { data: data as T, error: null };
  } catch {
    return {
      data: null,
      error: NextResponse.json(
        { success: false, error: 'Invalid or missing JSON body' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Higher-order function to wrap route handlers with authentication
 * Automatically adds rate limit and request ID headers to all responses
 */
export function withAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>,
  requiredPermission: 'read' | 'write' = 'read'
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();

    const authResult = await authenticateRequest(request, requiredPermission);

    if (!authResult.success) {
      // Generate a request ID for error responses too
      const requestId = generateRequestId();
      return createAuthErrorResponse(authResult, requestId);
    }

    const context = authResult.context!;
    const rateLimit = authResult.rateLimit;

    try {
      const response = await handler(request, context);

      // Add agentic headers (request ID, rate limit)
      addAgenticHeaders(response, context, rateLimit);

      // Log the request
      const responseTime = Date.now() - startTime;
      const statusCode = response.status;
      await logRequest(
        context.keyId,
        request.nextUrl.pathname,
        request.method,
        statusCode,
        responseTime,
        request
      );

      return response;
    } catch (error) {
      console.error('Handler error:', error);
      const errorResponse = NextResponse.json(
        { success: false, error: 'Internal server error', requestId: context.requestId },
        { status: 500 }
      );
      addAgenticHeaders(errorResponse, context, rateLimit);
      return errorResponse;
    }
  };
}
