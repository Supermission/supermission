/**
 * Negotiation Worker
 *
 * Real-time WebSocket communication for application negotiations
 * Uses Durable Objects with WebSocket Hibernation for efficient scaling
 */

import { createSupabaseClient, verifyInternalSignature } from '@supermission/cf-shared';
import { NegotiationRoom } from './durable-object';
import { verifyAuthToken } from './auth';

export { NegotiationRoom };

export interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;

  // Auth
  INTERNAL_SECRET: string;
  JWT_SECRET: string;

  // Durable Objects
  NEGOTIATION_ROOM: DurableObjectNamespace;

  // Config
  ENVIRONMENT: string;
}

export default {
  /**
   * HTTP handler - routes to Durable Object or handles health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // WebSocket connection: /ws/:applicationId
    if (url.pathname.startsWith('/ws/')) {
      const applicationId = url.pathname.split('/ws/')[1];
      if (!applicationId) {
        return new Response('Application ID required', { status: 400 });
      }

      // Get the Durable Object for this application
      const id = env.NEGOTIATION_ROOM.idFromName(applicationId);
      const stub = env.NEGOTIATION_ROOM.get(id);

      // Forward the request to the Durable Object
      return stub.fetch(request);
    }

    // REST API: Get room info
    if (url.pathname.startsWith('/room/') && request.method === 'GET') {
      const applicationId = url.pathname.split('/room/')[1];
      if (!applicationId) {
        return new Response('Application ID required', { status: 400 });
      }

      return handleRoomInfo(applicationId, env);
    }

    // REST API: Send message (HTTP fallback)
    if (url.pathname === '/message' && request.method === 'POST') {
      return handleHttpMessage(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Get room information (participants, connection count)
 */
async function handleRoomInfo(applicationId: string, env: Env): Promise<Response> {
  const supabase = createSupabaseClient(env);

  // Get participants from database
  const { data: application, error } = await supabase
    .from('collaborate_applications')
    .select(`
      id,
      mission_id,
      agent_id,
      marketplace_agents!inner(wallet_address, name),
      collaborate_missions!inner(creator_address)
    `)
    .eq('id', applicationId)
    .single();

  if (error || !application) {
    return new Response(JSON.stringify({ error: 'Application not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get connected count from Durable Object
  const id = env.NEGOTIATION_ROOM.idFromName(applicationId);
  const stub = env.NEGOTIATION_ROOM.get(id);

  const countResponse = await stub.fetch(new Request('http://internal/count'));
  const { count } = await countResponse.json() as { count: number };

  return new Response(JSON.stringify({
    applicationId,
    missionId: application.mission_id,
    participants: {
      applicantAgentId: application.agent_id,
      applicantAddress: (application.marketplace_agents as { wallet_address: string }).wallet_address,
      creatorAddress: (application.collaborate_missions as { creator_address: string }).creator_address,
    },
    connectedCount: count,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * HTTP fallback for sending messages (for clients that can't use WebSocket)
 */
async function handleHttpMessage(request: Request, env: Env): Promise<Response> {
  // Verify authentication
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);

  // Check if it's an internal call or user token
  let callerAddress: string;
  let callerAgentId: string | null = null;

  if (token === env.INTERNAL_SECRET) {
    // Internal call - trust the body
    const body = await request.json() as {
      applicationId: string;
      senderAddress: string;
      senderAgentId?: string;
      content: string;
      messageType?: string;
      metadata?: Record<string, unknown>;
    };

    callerAddress = body.senderAddress;
    callerAgentId = body.senderAgentId || null;

    return processMessage(body.applicationId, callerAddress, callerAgentId, body.content, body.messageType || 'message', body.metadata || {}, env);
  }

  // Verify user JWT
  const tokenData = await verifyAuthToken(token, env);
  if (!tokenData) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  callerAddress = tokenData.address;
  callerAgentId = tokenData.agentId || null;

  const body = await request.json() as {
    applicationId: string;
    content: string;
    messageType?: string;
    metadata?: Record<string, unknown>;
  };

  return processMessage(body.applicationId, callerAddress, callerAgentId, body.content, body.messageType || 'message', body.metadata || {}, env);
}

/**
 * Process and broadcast a message
 */
async function processMessage(
  applicationId: string,
  senderAddress: string,
  senderAgentId: string | null,
  content: string,
  messageType: string,
  metadata: Record<string, unknown>,
  env: Env
): Promise<Response> {
  const supabase = createSupabaseClient(env);

  // Validate content
  if (!content || content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Content required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (content.length > 5000) {
    return new Response(JSON.stringify({ error: 'Content too long (max 5000)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify authorization
  const { data: application, error: appError } = await supabase
    .from('collaborate_applications')
    .select(`
      id,
      agent_id,
      marketplace_agents!inner(wallet_address),
      collaborate_missions!inner(creator_address)
    `)
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    return new Response(JSON.stringify({ error: 'Application not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const applicantAddress = (application.marketplace_agents as { wallet_address: string }).wallet_address.toLowerCase();
  const creatorAddress = (application.collaborate_missions as { creator_address: string }).creator_address.toLowerCase();
  const callerLower = senderAddress.toLowerCase();

  const isApplicant = callerLower === applicantAddress || senderAgentId === application.agent_id;
  const isCreator = callerLower === creatorAddress;

  if (!isApplicant && !isCreator) {
    return new Response(JSON.stringify({ error: 'Not a participant in this negotiation' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get sender name
  let senderName = 'Unknown';
  if (senderAgentId) {
    const { data: agent } = await supabase
      .from('marketplace_agents')
      .select('name')
      .eq('id', senderAgentId)
      .single();
    if (agent) senderName = agent.name;
  }

  // Insert message
  const { data: message, error: insertError } = await supabase
    .from('application_messages')
    .insert({
      application_id: applicationId,
      sender_address: senderAddress,
      sender_agent_id: senderAgentId,
      content: content.trim(),
      message_type: messageType,
      metadata,
    })
    .select('*')
    .single();

  if (insertError || !message) {
    return new Response(JSON.stringify({ error: 'Failed to save message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Broadcast to connected clients via Durable Object
  const id = env.NEGOTIATION_ROOM.idFromName(applicationId);
  const stub = env.NEGOTIATION_ROOM.get(id);

  await stub.fetch(new Request('http://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      type: 'message',
      data: {
        id: message.id,
        applicationId,
        senderAddress,
        senderAgentId,
        senderName,
        content: message.content,
        messageType: message.message_type,
        metadata: message.metadata,
        createdAt: message.created_at,
      },
    }),
  }));

  return new Response(JSON.stringify({
    success: true,
    message: {
      id: message.id,
      applicationId,
      senderAddress,
      senderAgentId,
      senderName,
      content: message.content,
      messageType: message.message_type,
      metadata: message.metadata,
      createdAt: message.created_at,
    },
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
