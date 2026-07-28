/**
 * Application Negotiation - Private chat for mission applications
 * Enables agent-to-agent negotiation before acceptance
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { triggerWebhook, WebhookEvent } from '../webhooks';
import { sanitizeInput } from '../utils/sanitize';


// ==========================================
// Types
// ==========================================

export type MessageType = 'message' | 'system' | 'offer' | 'approval' | 'withdrawal';

export interface ApplicationMessage {
  id: string;
  applicationId: string;
  senderAddress: string;
  senderAgentId: string | null;
  senderName?: string;
  content: string;
  messageType: MessageType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApplicationApprovalState {
  agentApproved: boolean;
  creatorApproved: boolean;
  agentApprovedAt: string | null;
  creatorApprovedAt: string | null;
  proposedRate: string | null;
  agreedRate: string | null;
  agreedRateCurrency: string;
  status: string;
}

export interface NegotiationParticipants {
  applicationId: string;
  missionId: string;
  applicantAgentId: string;
  applicantAddress: string;
  creatorAddress: string;
  creatorAgentId: string | null;
}

// ==========================================
// Authorization
// ==========================================

/**
 * Get negotiation participants and verify access
 * Returns null if application doesn't exist or caller is not authorized
 */
export async function getNegotiationParticipants(
  applicationId: string
): Promise<NegotiationParticipants | null> {
  const { data: application, error } = await supabaseAdmin
    .from('collaborate_applications')
    .select(`
      id,
      mission_id,
      agent_id,
      marketplace_agents!collaborate_applications_agent_id_fkey(wallet_address)
    `)
    .eq('id', applicationId)
    .single();

  if (error || !application) {
    return null;
  }

  // Get mission creator
  const { data: mission } = await supabaseAdmin
    .from('collaborate_missions')
    .select('creator_address')
    .eq('id', application.mission_id)
    .single();

  if (!mission) {
    return null;
  }

  // Resolve applicant address from the join
  const agents = application.marketplace_agents;
  let applicantAddress = '';
  if (Array.isArray(agents) && agents.length > 0) {
    applicantAddress = (agents[0] as { wallet_address: string }).wallet_address || '';
  } else if (agents && typeof agents === 'object' && 'wallet_address' in agents) {
    applicantAddress = (agents as { wallet_address: string }).wallet_address || '';
  }

  // Resolve creator's agent_id (if they have one)
  const creatorAgentId = await resolveCreatorAgentId(mission.creator_address);

  return {
    applicationId: application.id,
    missionId: application.mission_id,
    applicantAgentId: application.agent_id,
    applicantAddress,
    creatorAddress: mission.creator_address,
    creatorAgentId,
  };
}

/**
 * Check if an address/agent is authorized to access the negotiation
 */
export function isAuthorizedParticipant(
  participants: NegotiationParticipants,
  callerAddress: string,
  callerAgentId: string | null
): { authorized: boolean; role: 'applicant' | 'creator' | null } {
  const normalizedCaller = callerAddress.toLowerCase();

  // Check if creator
  if (normalizedCaller === participants.creatorAddress.toLowerCase()) {
    return { authorized: true, role: 'creator' };
  }

  // Check if applicant (by agent ID or address)
  if (callerAgentId && callerAgentId === participants.applicantAgentId) {
    return { authorized: true, role: 'applicant' };
  }

  if (participants.applicantAddress && normalizedCaller === participants.applicantAddress.toLowerCase()) {
    return { authorized: true, role: 'applicant' };
  }

  return { authorized: false, role: null };
}

/**
 * Resolve creator's agent_id from their wallet address
 */
export async function resolveCreatorAgentId(creatorAddress: string): Promise<string | null> {
  // wallet_address is always stored lowercase (see marketplace/index.ts).
  // Use .eq() so Postgres can satisfy the query via the btree index instead of
  // a sequential scan (ilike cannot use a standard index).
  const { data } = await supabaseAdmin
    .from('marketplace_agents')
    .select('id')
    .eq('wallet_address', creatorAddress.toLowerCase())
    .limit(1)
    .single();

  return data?.id || null;
}

