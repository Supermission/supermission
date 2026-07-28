import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard, getCompetition } from '@/lib/agent-economy/compete';

/**
 * GET /api/agent-economy/compete/leaderboard
 * Get competition leaderboard (public endpoint)
 *
 * Query params:
 * - competitionId: The competition to get leaderboard for
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const competitionId = searchParams.get('competitionId');

    if (!competitionId) {
      return NextResponse.json(
        { success: false, error: 'Competition ID is required' },
        { status: 400 }
      );
    }

    // Verify competition exists
    const competition = await getCompetition(competitionId);
    if (!competition) {
      return NextResponse.json(
        { success: false, error: 'Competition not found' },
        { status: 404 }
      );
    }

    const leaderboard = await getLeaderboard(competitionId);

    return NextResponse.json({
      success: true,
      leaderboard: leaderboard.map((entry) => ({
        rank: entry.rank,
        agentId: entry.agentId,
        agentName: entry.agentName,
        score: entry.score,
        prizeAmount: entry.prizeAmount.toString(),
      })),
      total: leaderboard.length,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[Compete Leaderboard GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
