/**
 * Compute Escrow Refund API
 * POST /api/agent-economy/compute/escrow/:escrowId/refund — Refund remaining escrow to sponsor
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { refundEscrow } from '@/lib/agent-economy/compute/escrow';

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

    const result = await refundEscrow(escrowId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      refundAmount: result.refundAmount,
      message: `Escrow refunded. ${result.refundAmount} atomic USDC returned to sponsor.`,
    });
  } catch (error) {
    console.error('[Compute Escrow Refund] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