// ==========================================
// Messages
// ==========================================

/**
 * Get messages for an application negotiation
 */
export async function getApplicationMessages(
  applicationId: string,
  options: { limit?: number; before?: string } = {}
): Promise<{ messages: ApplicationMessage[]; hasMore: boolean }> {
  const limit = Math.min(options.limit || 50, 100);

  let query = supabaseAdmin
    .from('application_messages')
    .select(`
      *,
      marketplace_agents!application_messages_sender_agent_id_fkey(agent_name)
    `)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1); // Fetch one extra to check hasMore

  if (options.before) {
    query = query.lt('id', options.before);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error('[Negotiation] Get messages error:', error);
    return { messages: [], hasMore: false };
  }

  const hasMore = data.length > limit;
  const messages = (hasMore ? data.slice(0, limit) : data).map((msg) => {
    const agents = msg.marketplace_agents;
    let senderName: string | undefined;
    if (Array.isArray(agents) && agents.length > 0) {
      senderName = (agents[0] as { agent_name: string }).agent_name;
    } else if (agents && typeof agents === 'object' && 'agent_name' in agents) {
      senderName = (agents as { agent_name: string }).agent_name;
    }

    return {
      id: msg.id,
      applicationId: msg.application_id,
      senderAddress: msg.sender_address,
      senderAgentId: msg.sender_agent_id,
      senderName,
      content: msg.content,
      messageType: msg.message_type as MessageType,
      metadata: msg.metadata || {},
      createdAt: msg.created_at,
    };
  });

  return { messages, hasMore };
}

/**
 * Send a message in an application negotiation
 */
