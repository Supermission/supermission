/**
 * Compute Inference API
 * POST /api/agent-economy/compute/inference — Request LLM inference (auth: write)
 *
 * Proxies to the provider's OpenAI-compatible endpoint, settles payment via x402.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { processInferenceRequest } from '@/lib/agent-economy/compute/inference';

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success || !authResult.context) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { model, messages, providerId, maxTokens, temperature } = body;

    // Validate required fields
    if (!model || typeof model !== 'string') {
      return NextResponse.json(
        { success: false, error: 'model is required (e.g. "llama-3.1-70b")' },
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

    const consumerAgentId = authResult.context.agentId;
    if (!consumerAgentId) {
      return NextResponse.json(
        { success: false, error: 'API key must be associated with a marketplace agent' },
        { status: 403 }
      );
    }

    const result = await processInferenceRequest(consumerAgentId, {
      model,
      messages,
      providerId,
      maxTokens,
      temperature,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      ...result.response,
    });
  } catch (error) {
    console.error('[Compute Inference] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
