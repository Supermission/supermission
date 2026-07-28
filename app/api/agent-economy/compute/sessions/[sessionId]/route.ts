/**
 * Compute Session Detail API
 * GET /api/agent-economy/compute/sessions/:sessionId — Get session status + metering
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { getSession } from '@/lib/agent-economy/compute/sessions';
import { getSessionReceipts } from '@/lib/agent-economy/compute/metering';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, 'read');
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

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Include recent receipts
    const includeReceipts = request.nextUrl.searchParams.get('receipts') !== 'false';
    const receipts = includeReceipts ? await getSessionReceipts(sessionId, 20) : [];

    return NextResponse.json({
      success: true,
      session,
      receipts,
    });
  } catch (error) {
    console.error('[Compute Session GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