export async function sendApplicationMessage(
  applicationId: string,
  senderAddress: string,
  senderAgentId: string | null,
  content: string,
  messageType: MessageType = 'message',
  metadata: Record<string, unknown> = {}
): Promise<{ success: boolean; message?: ApplicationMessage; error?: string }> {
  // Validate content
  if (!content || content.trim().length === 0) {
    return { success: false, error: 'Content is required' };
  }
  if (content.length > 5000) {
    return { success: false, error: 'Content must be 5000 characters or less' };
  }

  // Sanitize content
  const sanitizedContent = sanitizeInput(content).trim();

  const { data, error } = await supabaseAdmin
    .from('application_messages')
    .insert({
      application_id: applicationId,
      sender_address: senderAddress,
      sender_agent_id: senderAgentId,
      content: sanitizedContent,
      message_type: messageType,
      metadata,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[Negotiation] Send message error:', error);
    return { success: false, error: 'Failed to send message' };
  }

  return {
    success: true,
    message: {
      id: data.id,
      applicationId: data.application_id,
      senderAddress: data.sender_address,
      senderAgentId: data.sender_agent_id,
      content: data.content,
      messageType: data.message_type as MessageType,
      metadata: data.metadata || {},
      createdAt: data.created_at,
    },
  };
}

/**
 * Insert a system message (for approvals, withdrawals, etc.)
 */
async function insertSystemMessage(
  applicationId: string,
  content: string,
  messageType: MessageType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await supabaseAdmin
    .from('application_messages')
    .insert({
      application_id: applicationId,
      sender_address: 'system',
      sender_agent_id: null,
      content,
      message_type: messageType,
      metadata,
    });
}

// ==========================================
// Auto-Activate Helper
// ==========================================

/**
 * Auto-activate a mission if it's still in 'active' status.
 * Uses optimistic concurrency: only updates if status is still 'active'.
 * Safe to call multiple times — no-op if already activated.
 */
export async function autoActivateMissionIfNeeded(missionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('collaborate_missions')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', missionId)
    .eq('status', 'active');

  if (error) {
    console.error('[AutoActivate] Failed to auto-activate mission:', error);
  }
}

// ==========================================
// Approval
// ==========================================

/**
 * Toggle approval for an application
 *
 * Simplified flow:
 * - When creator approves WITHOUT changing rate (agreedRate undefined or matches proposedRate),
 *   both approvals are set → instant accept (no mutual approval needed).
 * - When creator approves WITH a different rate (counter-offer), only creator_approved is set.
 *   Agent must then approve the counter-offer (mutual approval).
 * - After any acceptance, mission auto-activates if still in 'active' (open) status.
 */
export async function toggleApproval(
  applicationId: string,
  callerAddress: string,
  callerAgentId: string | null,
  approved: boolean,
  agreedRate?: string
): Promise<{
  success: boolean;
  application?: ApplicationApprovalState;
  fullyAccepted?: boolean;
  x402PaymentReady?: {
    rate: string;
    currency: string;
    recipientAddress: string;
    recipientAgentId: string;
  };
  error?: string;
}> {
  // Get participants and verify authorization
  const participants = await getNegotiationParticipants(applicationId);
  if (!participants) {
    return { success: false, error: 'Application not found' };
  }

  const { authorized, role } = isAuthorizedParticipant(participants, callerAddress, callerAgentId);
  if (!authorized || !role) {
    return { success: false, error: 'Not authorized to approve this application' };
  }

  // Get current application state
  const { data: application, error: fetchError } = await supabaseAdmin
    .from('collaborate_applications')
    .select('status, agent_approved, creator_approved, agent_approved_at, creator_approved_at, proposed_rate, agreed_rate, agreed_rate_currency')
    .eq('id', applicationId)
    .single();

  if (fetchError || !application) {
    return { success: false, error: 'Application not found' };
  }

  if (application.status !== 'pending') {
    return { success: false, error: `Application is already ${application.status}` };
  }

  // Build update object based on role
  const updateData: Record<string, unknown> = {};
  const now = new Date().toISOString();

  if (role === 'applicant') {
    updateData.agent_approved = approved;
    updateData.agent_approved_at = approved ? now : null;
  } else {
    updateData.creator_approved = approved;
    updateData.creator_approved_at = approved ? now : null;
  }

  // Resolve agreed rate: explicit > previously agreed > proposed rate
  const newAgreedRate = agreedRate ?? application.agreed_rate ?? application.proposed_rate;

  // If setting agreed rate explicitly, or if approving and rate should be locked in
  if (agreedRate !== undefined) {
    updateData.agreed_rate = agreedRate;
  } else if (approved && newAgreedRate && !application.agreed_rate) {
    // Auto-lock the proposed rate as agreed rate when approving
    updateData.agreed_rate = newAgreedRate;
  }

  // Same-rate instant acceptance: when creator approves and rate hasn't changed,
  // set both approvals to skip mutual approval step.
  const isCreatorApproving = role === 'creator' && approved;
  const ratesMatch = agreedRate === undefined || agreedRate === application.proposed_rate;
  const instantAccept = isCreatorApproving && ratesMatch;

  if (instantAccept) {
    // Set both approvals — skip mutual approval
    updateData.agent_approved = true;
    updateData.agent_approved_at = application.agent_approved_at || now;
  }

  // Calculate new approval state
  const newAgentApproved = instantAccept
    ? true
    : (role === 'applicant' ? approved : application.agent_approved);
  const newCreatorApproved = role === 'creator' ? approved : application.creator_approved;

  // Check if both approved — agreed rate falls back to proposed rate
  const fullyAccepted = !!(newAgentApproved && newCreatorApproved);

  if (fullyAccepted) {
    updateData.status = 'accepted';
    updateData.responded_at = now;
  }

  // Update application
  const { error: updateError } = await supabaseAdmin
    .from('collaborate_applications')
    .update(updateData)
    .eq('id', applicationId);

  if (updateError) {
    console.error('[Negotiation] Toggle approval error:', updateError);
    return { success: false, error: 'Failed to update approval' };
  }

  // Insert system message
  if (approved) {
    const message = fullyAccepted
      ? (instantAccept
        ? 'Application accepted — rate agreed, no counter-offer'
        : 'Application accepted via mutual approval')
      : `${role === 'applicant' ? 'Applicant' : 'Creator'} has approved the application`;
    await insertSystemMessage(applicationId, message, 'approval', {
      role,
      agreedRate: newAgreedRate,
      fullyAccepted,
      instantAccept,
    });
  } else {
    await insertSystemMessage(
      applicationId,
      `Approval withdrawn by ${role === 'applicant' ? 'applicant' : 'creator'}`,
      'withdrawal',
      { role }
    );
  }

  // Trigger webhooks
  const otherPartyAgentId = role === 'applicant'
    ? participants.creatorAgentId
    : participants.applicantAgentId;

  // When role='creator' and fullyAccepted=true, otherPartyAgentId === applicantAgentId,
  // and the block below already sends application.accepted to the applicant.
  // Skip this notification in that case to prevent the double-fire.
  // When role='applicant' and fullyAccepted=true, otherPartyAgentId === creatorAgentId
  // (different from applicantAgentId), so this notification is still needed.
  const skipPartialNotification = fullyAccepted && role === 'creator';
  if (otherPartyAgentId && !skipPartialNotification) {
    triggerWebhook(otherPartyAgentId, 'application.accepted' as WebhookEvent, {
      applicationId,
      missionId: participants.missionId,
      agentApproved: newAgentApproved,
      creatorApproved: newCreatorApproved,
      changedBy: role,
      agreedRate: newAgreedRate,
      fullyAccepted,
    }).catch(err => console.error('[Webhook] approval change trigger failed:', err));
  }

  // If fully accepted, notify the applicant + auto-activate mission
  if (fullyAccepted) {
    triggerWebhook(participants.applicantAgentId, 'application.accepted' as WebhookEvent, {
      applicationId,
      missionId: participants.missionId,
      agreedRate: newAgreedRate,
      message: instantAccept
        ? 'Your application has been accepted!'
        : 'Your application has been mutually approved!',
    }).catch(err => console.error('[Webhook] mutual approval trigger failed:', err));

    // Auto-activate mission if still accepting applications
    await autoActivateMissionIfNeeded(participants.missionId);
  }

  // Build response
  const response: {
    success: boolean;
    application: ApplicationApprovalState;
    fullyAccepted: boolean;
    x402PaymentReady?: {
      rate: string;
      currency: string;
      recipientAddress: string;
      recipientAgentId: string;
    };
  } = {
    success: true,
    application: {
      agentApproved: newAgentApproved,
      creatorApproved: newCreatorApproved,
      agentApprovedAt: instantAccept ? (application.agent_approved_at || now) : (role === 'applicant' && approved ? now : application.agent_approved_at),
      creatorApprovedAt: role === 'creator' && approved ? now : application.creator_approved_at,
      proposedRate: application.proposed_rate,
      agreedRate: newAgreedRate,
      agreedRateCurrency: application.agreed_rate_currency || 'USDC',
      status: fullyAccepted ? 'accepted' : 'pending',
    },
    fullyAccepted,
  };

  // Add x402 payment info if fully accepted
  if (fullyAccepted && newAgreedRate) {
    response.x402PaymentReady = {
      rate: newAgreedRate,
      currency: application.agreed_rate_currency || 'USDC',
      recipientAddress: participants.applicantAddress,
      recipientAgentId: participants.applicantAgentId,
    };
  }

  return response;
}

/**
 * Get current approval state for an application
 */
export async function getApprovalState(applicationId: string): Promise<ApplicationApprovalState | null> {
  const { data, error } = await supabaseAdmin
    .from('collaborate_applications')
    .select(`
      status,
      agent_approved,
      creator_approved,
      agent_approved_at,
      creator_approved_at,
      proposed_rate,
      agreed_rate,
      agreed_rate_currency
    `)
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    agentApproved: data.agent_approved ?? false,
    creatorApproved: data.creator_approved ?? false,
    agentApprovedAt: data.agent_approved_at,
    creatorApprovedAt: data.creator_approved_at,
    proposedRate: data.proposed_rate,
    agreedRate: data.agreed_rate,
    agreedRateCurrency: data.agreed_rate_currency || 'USDC',
    status: data.status,
  };
}
