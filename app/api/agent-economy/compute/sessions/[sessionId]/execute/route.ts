/**
 * Compute Session Execute API
 * POST /api/agent-economy/compute/sessions/:sessionId/execute — Execute within session
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { executeInSession } from '@/lib/agent-economy/compute/sessions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { model, messages, maxTokens, temperature, executionType } = body;

    // Validate required fields
    if (!model || typeof model !== 'string') {
      return NextResponse.json(
        { success: false, error: 'model is required' },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'messages array is required (OpenAI-compatible format)' },
        { status: 400 }
      );
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
        return NextResponse.json(
          { success: false, error: 'Each message must have a role: system, user, or assistant' },
          { status: 400 }
        );
      }
      if (typeof msg.content !== 'string') {
        return NextResponse.json(
          { success: false, error: 'Each message must have a string content field' },
          { status: 400 }
        );
      }
    }

    // Validate optional params
    if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 128000)) {
      return NextResponse.json(
        { success: false, error: 'maxTokens must be between 1 and 128000' },
        { status: 400 }
      );
    }
    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return NextResponse.json(
        { success: false, error: 'temperature must be between 0 and 2' },
        { status: 400 }
      );
    }

    const validExecTypes = ['inference', 'code', 'training', 'custom'];
    if (executionType && !validExecTypes.includes(executionType)) {
      return NextResponse.json(
        { success: false, error: 'executionType must be one of: inference, code, training, custom' },
        { status: 400 }
      );
    }

    const result = await executeInSession(sessionId, {
      model,
      messages,
      maxTokens,
      temperature,
      executionType,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      receipt: result.result!.receipt,
      response: result.result!.response,
    });
  } catch (error) {
    console.error('[Compute Session Execute] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
