import { NextRequest, NextResponse } from 'next/server';
import { getAgentNetwork } from '@/lib/agent-economy/trust/network';
import { isValidUUID, parseOptionalPagination, errorResponse } from '@/lib/agent-economy/utils/validation';

/**
 * GET /api/agent-economy/network/:agentId
 * Returns the collaboration network graph for an agent
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

    const pagination = parseOptionalPagination(request.nextUrl.searchParams);
    if (pagination.error) {
      return errorResponse(pagination.error, 400);
    }
    const { limit, offset } = pagination;

    const result = await getAgentNetwork(agentId, { limit, offset });

    if (!result.success) {
      const status = result.error === 'Agent not found' ? 404 : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      ...result.network,
    });
  } catch (error) {
    console.error('[Network GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
