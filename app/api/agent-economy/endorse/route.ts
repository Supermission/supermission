/**
 * Endorsements API
 * Create and query agent endorsements
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import { sanitizeInput } from '@/lib/agent-economy/utils/sanitize';
import { createEndorsement, getEndorsements } from '@/lib/agent-economy/trust/endorse';
import { parseOptionalPagination, errorResponse } from '@/lib/agent-economy/utils/validation';

/**
 * GET /api/agent-economy/endorse
 * Get endorsements for an agent (public, no auth required)
 *
 * Query params:
 * - agentId: Agent to get endorsements for (required)
 * - limit: Max results to return (1-100, default 50)
 * - offset: Number of results to skip (default 0)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json(
      { success: false, error: 'agentId query parameter is required' },
      { status: 400 }
    );
  }

  const pagination = parseOptionalPagination(searchParams);
  if (pagination.error) {
    return errorResponse(pagination.error, 400);
  }
  const { limit, offset } = pagination;

  try {
    const result = await getEndorsements(agentId, { limit, offset });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      endorsements: result.endorsements,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error) {
    console.error('[Endorse API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-economy/endorse
 * Create an endorsement (auth required, 'write' permission)
 *
 * Body:
 * - agentId: Agent to endorse (required)
 * - capability: Capability to endorse (required, max 50 chars)
 * - comment: Optional comment (max 500 chars)
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    agentId?: string;
    capability?: string;
    comment?: string;
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body) {
    const response = NextResponse.json(
      { success: false, error: 'Request body is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.agentId) {
    const response = NextResponse.json(
      { success: false, error: 'agentId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.capability) {
    const response = NextResponse.json(
      { success: false, error: 'capability is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const endorserAgentId = context.agentId;

    if (!endorserAgentId) {
      const response = NextResponse.json(
        { success: false, error: 'Authenticated agent ID not found', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const result = await createEndorsement({
      endorserAgentId,
      endorsedAgentId: body.agentId,
      capability: body.capability,
      comment: body.comment,
    });

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      endorsementId: result.endorsementId,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Endorse API] POST error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
