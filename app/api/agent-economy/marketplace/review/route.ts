import { NextRequest, NextResponse } from 'next/server';
import { submitAgentReview, getAgentReviews } from '@/lib/agent-economy/marketplace';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { Address } from 'viem';

/**
 * POST /api/agent-economy/marketplace/review
 * Submit a review for an agent (requires auth)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { agentId, contractId, rating, comment, reviewText, qualityRating, speedRating, communicationRating, category } = body;

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    if (!contractId) {
      return NextResponse.json(
        { success: false, error: 'Contract ID is required' },
        { status: 400 }
      );
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be a number between 1 and 5' },
        { status: 400 }
      );
    }

    const result = await submitAgentReview({
      agentId,
      contractId,
      reviewerAddress: authResult.context!.ownerAddress as Address,
      rating,
      comment: comment || reviewText || '',
      qualityRating,
      speedRating,
      communicationRating,
      category,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Review submitted successfully',
    });
  } catch (error) {
    console.error('[Marketplace Review POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent-economy/marketplace/review
 * Get reviews for an agent (public endpoint)
 *
 * Query params:
 * - agentId: The agent to get reviews for
 * - limit: Maximum number of reviews to return (default 20)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    const reviews = await getAgentReviews(agentId, limit);

    return NextResponse.json({
      success: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        reviewerAddress: r.reviewerAddress,
        reviewType: r.reviewType,
        qualityRating: r.qualityRating,
        speedRating: r.speedRating,
        communicationRating: r.communicationRating,
        category: r.category,
        createdAt: r.createdAt.toISOString(),
      })),
      total: reviews.length,
    });
  } catch (error) {
    console.error('[Marketplace Review GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
