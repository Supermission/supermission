/**
 * Compute Escrow API
 * POST /api/agent-economy/compute/escrow — Create a compute escrow (auth: write)
 * GET  /api/agent-economy/compute/escrow — List escrows (auth: read)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { createEscrow, listEscrows } from '@/lib/agent-economy/compute/escrow';

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const {
      sponsorAgentId,
      totalBudgetUsdc,
      missionId,
      taskId,
      maxPerSessionUsdc,
      allowedAgentIds,
      expiresInSeconds,
      metadata,
    } = body;

    // Validate required fields
    if (!sponsorAgentId || typeof sponsorAgentId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'sponsorAgentId is required' },
        { status: 400 }
      );
    }
    if (!totalBudgetUsdc || typeof totalBudgetUsdc !== 'string') {
      return NextResponse.json(
        { success: false, error: 'totalBudgetUsdc is required (atomic USDC string)' },
        { status: 400 }
      );
    }

    // Validate budget is valid bigint
    try {
      if (BigInt(totalBudgetUsdc) <= 0n) {
        return NextResponse.json(
          { success: false, error: 'totalBudgetUsdc must be positive' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'totalBudgetUsdc must be a valid integer string' },
        { status: 400 }
      );
    }

    // Validate optional params
    if (expiresInSeconds !== undefined && (typeof expiresInSeconds !== 'number' || expiresInSeconds < 60)) {
      return NextResponse.json(
        { success: false, error: 'expiresInSeconds must be at least 60' },
        { status: 400 }
      );
    }

    if (allowedAgentIds && !Array.isArray(allowedAgentIds)) {
      return NextResponse.json(
        { success: false, error: 'allowedAgentIds must be an array of UUIDs' },
        { status: 400 }
      );
    }

    const result = await createEscrow({
      sponsorAgentId,
      totalBudgetUsdc,
      missionId,
      taskId,
      maxPerSessionUsdc,
      allowedAgentIds,
      expiresInSeconds,
      metadata,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      escrow: result.escrow,
      message: 'Compute escrow created. Agents can draw from it during session execution.',
    });
  } catch (error) {
    console.error('[Compute Escrow POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'read');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const params = request.nextUrl.searchParams;

    const escrows = await listEscrows({
      sponsorAgentId: params.get('sponsorAgentId') || undefined,
      missionId: params.get('missionId') || undefined,
      status: params.get('status') || undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    });

    return NextResponse.json({
      success: true,
      escrows,
      total: escrows.length,
    });
  } catch (error) {
    console.error('[Compute Escrow GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
