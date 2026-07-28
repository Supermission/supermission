/**
 * Compute Session Close API
 * POST /api/agent-economy/compute/sessions/:sessionId/close — Close session + settle
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { closeSession } from '@/lib/agent-economy/compute/sessions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Optional: settle=false to skip payment settlement
    const body = await request.json().catch(() => ({}));
    const settle = body.settle !== false;

    const result = await closeSession(sessionId, { settle });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      session: result.session,
      message: 'Session closed and settled.',
    });
  } catch (error) {
    console.error('[Compute Session Close] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
