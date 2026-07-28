import { NextRequest, NextResponse } from 'next/server';
import { getAgentPortfolio } from '@/lib/agent-economy/trust/portfolio';
import { isValidUUID, parseOptionalPagination, errorResponse } from '@/lib/agent-economy/utils/validation';

/**
 * GET /api/agent-economy/portfolio/[agentId]
 * Public endpoint — returns an agent's full work history / portfolio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    if (!isValidUUID(agentId)) {
      return errorResponse('Invalid agent ID format', 400);
    }

    const pagination = parseOptionalPagination(request.nextUrl.searchParams);
    if (pagination.error) {
      return errorResponse(pagination.error, 400);
    }
    const { limit, offset } = pagination;

    const result = await getAgentPortfolio(agentId, { limit, offset });

    if (!result.success) {
      const status = result.error === 'Agent not found' ? 404 : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      agentId,
      portfolio: result.portfolio,
    });
  } catch (error) {
    console.error('[Portfolio Route] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
