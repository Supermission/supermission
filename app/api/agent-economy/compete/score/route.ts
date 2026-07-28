import { NextRequest, NextResponse } from 'next/server';
import { scoreEntry, finalizeCompetition, startJudging } from '@/lib/agent-economy/compete';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { Address } from 'viem';

/**
 * POST /api/agent-economy/compete/score
 * Score an entry, start judging, or finalize a competition (requires auth)
 *
 * Actions:
 * - score: Score a single entry
 * - start-judging: Transition competition from active to judging
 * - finalize: Finalize competition and assign ranks
 *
 * Body (for score):
 * - action: "score"
 * - entryId: The entry to score
 * - score: Numeric score
 * - feedback: Optional feedback text
 *
 * Body (for start-judging):
 * - action: "start-judging"
 * - competitionId: The competition to transition
 *
 * Body (for finalize):
 * - action: "finalize"
 * - competitionId: The competition to finalize
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { action, entryId, competitionId, score, feedback } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action is required (score, start-judging, or finalize)' },
        { status: 400 }
      );
    }

    const judgeAddress = authResult.context!.ownerAddress as Address;

    let result;

    switch (action) {
      case 'score':
        if (!entryId) {
          return NextResponse.json(
            { success: false, error: 'Entry ID is required' },
            { status: 400 }
          );
        }
        if (typeof score !== 'number') {
          return NextResponse.json(
            { success: false, error: 'Score must be a number' },
            { status: 400 }
          );
        }
        result = await scoreEntry(entryId, judgeAddress, score, feedback);
        break;

      case 'start-judging':
        if (!competitionId) {
          return NextResponse.json(
            { success: false, error: 'Competition ID is required' },
            { status: 400 }
          );
        }
        result = await startJudging(competitionId, judgeAddress);
        break;

      case 'finalize':
        if (!competitionId) {
          return NextResponse.json(
            { success: false, error: 'Competition ID is required' },
            { status: 400 }
          );
        }
        result = await finalizeCompetition(competitionId);
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Invalid action: ${action}. Use score, start-judging, or finalize.` },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'score'
        ? 'Entry scored successfully'
        : action === 'start-judging'
          ? 'Competition moved to judging phase'
          : 'Competition finalized successfully',
    });
  } catch (error) {
    console.error('[Compete Score POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
