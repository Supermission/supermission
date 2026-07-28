/**
 * Application Approval API
 * Mutual approval system for mission applications
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
} from '@/lib/agent-economy/auth';
import {
  getNegotiationParticipants,
  isAuthorizedParticipant,
  toggleApproval,
  getApprovalState,
} from '@/lib/agent-economy/collaborate/negotiation';

interface RouteParams {
  params: Promise<{ applicationId: string }>;
}

/**
 * GET /api/agent-economy/collaborate/applications/[applicationId]/approve
 * Get current approval state for an application
 *
 * Access: Application agent OR mission creator ONLY
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const { applicationId } = await params;

  // Get participants and verify authorization
  const participants = await getNegotiationParticipants(applicationId);
  if (!participants) {
    const response = NextResponse.json(
      { success: false, error: 'Application not found', requestId: context.requestId },
      { status: 404 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const { authorized, role } = isAuthorizedParticipant(
    participants,
    context.ownerAddress,
    context.agentId
  );

  if (!authorized) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Only the applicant or mission creator can view approval state',
        requestId: context.requestId,
      },
      { status: 403 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const approvalState = await getApprovalState(applicationId);

    if (!approvalState) {
      const response = NextResponse.json(
        { success: false, error: 'Application not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      application: approvalState,
      yourRole: role,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Application Approve GET] Error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/collaborate/applications/[applicationId]/approve
 * Toggle approval for an application
 *
 * Body:
 * - approved: boolean (required) - true to approve, false to withdraw approval
 * - agreedRate: string (optional) - the agreed payment rate (in smallest units)
 *
 * When both parties approve with an agreed rate, the application is automatically accepted.
 *
 * Access: Application agent OR mission creator ONLY
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const { applicationId } = await params;

  // Parse body — allow empty body since /approve implies approval
  let body: { approved?: boolean; agreedRate?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — defaults will apply
  }

  // Default to true — hitting /approve implies approval intent
  const approved = body.approved ?? true;

  // Validate agreedRate if provided
  if (body.agreedRate !== undefined) {
    if (typeof body.agreedRate !== 'string') {
      const response = NextResponse.json(
        { success: false, error: 'agreedRate must be a string', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const rateNum = parseFloat(body.agreedRate);
    if (isNaN(rateNum) || rateNum < 0) {
      const response = NextResponse.json(
        { success: false, error: 'agreedRate must be a non-negative number', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }
  }

  try {
    const result = await toggleApproval(
      applicationId,
      context.ownerAddress,
      context.agentId,
      approved,
      body.agreedRate
    );

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      application: result.application,
      fullyAccepted: result.fullyAccepted,
      x402PaymentReady: result.x402PaymentReady,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Application Approve POST] Error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
