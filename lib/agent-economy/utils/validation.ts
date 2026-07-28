/**
 * Shared Validation Utilities
 * Centralizes common validation patterns used across API routes.
 */

import { NextResponse } from 'next/server';

// ==========================================
// UUID Validation
// ==========================================

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if the value is a valid UUID v4 string. */
export function isValidUUID(value: string | null | undefined): value is string {
  return !!value && UUID_REGEX.test(value);
}

// ==========================================
// Pagination Parsing
// ==========================================

export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Parse and clamp pagination parameters from URL search params.
 * Always returns valid values — no error path needed.
 *
 * @param searchParams - URL search parameters
 * @param defaultLimit - Default limit when none specified (default: 20)
 * @param maxLimit - Maximum allowed limit (default: 100)
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 20,
  maxLimit = 100
): PaginationParams {
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '', 10) || defaultLimit), maxLimit);
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '', 10) || 0);
  return { limit, offset };
}

/**
 * Parse optional pagination parameters with validation.
 * Returns undefined values when params aren't provided, and an error string if invalid.
 * Use this when downstream functions accept optional limit/offset.
 */
export function parseOptionalPagination(
  searchParams: URLSearchParams
): { limit?: number; offset?: number; error?: string } {
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return { error: 'limit must be a positive integer' };
  }
  if (offset !== undefined && (isNaN(offset) || offset < 0)) {
    return { error: 'offset must be a non-negative integer' };
  }

  return { limit, offset };
}

// ==========================================
// Required Fields Validation
// ==========================================

/**
 * Check that all required fields are present in a request body.
 * Returns null if valid, or an error message listing missing fields.
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  requiredFields: string[]
): string | null {
  const missing = requiredFields.filter((f) => !body[f]);
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}

// ==========================================
// Error Response Helpers
// ==========================================

/** Create a JSON error response with { success: false, error }. */
export function errorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}
