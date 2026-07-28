/**
 * Disputes API
 * File and manage disputes for conflict resolution
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import {
  fileDispute,
  getDispute,
  listDisputes,
  addDisputeComment,
  getDisputeComments,
  type DisputeType,
  type DisputeStatus,
} from '@/lib/agent-economy/disputes';

/**
 * GET /api/agent-economy/disputes
 * List disputes or get a specific dispute
 *
 * Query params:
 * - disputeId: Get specific dispute with comments
 * - agentId: Filter by agent involvement
 * - status: Filter by status (open, under_review, resolved, dismissed)
 * - taskId: Filter by task
 * - contractId: Filter by contract
 * - limit/offset: Pagination
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const searchParams = request.nextUrl.searchParams;

  const disputeId = searchParams.get('disputeId');

  try {
    if (disputeId) {
      // Get specific dispute with comments
      const dispute = await getDispute(disputeId);

      if (!dispute) {
        const response = NextResponse.json(
          { success: false, error: 'Dispute not found', requestId: context.requestId },
          { status: 404 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      // Verify access (must be involved or public)
      const isInvolved =
        dispute.filedByAddress.toLowerCase() === context.ownerAddress.toLowerCase() ||
        dispute.filedAgainstAddress.toLowerCase() === context.ownerAddress.toLowerCase() ||
        dispute.filedByAgentId === context.agentId ||
        dispute.filedAgainstAgentId === context.agentId;

      if (!isInvolved) {
        const response = NextResponse.json(
          { success: false, error: 'Not authorized to view this dispute', requestId: context.requestId },
          { status: 403 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      const comments = await getDisputeComments(disputeId);

      const response = NextResponse.json({
        success: true,
        dispute,
        comments,
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    // List disputes
    const agentId = searchParams.get('agentId') || context.agentId;
    const status = searchParams.get('status') as DisputeStatus | null;
    const taskId = searchParams.get('taskId');
    const contractId = searchParams.get('contractId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = await listDisputes({
      agentId: agentId || undefined,
      address: context.ownerAddress,
      status: status || undefined,
      taskId: taskId || undefined,
      contractId: contractId || undefined,
      limit,
      offset,
    });

    const response = NextResponse.json({
      success: true,
      disputes: result.disputes,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.total > offset + limit,
      },
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Disputes API] GET error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/disputes
 * File a new dispute or add a comment
 *
 * Body for new dispute:
 * - taskId or contractId: What to dispute
 * - filedAgainstAddress: Who is being disputed
 * - filedAgainstAgentId: (optional) Agent ID if applicable
 * - disputeType: task_rejection, payment, quality, communication, deadline, other
 * - claim: Description of the dispute
 * - evidence: (optional) Array of evidence objects
 *
 * Body for comment (if disputeId provided):
 * - disputeId: Dispute to comment on
 * - content: Comment text
 * - commentType: (optional) comment, evidence
 * - attachments: (optional) Array of attachment objects
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    // For filing dispute
    taskId?: string;
    contractId?: string;
    filedAgainstAddress?: string;
    filedAgainstAgentId?: string;
    disputeType?: DisputeType;
    claim?: string;
    evidence?: unknown[];
    // For adding comment
    disputeId?: string;
    content?: string;
    commentType?: 'comment' | 'evidence';
    attachments?: unknown[];
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body) {
    const response = NextResponse.json(
      { success: false, error: 'Request body is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Add comment to existing dispute
    if (body.disputeId && body.content) {
      const result = await addDisputeComment(body.disputeId, {
        authorAddress: context.ownerAddress,
        authorAgentId: context.agentId || undefined,
        commentType: body.commentType,
        content: body.content,
        attachments: body.attachments,
      });

      if (!result.success) {
        const response = NextResponse.json(
          { success: false, error: result.error, requestId: context.requestId },
          { status: 400 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      const response = NextResponse.json({
        success: true,
        comment: result.comment,
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    // File new dispute
    if (!body.taskId && !body.contractId) {
      const response = NextResponse.json(
        { success: false, error: 'taskId or contractId is required', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (!body.filedAgainstAddress) {
      const response = NextResponse.json(
        { success: false, error: 'filedAgainstAddress is required', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (!body.disputeType) {
      const response = NextResponse.json(
        { success: false, error: 'disputeType is required', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (!body.claim) {
      const response = NextResponse.json(
        { success: false, error: 'claim is required', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const validTypes: DisputeType[] = ['task_rejection', 'payment', 'quality', 'communication', 'deadline', 'other'];
    if (!validTypes.includes(body.disputeType)) {
      const response = NextResponse.json(
        { success: false, error: `disputeType must be one of: ${validTypes.join(', ')}`, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const result = await fileDispute({
      taskId: body.taskId,
      contractId: body.contractId,
      filedByAddress: context.ownerAddress,
      filedByAgentId: context.agentId || undefined,
      filedAgainstAddress: body.filedAgainstAddress,
      filedAgainstAgentId: body.filedAgainstAgentId,
      disputeType: body.disputeType,
      claim: body.claim,
      evidence: body.evidence,
    });

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      dispute: result.dispute,
      message: 'Dispute filed successfully. You will be notified of updates.',
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Disputes API] POST error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
