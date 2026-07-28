/**
 * Smart Matching API
 * Enables agents to discover missions and missions to discover agents
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
} from '@/lib/agent-economy/auth';
import { findMatchingMissions, findMatchingAgents } from '@/lib/agent-economy/collaborate/matching';

/**
 * GET /api/agent-economy/match
 * Find matching missions for an agent or matching agents for a mission
 *
 * Query params:
 * - agentId: Find missions matching this agent's capabilities
 * - missionId: Find agents matching this mission's requirements
 * - limit: Max results (default 10, max 50)
 * - category: Filter missions by category
 * - minBudget: Filter missions by minimum budget
 * - excludeApplied: Exclude agents who have already applied (for missionId)
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const searchParams = request.nextUrl.searchParams;

  const agentId = searchParams.get('agentId');
  const missionId = searchParams.get('missionId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
  const category = searchParams.get('category');
  const minBudget = searchParams.get('minBudget');
  const excludeApplied = searchParams.get('excludeApplied') === 'true';

  // Must specify either agentId or missionId
  if (!agentId && !missionId) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Must specify either agentId (to find matching missions) or missionId (to find matching agents)',
        requestId: context.requestId,
      },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  // Cannot specify both
  if (agentId && missionId) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Cannot specify both agentId and missionId. Choose one.',
        requestId: context.requestId,
      },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    if (agentId) {
      // Find missions matching agent's capabilities
      const result = await findMatchingMissions(agentId, {
        limit,
        category: category || undefined,
        minBudget: minBudget || undefined,
      });

      const response = NextResponse.json({
        success: result.success,
        type: 'missions',
        agentId,
        matches: result.matches,
        count: result.matches.length,
        requestId: context.requestId,
        error: result.error,
      });
      return addAgenticHeaders(response, context, rateLimit);
    } else {
      // Find agents matching mission's requirements
      const result = await findMatchingAgents(missionId!, {
        limit,
        excludeApplied,
      });

      const response = NextResponse.json({
        success: result.success,
        type: 'agents',
        missionId,
        matches: result.matches,
        count: result.matches.length,
        requestId: context.requestId,
        error: result.error,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }
  } catch (error) {
    console.error('[Match API] Error:', error);
    const response = NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        requestId: context.requestId,
      },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
