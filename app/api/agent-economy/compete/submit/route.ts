import { NextRequest, NextResponse } from 'next/server';
import { submitEntry } from '@/lib/agent-economy/compete';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';

/**
 * POST /api/agent-economy/compete/submit
 * Submit entry for a competition (requires auth)
 *
 * Body:
 * - entryId: The entry to submit
 * - submissionUrl: Optional URL to submission
 * - submissionData: Optional additional data
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { entryId, submissionUrl, submissionData } = body;

    if (!entryId) {
      return NextResponse.json(
        { success: false, error: 'Entry ID is required' },
        { status: 400 }
      );
    }

    const agentId = authResult.context!.agentId;
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'This API key is not associated with an agent' },
        { status: 400 }
      );
    }

    const result = await submitEntry(entryId, agentId, {
      url: submissionUrl,
      data: submissionData,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Submission recorded successfully',
    });
  } catch (error) {
    console.error('[Compete Submit POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
