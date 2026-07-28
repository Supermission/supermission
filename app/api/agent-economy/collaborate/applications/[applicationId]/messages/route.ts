/**
 * Application Messages API
 * Private negotiation chat between applicant and mission creator
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import {
  getNegotiationParticipants,
  isAuthorizedParticipant,
  getApplicationMessages,
  sendApplicationMessage,
  type MessageType,
} from '@/lib/agent-economy/collaborate/negotiation';
import { triggerWebhook } from '@/lib/agent-economy/webhooks';

interface RouteParams {
  params: Promise<{ applicationId: string }>;
}

/**
 * GET /api/agent-economy/collaborate/applications/[applicationId]/messages
 * List messages for an application negotiation
 *
 * Query params:
 * - limit: Max messages (default 50, max 100)
 * - before: Cursor for pagination (message ID)
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
  const searchParams = request.nextUrl.searchParams;

  // Get participants and verify authorization
  const participants = await getNegotiationParticipants(applicationId);
  if (!participants) {
    const response = NextResponse.json(
      { success: false, error: 'Application not found', requestId: context.requestId },
      { status: 404 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const { authorized } = isAuthorizedParticipant(
    participants,
    context.ownerAddress,
    context.agentId
  );

  if (!authorized) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Only the applicant or mission creator can view negotiation messages',
        requestId: context.requestId,
      },
      { status: 403 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before') || undefined;

    const { messages, hasMore } = await getApplicationMessages(applicationId, { limit, before });

    const response = NextResponse.json({
      success: true,
      messages,
      pagination: {
        hasMore,
        nextCursor: hasMore && messages.length > 0 ? messages[messages.length - 1].id : null,
      },
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Application Messages GET] Error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/collaborate/applications/[applicationId]/messages
 * Send a message in an application negotiation
 *
 * Body:
 * - content: Message text (required, max 5000 chars)
 * - messageType: 'message' | 'offer' (default: 'message')
 * - metadata: Optional metadata object
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
        error: 'Only the applicant or mission creator can send negotiation messages',
        requestId: context.requestId,
      },
      { status: 403 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const { data: body, error: parseError } = await safeParseJson<{
    content: string;
    messageType?: 'message' | 'offer';
    metadata?: Record<string, unknown>;
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body?.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
    const response = NextResponse.json(
      { success: false, error: 'content is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  // Validate messageType
  const validTypes: MessageType[] = ['message', 'offer'];
  const messageType = (body.messageType || 'message') as MessageType;
  if (!validTypes.includes(messageType)) {
    const response = NextResponse.json(
      { success: false, error: `messageType must be one of: ${validTypes.join(', ')}`, requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const result = await sendApplicationMessage(
      applicationId,
      context.ownerAddress,
      context.agentId,
      body.content,
      messageType,
      body.metadata || {}
    );

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Trigger webhook to the other party
    const recipientAgentId = role === 'applicant'
      ? participants.creatorAgentId
      : participants.applicantAgentId;

    if (recipientAgentId) {
      triggerWebhook(recipientAgentId, 'application.message', {
        applicationId,
        missionId: participants.missionId,
        messageType,
        senderAgentId: context.agentId,
        senderAddress: context.ownerAddress,
        senderRole: role,
        preview: body.content.slice(0, 100),
      }).catch(err => console.error('[Webhook] negotiation message trigger failed:', err));
    }

    const response = NextResponse.json({
      success: true,
      message: result.message,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Application Messages POST] Error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
