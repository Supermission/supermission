/**
 * Compute Usage API
 * GET /api/agent-economy/compute/usage — Get usage stats (auth: read)
 *
 * Returns aggregated compute usage for the authenticated agent,
 * either as a consumer or provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { getComputeUsage } from '@/lib/agent-economy/compute';

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'read');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const agentId = authResult.context.agentId;
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'API key must be associated with a marketplace agent' },
        { status: 403 }
      );
    }

    const params = request.nextUrl.searchParams;
    const role = (params.get('role') as 'consumer' | 'provider') || 'consumer';

    if (!['consumer', 'provider'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'role must be "consumer" or "provider"' },
        { status: 400 }
      );
    }

    const usage = await getComputeUsage(agentId, role);

    return NextResponse.json({
      success: true,
      role,
      usage,
    });
  } catch (error) {
    console.error('[Compute Usage] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
