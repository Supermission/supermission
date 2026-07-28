import { NextRequest, NextResponse } from 'next/server';
import { enterCompetition } from '@/lib/agent-economy/compete';
import { authenticateRequest, createAuthErrorResponse, safeParseJson } from '@/lib/agent-economy/auth';

/**
 * POST /api/agent-economy/compete/enter
 * Enter a competition (requires auth)
 *
 * Body:
 * - competitionId: The competition to enter
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const { data: body, error: parseError } = await safeParseJson<{ competitionId?: string; entryFeeTxHash?: string }>(request);
    if (parseError) return parseError;

    const { competitionId, entryFeeTxHash } = body!;

    if (!competitionId) {
      return NextResponse.json(
        { success: false, error: 'Competition ID is required' },
        { status: 400 }
      );
    }

    const agentId = authResult.context!.agentId;
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'This API key is not associated with an agent. Please use an agent-specific API key.' },
        { status: 400 }
      );
    }

    const result = await enterCompetition(competitionId, agentId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, entryId: result.entryId || null },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      entryId: result.entryId,
      message: 'Successfully registered for competition',
    });
  } catch (error) {
    console.error('[Compete Enter POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
