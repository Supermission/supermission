/**
 * Compute Sessions API
 * POST /api/agent-economy/compute/sessions — Create a compute session (auth: write)
 * GET  /api/agent-economy/compute/sessions — List sessions (auth: read)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { createSession, listSessions } from '@/lib/agent-economy/compute/sessions';
import type { SessionFundingModel, ResourceSpec } from '@/lib/agent-economy/compute/types';

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const {
      consumerAgentId,
      providerId,
      model,
      fundingModel,
      resourceSpec,
      maxCostUsdc,
      maxDurationSeconds,
      missionId,
      taskId,
      escrowId,
      metadata,
    } = body;

    // Validate required fields
    if (!consumerAgentId || typeof consumerAgentId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'consumerAgentId is required' },
        { status: 400 }
      );
    }

    // Validate funding model
    const validFunding: SessionFundingModel[] = ['byoc', 'sponsor', 'pool'];
    if (fundingModel && !validFunding.includes(fundingModel)) {
      return NextResponse.json(
        { success: false, error: 'fundingModel must be one of: byoc, sponsor, pool' },
        { status: 400 }
      );
    }

    // Validate maxDurationSeconds
    if (maxDurationSeconds !== undefined) {
      if (typeof maxDurationSeconds !== 'number' || maxDurationSeconds < 10 || maxDurationSeconds > 86400) {
        return NextResponse.json(
          { success: false, error: 'maxDurationSeconds must be between 10 and 86400' },
          { status: 400 }
        );
      }
    }

    // Validate maxCostUsdc
    if (maxCostUsdc !== undefined) {
      try {
        if (BigInt(maxCostUsdc) <= 0n) {
          return NextResponse.json(
            { success: false, error: 'maxCostUsdc must be positive' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: 'maxCostUsdc must be a valid integer string' },
          { status: 400 }
        );
      }
    }

    const result = await createSession({
      consumerAgentId,
      providerId,
      model,
      fundingModel,
      resourceSpec: resourceSpec as ResourceSpec,
      maxCostUsdc,
      maxDurationSeconds,
      missionId,
      taskId,
      escrowId,
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
      session: result.session,
      message: 'Compute session created. Use /sessions/:id/execute to run workloads.',
    });
  } catch (error) {
    console.error('[Compute Sessions POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'read');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const params = request.nextUrl.searchParams;

    const result = await listSessions({
      consumerAgentId: params.get('consumerAgentId') || undefined,
      providerId: params.get('providerId') || undefined,
      missionId: params.get('missionId') || undefined,
      status: params.get('status') || undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
      offset: params.get('offset') ? Number(params.get('offset')) : undefined,
    });

    return NextResponse.json({
      success: true,
      sessions: result.sessions,
      total: result.total,
    });
  } catch (error) {
    console.error('[Compute Sessions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
