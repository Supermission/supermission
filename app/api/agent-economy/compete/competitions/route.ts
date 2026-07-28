import { NextRequest, NextResponse } from 'next/server';
import {
  createCompetition,
  listCompetitions,
  getCompetition,
  getCompetitionEntries,
} from '@/lib/agent-economy/compete';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { Address } from 'viem';
import { validateAtomicAmount } from '@/lib/agent-economy/utils/validate-amount';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const competitionId = searchParams.get('id');
    const category = searchParams.get('category') || undefined;
    const status = searchParams.get('status') as any;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get single competition with entries
    if (competitionId) {
      const competition = await getCompetition(competitionId);
      if (!competition) {
        return NextResponse.json(
          { success: false, error: 'Competition not found' },
          { status: 404 }
        );
      }

      const entries = await getCompetitionEntries(competitionId);

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
      });
    }

    // List competitions
    const result = await listCompetitions({
      category,
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      competitions: result.competitions.map((c) => ({
        ...c,
        prizePool: c.prizePool.toString(),
        entryFee: c.entryFee.toString(),
        prizes: c.prizes.map((p) => ({
          ...p,
          amount: p.amount.toString(),
        })),
      })),
      total: result.total,
    });
  } catch (error) {
    console.error('[Compete Competitions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const {
      title,
      description,
      category,
      sponsorAddress,
      prizePool,
      prizes,
      rules,
      judgingCriteria,
      entryFee,
      maxEntries,
      startsAt,
      endsAt,
      judgingEndsAt,
    } = body;

    const missingFields: string[] = [];
    if (!title) missingFields.push('title');
    if (!description) missingFields.push('description');
    if (!sponsorAddress) missingFields.push('sponsorAddress');
    if (!prizePool) missingFields.push('prizePool');
    if (!prizes) missingFields.push('prizes');
    if (!startsAt) missingFields.push('startsAt');
    if (!endsAt) missingFields.push('endsAt');
    if (!judgingEndsAt) missingFields.push('judgingEndsAt');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate prize pool — reject scientific notation, enforce bounds
    const prizePoolValidation = validateAtomicAmount(prizePool, 'Prize pool', 1_000_000_000);
    if (!prizePoolValidation.valid) {
      return NextResponse.json(
        { success: false, error: prizePoolValidation.error },
        { status: 400 }
      );
    }

    // Validate prizes array is non-empty
    if (!Array.isArray(prizes) || prizes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Prizes must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate dates
    const now = new Date();
    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(endsAt);
    const judgingEndsAtDate = new Date(judgingEndsAt);

    if (endsAtDate <= now) {
      return NextResponse.json(
        { success: false, error: 'Competition end date must be in the future' },
        { status: 400 }
      );
    }
    if (startsAtDate >= endsAtDate) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before end date' },
        { status: 400 }
      );
    }
    if (judgingEndsAtDate <= endsAtDate) {
      return NextResponse.json(
        { success: false, error: 'Judging end date must be after competition end date' },
        { status: 400 }
      );
    }

    const result = await createCompetition({
      title,
      description,
      category,
      sponsorAddress: sponsorAddress as Address,
      prizePool,
      prizes,
      rules: rules || '',
      judgingCriteria: judgingCriteria || [],
      entryFee,
      maxEntries,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      judgingEndsAt: new Date(judgingEndsAt),
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      competitionId: result.competitionId,
    });
  } catch (error) {
    console.error('[Compete Competitions POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
