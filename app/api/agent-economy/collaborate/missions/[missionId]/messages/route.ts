/**
 * Mission Messages API
 * Enables team communication within missions
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import { sanitizeInput } from '@/lib/agent-economy/utils/sanitize';


interface RouteParams {
  params: Promise<{ missionId: string }>;
}

interface Message {
  id: string;
  missionId: string;
  senderAgentId: string | null;
  senderAddress: string;
  senderName?: string;
  messageType: 'message' | 'system' | 'announcement' | 'deliverable';
  content: string;
  replyToId: string | null;
  mentions: string[];
  attachments: unknown[];
  createdAt: string;
  editedAt: string | null;
}

/**
 * Check if address is a mission participant (creator or accepted team member)
 */
async function isMissionParticipant(
  missionId: string,
  address: string,
  agentId: string | null
): Promise<boolean> {
  // Check if creator
  const { data: mission } = await supabaseAdmin
    .from('collaborate_missions')
    .select('creator_address')
    .eq('id', missionId)
    .single();

  if (mission && mission.creator_address.toLowerCase() === address.toLowerCase()) {
    return true;
  }

  // Check if accepted team member
  if (agentId) {
    const { data: application } = await supabaseAdmin
      .from('collaborate_applications')
      .select('id')
      .eq('mission_id', missionId)
      .eq('agent_id', agentId)
      .eq('status', 'accepted')
      .single();

    if (application) {
      return true;
    }
  }

  return false;
}

/**
 * GET /api/agent-economy/collaborate/missions/[missionId]/messages
 * List messages for a mission
 *
 * Query params:
 * - limit: Max messages (default 50, max 100)
 * - offset: Pagination offset
 * - before: Get messages before this timestamp
 * - after: Get messages after this timestamp
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const { missionId } = await params;
  const searchParams = request.nextUrl.searchParams;

  // Check participant access
  const isParticipant = await isMissionParticipant(
    missionId,
    context.ownerAddress,
    context.agentId
  );

  if (!isParticipant) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'You must be a mission participant to view messages',
        requestId: context.requestId,
      },
      { status: 403 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const before = searchParams.get('before');
    const after = searchParams.get('after');

    let query = supabaseAdmin
      .from('mission_messages')
      .select(`
        *,
        marketplace_agents!mission_messages_sender_agent_id_fkey(agent_name)
      `, { count: 'exact' })
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false });

    if (before) {
      query = query.lt('created_at', before);
    }
    if (after) {
      query = query.gt('created_at', after);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Messages API] Query error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to fetch messages', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const messages: Message[] = (data || []).map((msg) => ({
      id: msg.id,
      missionId: msg.mission_id,
      senderAgentId: msg.sender_agent_id,
      senderAddress: msg.sender_address ?? '',
      senderName: msg.marketplace_agents?.agent_name,
      messageType: (msg.message_type as Message['messageType']) ?? 'message',
      content: msg.content,
      replyToId: msg.reply_to_id,
      mentions: (msg.mentions as string[]) || [],
      attachments: (msg.attachments as unknown[]) || [],
      createdAt: msg.created_at ?? '',
      editedAt: msg.edited_at,
    }));

    const response = NextResponse.json({
      success: true,
      messages,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Messages API] GET error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/collaborate/missions/[missionId]/messages
 * Send a message to the mission team
 *
 * Body:
 * - content: Message text (required)
 * - messageType: 'message' | 'announcement' | 'deliverable' (default: 'message')
 * - replyToId: UUID of message to reply to (optional)
 * - mentions: Array of agent IDs to mention (optional)
 * - attachments: Array of attachment objects (optional)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const { missionId } = await params;

  // Check participant access
  const isParticipant = await isMissionParticipant(
    missionId,
    context.ownerAddress,
    context.agentId
  );

  if (!isParticipant) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'You must be a mission participant to send messages',
        requestId: context.requestId,
      },
      { status: 403 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const { data: body, error: parseError } = await safeParseJson<{
    content: string;
    messageType?: 'message' | 'announcement' | 'deliverable';
    replyToId?: string;
    mentions?: string[];
    attachments?: unknown[];
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

  // Validate content length
  if (body.content.length > 5000) {
    const response = NextResponse.json(
      { success: false, error: 'content must be 5000 characters or less', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  // Validate messageType
  const validTypes = ['message', 'announcement', 'deliverable'];
  if (body.messageType && !validTypes.includes(body.messageType)) {
    const response = NextResponse.json(
      { success: false, error: `messageType must be one of: ${validTypes.join(', ')}`, requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  // Validate replyToId if provided
  if (body.replyToId) {
    const { data: replyMsg } = await supabaseAdmin
      .from('mission_messages')
      .select('id')
      .eq('id', body.replyToId)
      .eq('mission_id', missionId)
      .single();

    if (!replyMsg) {
      const response = NextResponse.json(
        { success: false, error: 'replyToId does not exist in this mission', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }
  }

  try {
    // Sanitize HTML entities for safety
    const sanitizedContent = sanitizeInput(body.content.trim());

    const { data, error } = await supabaseAdmin
      .from('mission_messages')
      .insert({
        mission_id: missionId,
        sender_agent_id: context.agentId,
        sender_address: context.ownerAddress,
        message_type: body.messageType || 'message',
        content: sanitizedContent,
        reply_to_id: body.replyToId || null,
        mentions: body.mentions || [],
        attachments: body.attachments || [],
      } as any)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Messages API] Insert error:', error);
      const response = NextResponse.json(
        { success: false, error: 'Failed to send message', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const message: Message = {
      id: data.id,
      missionId: data.mission_id,
      senderAgentId: data.sender_agent_id,
      senderAddress: data.sender_address ?? '',
      messageType: (data.message_type as Message['messageType']) ?? 'message',
      content: data.content,
      replyToId: data.reply_to_id,
      mentions: (data.mentions as string[]) || [],
      attachments: (data.attachments as unknown[]) || [],
      createdAt: data.created_at ?? '',
      editedAt: data.edited_at,
    };

    const response = NextResponse.json({
      success: true,
      message,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Messages API] POST error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
