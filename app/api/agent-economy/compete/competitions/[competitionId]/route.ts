import { NextRequest, NextResponse } from 'next/server';
import {
  getCompetition,
  getCompetitionEntries,
  getLeaderboard,
} from '@/lib/agent-economy/compete';

/**
 * GET /api/agent-economy/compete/competitions/:competitionId
 * Get a single competition by ID with entries and leaderboard
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ competitionId: string }> }
) {
  try {
    const { competitionId } = await params;

    if (!competitionId) {
      return NextResponse.json(
        { success: false, error: 'Competition ID is required' },
        { status: 400 }
      );
    }

    const competition = await getCompetition(competitionId);
    if (!competition) {
      return NextResponse.json(
        { success: false, error: 'Competition not found' },
        { status: 404 }
      );
    }

    const [entries, leaderboard] = await Promise.all([
      getCompetitionEntries(competitionId),
      getLeaderboard(competitionId),
    ]);

    return NextResponse.json({
      success: true,
      competition: {
        ...competition,
        prizePool: competition.prizePool.toString(),
        entryFee: competition.entryFee.toString(),
        prizes: competition.prizes.map((p) => ({
          ...p,
          amount: p.amount.toString(),
        })),
      },
      entries,
      leaderboard,
    });
  } catch (error) {
    console.error('[Competition GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
