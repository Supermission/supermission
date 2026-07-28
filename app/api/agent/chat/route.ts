/**
 * AI Agent Chat Endpoint (FREE - No Payment Required)
 * Streams status updates via SSE, then sends the final result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { z } from 'zod';
import { createSession, getSession } from '@/lib/supabase/chat';
import { processAIRequest } from '@/lib/ai/process-ai-request';
import { hydrateState } from '@/lib/ai/agent-memory';
import { summarizeSessionIfNeeded } from '@/lib/ai/session-memory';

export interface ConversationState {
  messages: ChatMessage[];
  toolResults: Record<string, any>;
  sessionId?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  metadata?: Record<string, any>;
}

type ChatRole = 'user' | 'assistant' | 'system';

// Attachment schema for image/document uploads
const attachmentSchema = z.object({
  type: z.enum(['image', 'document']),
  name: z.string(),
  mimeType: z.string(),
  data: z.string(), // base64
  size: z.number(),
});

// Strict schema for conversation state
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(10000, 'Message content too long'),
  metadata: z.record(z.string(), z.any()).optional(),
});

const conversationStateSchema = z.object({
  messages: z.array(chatMessageSchema).max(50, 'Too many messages').default([]),
  toolResults: z.record(z.string(), z.any()).default({}),
  sessionId: z.string().optional(),
}).default({ messages: [], toolResults: {} });

const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
  agentId: z.string().optional().default('supermission-agent'),
  sessionId: z.string().optional(),
  walletAddress: z.string().nullable().optional(),
  conversationState: conversationStateSchema,
  selectedAgentId: z.string().nullable().optional(),
  selectedModelId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

/** Encode a single SSE event */
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = chatRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      return NextResponse.json(
        { error: 'Invalid request data', details: errors },
        { status: 400 }
      );
    }

    const { message, agentId, sessionId, walletAddress, conversationState, selectedAgentId, selectedModelId, attachments } = validationResult.data;

    let sessionIdToUse = sessionId;
    if (!sessionIdToUse) {
      sessionIdToUse = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (walletAddress && isAddress(walletAddress)) {
        try {
          await createSession({
            session_id: sessionIdToUse,
            user_address: walletAddress,
            agent_id: agentId,
          });
        } catch (dbError) {
          console.warn('[Agent Chat] Failed to create session in DB (non-critical):', dbError);
        }
      }
    }

    const state = hydrateState(conversationState);
    state.sessionId = sessionIdToUse;

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (chunk: string) => {
          try { controller.enqueue(encoder.encode(chunk)); } catch { /* stream closed */ }
        };

        // Status callback — emits pipeline stage updates
        const onStatus = (stage: string) => {
          enqueue(sseEvent('status', { stage }));
        };

        // Text callback — streams LLM-generated text chunks to the client in real-time.
        // WHY: For direct answers (no agent call), the user sees text appearing immediately
        // as the LLM generates it, instead of waiting for the full response. This cuts
        // perceived latency from ~2-4s to near-instant for conversational responses.
        const onText = (chunk: string) => {
          enqueue(sseEvent('text', { chunk }));
        };

        try {
          const aiResponse = await processAIRequest(
            message, state, walletAddress ?? undefined, selectedAgentId, selectedModelId, attachments, onStatus, onText
          );

          state.messages.push({ role: 'assistant', content: aiResponse });

          // Send final result
          enqueue(sseEvent('result', {
            message: aiResponse,
            sessionId: sessionIdToUse,
            conversationState: state,
            free: true,
          }));

          // Fire-and-forget: summarize session for cross-session memory
          // Runs after every message but only generates a summary when >= 4 messages exist
          if (sessionIdToUse) {
            summarizeSessionIfNeeded(sessionIdToUse).catch(() => {});
          }
        } catch (aiError) {
          console.error('[Agent Chat] AI service error:', aiError);
          enqueue(sseEvent('error', { error: 'AI service temporarily unavailable' }));
        }

        enqueue(sseEvent('done', {}));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get session info
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  const session = await getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.session_id,
    agentId: session.agent_id,
    userAddress: session.user_address,
    free: true,
  });
}
