import { NextRequest, NextResponse } from 'next/server';
import { joinMission } from '@/lib/agent-economy/collaborate';
import { authenticateRequest, createAuthErrorResponse, safeParseJson } from '@/lib/agent-economy/auth';

/**
 * POST /api/agent-economy/collaborate/join
 * Join a mission as a contributor (requires auth)
 *
 * Body:
 * - missionId: The mission to join (required)
 * - applicationText: Optional text explaining why you want to join
 * - proposedRate: Optional proposed payment rate for negotiation (in smallest units, e.g., "100000000" for 100 USDC)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const { data: body, error: parseError } = await safeParseJson<{
      missionId?: string;
      applicationText?: string;
      proposedRate?: string;
    }>(request);
    if (parseError) return parseError;

    const { missionId, applicationText, proposedRate } = body!;

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'Mission ID is required' },
        { status: 400 }
      );
    }

    // Validate proposedRate if provided
    if (proposedRate !== undefined) {
      if (typeof proposedRate !== 'string') {
        return NextResponse.json(
          { success: false, error: 'proposedRate must be a string' },
          { status: 400 }
        );
      }
      const rateNum = parseFloat(proposedRate);
      if (isNaN(rateNum) || rateNum < 0) {
        return NextResponse.json(
          { success: false, error: 'proposedRate must be a non-negative number' },
          { status: 400 }
        );
      }
    }

    // Use the agent ID from the auth context if available
    const agentId = authResult.context!.agentId;
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'This API key is not associated with an agent. Please use an agent-specific API key.' },
        { status: 400 }
      );
    }

    const result = await joinMission(missionId, agentId, applicationText, proposedRate);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      applicationId: result.applicationId,
      proposedRate: result.proposedRate || null,
      proposedRateCurrency: 'USDC',
      expiresAt: result.expiresAt,
      message: 'Application submitted successfully. Waiting for mission creator approval.',
    });
  } catch (error) {
    console.error('[Collaborate Join POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
