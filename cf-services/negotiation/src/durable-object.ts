/**
 * NegotiationRoom Durable Object
 *
 * Manages WebSocket connections for a single negotiation room.
 * Uses WebSocket Hibernation for efficient resource usage.
 */

import { createSupabaseClient } from '@supermission/cf-shared';
import type { NegotiationParticipants, NegotiationMessage, WebSocketMessage } from '@supermission/cf-shared';
import { verifyAuthToken } from './auth';
import type { Env } from './index';

interface ConnectionAttachment {
  address: string;
  agentId: string | null;
  role: 'applicant' | 'creator';
  connectedAt: string;
}

export class NegotiationRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private applicationId: string | null = null;
  private participants: NegotiationParticipants | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal: Get connection count
    if (url.hostname === 'internal' && url.pathname === '/count') {
      const sockets = this.state.getWebSockets();
      return new Response(JSON.stringify({ count: sockets.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Internal: Broadcast message to all connected clients
    if (url.hostname === 'internal' && url.pathname === '/broadcast') {
      const message = await request.json();
      await this.broadcast(JSON.stringify(message));
      return new Response('OK');
    }

    // WebSocket upgrade request
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    return new Response('WebSocket upgrade required', { status: 426 });
  }

  /**
   * Handle WebSocket connection upgrade
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Extract applicationId from path
    const pathParts = url.pathname.split('/');
    const applicationId = pathParts[pathParts.length - 1] || url.searchParams.get('applicationId');

    if (!applicationId) {
      return new Response('Application ID required', { status: 400 });
    }

    this.applicationId = applicationId;

    // Authenticate the connection
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Authentication token required', { status: 401 });
    }

    // Verify token
    const tokenData = await verifyAuthToken(token, this.env);
    if (!tokenData) {
      return new Response('Invalid token', { status: 401 });
    }

    // Load participants if not cached
    if (!this.participants) {
      this.participants = await this.loadParticipants(applicationId);
    }

    if (!this.participants) {
      return new Response('Application not found', { status: 404 });
    }

    // Verify caller is a participant
    const role = this.getRole(tokenData.address, tokenData.agentId);
    if (!role) {
      return new Response('Not a participant in this negotiation', { status: 403 });
    }

    // Create WebSocket pair
    const [client, server] = Object.values(new WebSocketPair());

    // Store connection metadata
    const attachment: ConnectionAttachment = {
      address: tokenData.address,
      agentId: tokenData.agentId || null,
      role,
      connectedAt: new Date().toISOString(),
    };

    // Accept with hibernation
    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      data: {
        applicationId,
        role,
        participants: {
          applicantAgentId: this.participants.applicantAgentId,
          creatorAgentId: this.participants.creatorAgentId,
        },
      },
    }));

    // Notify others of new connection
    await this.broadcast(JSON.stringify({
      type: 'participant_joined',
      data: { role },
    }), server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket message (called by runtime on wake)
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      ws.send(JSON.stringify({ type: 'error', error: 'Binary messages not supported' }));
      return;
    }

    const attachment = ws.deserializeAttachment() as ConnectionAttachment;

    try {
      const parsed = JSON.parse(message) as WebSocketMessage;

      switch (parsed.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'message':
          await this.handleMessage(ws, attachment, parsed.content || '', parsed.metadata);
          break;

        case 'offer':
          await this.handleOffer(ws, attachment, parsed.content || '', parsed.metadata);
          break;

        case 'typing':
          await this.broadcast(JSON.stringify({
            type: 'typing',
            data: { role: attachment.role },
          }), ws);
          break;

        default:
          ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message',
      }));
    }
  }

  /**
   * Handle WebSocket close (called by runtime)
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = ws.deserializeAttachment() as ConnectionAttachment;

    // Notify others
    await this.broadcast(JSON.stringify({
      type: 'participant_left',
      data: { role: attachment.role },
    }));
  }

  /**
   * Handle WebSocket error (called by runtime)
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('[NegotiationRoom] WebSocket error:', error);
    ws.close(1011, 'Internal error');
  }

  /**
   * Handle incoming chat message
   */
  private async handleMessage(
    ws: WebSocket,
    sender: ConnectionAttachment,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!content || content.trim().length === 0) {
      ws.send(JSON.stringify({ type: 'error', error: 'Content required' }));
      return;
    }

    if (content.length > 5000) {
      ws.send(JSON.stringify({ type: 'error', error: 'Message too long (max 5000)' }));
      return;
    }

    // Persist to database
    const supabase = createSupabaseClient(this.env);

    const { data: message, error } = await supabase
      .from('application_messages')
      .insert({
        application_id: this.applicationId,
        sender_address: sender.address,
        sender_agent_id: sender.agentId,
        content: content.trim(),
        message_type: 'message',
        metadata: metadata || {},
      })
      .select('*')
      .single();

    if (error || !message) {
      ws.send(JSON.stringify({ type: 'error', error: 'Failed to save message' }));
      return;
    }

    // Broadcast to all connected clients (including sender for confirmation)
    await this.broadcast(JSON.stringify({
      type: 'message',
      data: {
        id: message.id,
        applicationId: this.applicationId,
        senderAddress: sender.address,
        senderAgentId: sender.agentId,
        senderRole: sender.role,
        content: message.content,
        messageType: 'message',
        metadata: message.metadata,
        createdAt: message.created_at,
      },
    }));
  }

  /**
   * Handle offer message (rate proposal)
   */
  private async handleOffer(
    ws: WebSocket,
    sender: ConnectionAttachment,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!metadata?.rate) {
      ws.send(JSON.stringify({ type: 'error', error: 'Offer requires rate in metadata' }));
      return;
    }

    // Persist to database
    const supabase = createSupabaseClient(this.env);

    const { data: message, error } = await supabase
      .from('application_messages')
      .insert({
        application_id: this.applicationId,
        sender_address: sender.address,
        sender_agent_id: sender.agentId,
        content: content.trim() || `Proposed rate: ${metadata.rate}`,
        message_type: 'offer',
        metadata: { ...metadata, role: sender.role },
      })
      .select('*')
      .single();

    if (error || !message) {
      ws.send(JSON.stringify({ type: 'error', error: 'Failed to save offer' }));
      return;
    }

    // Broadcast offer to all
    await this.broadcast(JSON.stringify({
      type: 'offer',
      data: {
        id: message.id,
        applicationId: this.applicationId,
        senderAddress: sender.address,
        senderAgentId: sender.agentId,
        senderRole: sender.role,
        content: message.content,
        messageType: 'offer',
        metadata: message.metadata,
        createdAt: message.created_at,
      },
    }));
  }

  /**
   * Broadcast message to all connected clients
   */
  private async broadcast(message: string, excludeWs?: WebSocket): Promise<void> {
    const sockets = this.state.getWebSockets();

    for (const ws of sockets) {
      if (ws !== excludeWs && ws.readyState === WebSocket.READY_STATE_OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('[NegotiationRoom] Failed to send to socket:', error);
        }
      }
    }
  }

  /**
   * Load participants from database
   */
  private async loadParticipants(applicationId: string): Promise<NegotiationParticipants | null> {
    const supabase = createSupabaseClient(this.env);

    const { data: application, error } = await supabase
      .from('collaborate_applications')
      .select(`
        id,
        mission_id,
        agent_id,
        marketplace_agents!inner(wallet_address),
        collaborate_missions!inner(creator_address)
      `)
      .eq('id', applicationId)
      .single();

    if (error || !application) {
      return null;
    }

    // Try to find creator's agent ID
    const creatorAddress = (application.collaborate_missions as { creator_address: string }).creator_address;
    const { data: creatorAgent } = await supabase
      .from('marketplace_agents')
      .select('id')
      .ilike('wallet_address', creatorAddress)
      .single();

    return {
      applicationId,
      missionId: application.mission_id,
      applicantAgentId: application.agent_id,
      applicantAddress: (application.marketplace_agents as { wallet_address: string }).wallet_address,
      creatorAddress,
      creatorAgentId: creatorAgent?.id || null,
    };
  }

  /**
   * Determine role of a caller
   */
  private getRole(address: string, agentId: string | null): 'applicant' | 'creator' | null {
    if (!this.participants) return null;

    const addrLower = address.toLowerCase();

    if (addrLower === this.participants.creatorAddress.toLowerCase()) {
      return 'creator';
    }

    if (
      addrLower === this.participants.applicantAddress.toLowerCase() ||
      agentId === this.participants.applicantAgentId
    ) {
      return 'applicant';
    }

    return null;
  }
}
