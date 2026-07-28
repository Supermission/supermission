/**
 * Compute Escrow Detail API
 * GET /api/agent-economy/compute/escrow/:escrowId — Get escrow details + draws
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { getEscrow, getSessionDraws } from '@/lib/agent-economy/compute/escrow';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ escrowId: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, 'read');
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

    const escrow = await getEscrow(escrowId);
    if (!escrow) {
      return NextResponse.json(
        { success: false, error: 'Escrow not found' },
        { status: 404 }
      );
    }

    // Get draws for this escrow (across all sessions)
    // We query escrow_draws directly since getSessionDraws filters by session
    const { data: draws } = await supabaseAdmin
      .from('escrow_draws')
      .select('*')
      .eq('escrow_id', escrowId)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      escrow,
      draws: (draws || []).map((d: Record<string, unknown>) => ({
        id: d.id,
        sessionId: d.session_id,
        agentId: d.agent_id,
        amountUsdc: d.amount_usdc,
        receiptId: d.receipt_id,
        description: d.description,
        createdAt: d.created_at,
      })),
    });
  } catch (error) {
    console.error('[Compute Escrow Detail GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
