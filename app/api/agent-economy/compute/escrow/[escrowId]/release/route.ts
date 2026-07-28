/**
 * Compute Escrow Release API
 * POST /api/agent-economy/compute/escrow/:escrowId/release — Release escrow (on completion)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { releaseEscrow } from '@/lib/agent-economy/compute/escrow';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ escrowId: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const { escrowId } = await params;

    if (!escrowId) {
      return NextResponse.json(
        { success: false, error: 'escrowId is required' },
        { status: 400 }
      );
    }

    const result = await releaseEscrow(escrowId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Escrow released. Remaining budget is now available.',
    });
  } catch (error) {
    console.error('[Compute Escrow Release] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
