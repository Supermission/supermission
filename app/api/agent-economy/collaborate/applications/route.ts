import { NextRequest, NextResponse } from 'next/server';
import { getMissionApplications, getMission, acceptApplication, rejectApplication } from '@/lib/agent-economy/collaborate';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';

/**
 * GET /api/agent-economy/collaborate/applications
 * Get applications for a mission.
 *
 * - Mission creator (authenticated) sees all applications with full details.
 * - Authenticated agent sees only their own application(s).
 * - Unauthenticated callers see all applications but without rate fields.
 *
 * Query params:
 * - missionId: The mission to get applications for
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const missionId = searchParams.get('missionId');

    if (!missionId) {
      return NextResponse.json(
        { success: false, error: 'Mission ID is required' },
        { status: 400 }
      );
    }

    // Attempt optional auth to determine caller's identity
    const authResult = await authenticateRequest(request, 'read');
    const callerAgentId = authResult.success ? authResult.context?.agentId ?? null : null;
    const callerAddress = authResult.success ? authResult.context?.ownerAddress ?? null : null;

    let applications = await getMissionApplications(missionId);

    // Check if caller is the mission creator — they see ALL applications
    let isCreator = false;
    if (callerAddress) {
      const mission = await getMission(missionId);
      if (mission && mission.clientAddress.toLowerCase() === callerAddress.toLowerCase()) {
        isCreator = true;
      }
    }

    // Non-creator authenticated agents see only their own applications
    if (authResult.success && callerAgentId && !isCreator) {
      applications = applications.filter((app) => app.agentId === callerAgentId);
    }

    // Determine whether to expose rate/negotiation fields
    // Unauthenticated callers don't see proposed/agreed rates
    const isAuthenticated = authResult.success;

    return NextResponse.json({
      success: true,
      applications: applications.map((app) => ({
        id: app.id,
        agentId: app.agentId,
        agentName: app.agentName,
        applicationText: app.applicationText,
        status: app.status,
        appliedAt: app.appliedAt.toISOString(),
        agentApproved: app.agentApproved,
        creatorApproved: app.creatorApproved,
        proposedRate: isAuthenticated ? app.proposedRate : undefined,
        agreedRate: isAuthenticated ? app.agreedRate : undefined,
        agreedRateCurrency: isAuthenticated ? app.agreedRateCurrency : undefined,
        expiresAt: app.expiresAt?.toISOString() || null,
        reputation: app.reputation,
      })),
      total: applications.length,
    });
  } catch (error) {
    console.error('[Collaborate Applications GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-economy/collaborate/applications
 * Accept an application (requires auth - mission creator only)
 *
 * Body:
 * - applicationId: The application to accept
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { applicationId, action, agreedRate } = body;

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Application ID is required' },
        { status: 400 }
      );
    }

    // Route based on action — default to 'accept' for backward compat (B2)
    const effectiveAction = action || 'accept';

    let result;
    if (effectiveAction === 'reject') {
      result = await rejectApplication(
        applicationId,
        authResult.context!.ownerAddress
      );
    } else if (effectiveAction === 'accept') {
      result = await acceptApplication(
        applicationId,
        authResult.context!.ownerAddress,
        agreedRate
      );
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${effectiveAction}. Use accept or reject.` },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Application ${effectiveAction}ed successfully`,
      ...('agreedRate' in result ? { agreedRate: result.agreedRate } : {}),
    });
  } catch (error) {
    console.error('[Collaborate Applications POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
