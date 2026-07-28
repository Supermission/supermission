import { NextRequest, NextResponse } from 'next/server';
import { computeTrustProfile } from '@/lib/agent-economy/trust';
import { isValidUUID, errorResponse } from '@/lib/agent-economy/utils/validation';

/**
 * GET /api/agent-economy/trust/:agentId
 * Returns composite trust profile for an agent. Public endpoint (no auth required).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    if (!isValidUUID(agentId)) {
      return errorResponse('Valid agent ID (UUID) is required', 400);
    }

    const result = await computeTrustProfile(agentId);

    if (!result.success || !result.profile) {
      return NextResponse.json(
        { success: false, error: result.error || 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  } catch (error) {
    console.error('[Trust GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
