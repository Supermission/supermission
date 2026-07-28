/**
 * Disputes System
 * Enables conflict resolution between agents and mission creators
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { triggerWebhook } from '../webhooks';
import { getErc8004AgentId, submitOnChainFeedback } from '../erc8004/reputation';


// Auto-resolution thresholds
const AUTO_RESOLVE_DAYS = 7; // Days before auto-resolution for unresolved disputes
const REPUTATION_PENALTY_SCORE = 30; // Low score submitted for disputed agents

// ==========================================
// Types
// ==========================================

export type DisputeType = 'task_rejection' | 'payment' | 'quality' | 'communication' | 'deadline' | 'other';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'dismissed' | 'escalated';
export type ResolutionType = 'favor_filer' | 'favor_defendant' | 'partial' | 'dismissed' | 'mediated';

export interface Dispute {
  id: string;
  taskId: string | null;
  contractId: string | null;
  filedByAddress: string;
  filedByAgentId: string | null;
  filedAgainstAddress: string;
  filedAgainstAgentId: string | null;
  disputeType: DisputeType;
  claim: string;
  evidence: unknown[];
  status: DisputeStatus;
  resolution: string | null;
  resolutionType: ResolutionType | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface DisputeComment {
  id: string;
  disputeId: string;
  authorAddress: string;
  authorAgentId: string | null;
  commentType: 'comment' | 'evidence' | 'resolution' | 'system';
  content: string;
  attachments: unknown[];
  createdAt: Date;
}

export interface FileDisputeRequest {
  taskId?: string;
  contractId?: string;
  filedByAddress: string;
  filedByAgentId?: string;
  filedAgainstAddress: string;
  filedAgainstAgentId?: string;
  disputeType: DisputeType;
  claim: string;
  evidence?: unknown[];
}

// ==========================================
// Dispute Management
// ==========================================

/**
 * File a new dispute
 */
export async function fileDispute(
  request: FileDisputeRequest
): Promise<{ success: boolean; dispute?: Dispute; error?: string }> {
  try {
    // Validate required fields
    if (!request.taskId && !request.contractId) {
      return { success: false, error: 'Must specify either taskId or contractId' };
    }

    if (!request.claim || request.claim.trim().length < 20) {
      return { success: false, error: 'Claim must be at least 20 characters' };
    }

    if (request.claim.length > 5000) {
      return { success: false, error: 'Claim must be 5000 characters or less' };
    }

    // Verify the task or contract exists
    if (request.taskId) {
      const { data: task } = await supabaseAdmin
        .from('collaborate_tasks')
        .select('id, assigned_agent_id, mission_id')
        .eq('id', request.taskId)
        .single();

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      // Verify filer is involved in the task
      const { data: mission } = await supabaseAdmin
        .from('collaborate_missions')
        .select('creator_address')
        .eq('id', task.mission_id)
        .single();

      const isCreator = mission?.creator_address.toLowerCase() === request.filedByAddress.toLowerCase();
      const isAssignee = task.assigned_agent_id === request.filedByAgentId;

      if (!isCreator && !isAssignee) {
        return { success: false, error: 'You must be involved in this task to file a dispute' };
      }
    }

    if (request.contractId) {
      const { data: contract } = await supabaseAdmin
        .from('marketplace_contracts')
        .select('id, client_address, agent_id')
        .eq('id', request.contractId)
        .single();

      if (!contract) {
        return { success: false, error: 'Contract not found' };
      }

      // Verify filer is involved in the contract
      const isClient = contract.client_address.toLowerCase() === request.filedByAddress.toLowerCase();
      const isAgent = contract.agent_id === request.filedByAgentId;

      if (!isClient && !isAgent) {
        return { success: false, error: 'You must be involved in this contract to file a dispute' };
      }
    }

    // Check for existing open dispute
    let existingQuery = supabaseAdmin
      .from('disputes')
      .select('id')
      .eq('filed_by_address', request.filedByAddress)
      .in('status', ['open', 'under_review']);

    if (request.taskId) {
      existingQuery = existingQuery.eq('task_id', request.taskId);
    }
    if (request.contractId) {
      existingQuery = existingQuery.eq('contract_id', request.contractId);
    }

    const { data: existing } = await existingQuery.single();
    if (existing) {
      return { success: false, error: 'You already have an open dispute for this item' };
    }

    // Create dispute
    const { data, error } = await supabaseAdmin
      .from('disputes')
      .insert({
        task_id: request.taskId || null,
        contract_id: request.contractId || null,
        filed_by_address: request.filedByAddress,
        filed_by_agent_id: request.filedByAgentId || null,
        filed_against_address: request.filedAgainstAddress,
        filed_against_agent_id: request.filedAgainstAgentId || null,
        dispute_type: request.disputeType,
        claim: request.claim.trim(),
        evidence: request.evidence || [],
        status: 'open',
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Disputes] Create error:', error);
      return { success: false, error: 'Failed to create dispute' };
    }

    const dispute = mapDispute(data);

    // Webhook: notify the defendant about the dispute
    if (request.filedAgainstAgentId) {
      triggerWebhook(request.filedAgainstAgentId, 'task.rejected', {
        disputeId: dispute.id,
        disputeType: dispute.disputeType,
        claim: dispute.claim.slice(0, 200),
        filedByAddress: dispute.filedByAddress,
        taskId: dispute.taskId,
        contractId: dispute.contractId,
      }).catch(err => console.error('[Disputes] Webhook failed:', err));
    }

    return { success: true, dispute };
  } catch (error) {
    console.error('[Disputes] File error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get a dispute by ID
 */
export async function getDispute(disputeId: string): Promise<Dispute | null> {
  const { data, error } = await supabaseAdmin
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDispute(data);
}

/**
 * List disputes for an agent
 */
export async function listDisputes(options: {
  agentId?: string;
  address?: string;
  status?: DisputeStatus;
  taskId?: string;
  contractId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ disputes: Dispute[]; total: number }> {
  let query = supabaseAdmin
    .from('disputes')
    .select('*', { count: 'exact' });

  // Filter by involvement (filed by or against)
  if (options.agentId) {
    query = query.or(`filed_by_agent_id.eq.${options.agentId},filed_against_agent_id.eq.${options.agentId}`);
  }
  if (options.address) {
    query = query.or(`filed_by_address.ilike.${options.address},filed_against_address.ilike.${options.address}`);
  }

  if (options.status) {
    query = query.eq('status', options.status);
  }
  if (options.taskId) {
    query = query.eq('task_id', options.taskId);
  }
  if (options.contractId) {
    query = query.eq('contract_id', options.contractId);
  }

  const limit = Math.min(options.limit || 20, 50);
  const offset = options.offset || 0;

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[Disputes] List error:', error);
    return { disputes: [], total: 0 };
  }

  return {
    disputes: (data || []).map(mapDispute),
    total: count || 0,
  };
}

/**
 * Add a comment to a dispute
 */
export async function addDisputeComment(
  disputeId: string,
  comment: {
    authorAddress: string;
    authorAgentId?: string;
    commentType?: 'comment' | 'evidence' | 'resolution' | 'system';
    content: string;
    attachments?: unknown[];
  }
): Promise<{ success: boolean; comment?: DisputeComment; error?: string }> {
  try {
    if (!comment.content || comment.content.trim().length < 5) {
      return { success: false, error: 'Comment must be at least 5 characters' };
    }

    if (comment.content.length > 5000) {
      return { success: false, error: 'Comment must be 5000 characters or less' };
    }

    // Verify dispute exists and is not resolved
    const dispute = await getDispute(disputeId);
    if (!dispute) {
      return { success: false, error: 'Dispute not found' };
    }

    if (['resolved', 'dismissed'].includes(dispute.status)) {
      return { success: false, error: 'Cannot comment on a closed dispute' };
    }

    // Verify author is involved
    const isInvolved =
      dispute.filedByAddress.toLowerCase() === comment.authorAddress.toLowerCase() ||
      dispute.filedAgainstAddress.toLowerCase() === comment.authorAddress.toLowerCase();

    if (!isInvolved) {
      return { success: false, error: 'You must be involved in this dispute to comment' };
    }

    const { data, error } = await supabaseAdmin
      .from('dispute_comments')
      .insert({
        dispute_id: disputeId,
        author_address: comment.authorAddress,
        author_agent_id: comment.authorAgentId || null,
        comment_type: comment.commentType || 'comment',
        content: comment.content.trim(),
        attachments: comment.attachments || [],
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Disputes] Add comment error:', error);
      return { success: false, error: 'Failed to add comment' };
    }

    return { success: true, comment: mapComment(data) };
  } catch (error) {
    console.error('[Disputes] Comment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get comments for a dispute
 */
export async function getDisputeComments(
  disputeId: string,
  limit: number = 50
): Promise<DisputeComment[]> {
  const { data, error } = await supabaseAdmin
    .from('dispute_comments')
    .select('*')
    .eq('dispute_id', disputeId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return data.map(mapComment);
}

/**
 * Update dispute status (for admins/moderators)
 */
export async function updateDisputeStatus(
  disputeId: string,
  updates: {
    status?: DisputeStatus;
    resolution?: string;
    resolutionType?: ResolutionType;
    resolvedBy?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, unknown> = {};

  if (updates.status) {
    updateData.status = updates.status;

    if (['resolved', 'dismissed'].includes(updates.status)) {
      updateData.resolved_at = new Date().toISOString();
    }
  }
  if (updates.resolution) {
    updateData.resolution = updates.resolution;
  }
  if (updates.resolutionType) {
    updateData.resolution_type = updates.resolutionType;
  }
  if (updates.resolvedBy) {
    updateData.resolved_by = updates.resolvedBy;
  }

  const { error } = await supabaseAdmin
    .from('disputes')
    .update(updateData)
    .eq('id', disputeId);

  if (error) {
    return { success: false, error: 'Failed to update dispute' };
  }

  return { success: true };
}

// ==========================================
// Auto-Resolution
// ==========================================

/**
 * Auto-resolve disputes based on evidence and timing.
 * Designed to be called periodically (e.g., daily cron).
 *
 * Rules:
 * 1. Task has deliverable + approved by creator → auto-dismiss dispute
 * 2. Task has no deliverable + 7 days passed → auto-resolve in favor of filer
 * 3. No activity for 7 days + under_review → auto-resolve in favor of filer
 */
export async function resolveDisputesAutomatically(): Promise<{
  processed: number;
  resolved: number;
  dismissed: number;
  errors: string[];
}> {
  const result = { processed: 0, resolved: 0, dismissed: 0, errors: [] as string[] };

  try {
    // Get all open/under_review disputes
    const { data: disputes, error } = await supabaseAdmin
      .from('disputes')
      .select('*')
      .in('status', ['open', 'under_review'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (error || !disputes) {
      result.errors.push('Failed to fetch disputes');
      return result;
    }

    const now = new Date();
    const autoResolveThreshold = AUTO_RESOLVE_DAYS * 24 * 60 * 60 * 1000;

    for (const row of disputes) {
      result.processed++;
      const dispute = mapDispute(row);
      const ageMs = now.getTime() - dispute.createdAt.getTime();

      try {
        // Rule 1: Task-based disputes with approved deliverables → dismiss
        if (dispute.taskId) {
          const { data: task } = await supabaseAdmin
            .from('collaborate_tasks')
            .select('status, submission_data')
            .eq('id', dispute.taskId)
            .single();

          if (task?.status === 'approved' && task.submission_data) {
            await resolveDispute(dispute.id, {
              status: 'dismissed',
              resolution: 'Auto-dismissed: task deliverable was approved by creator',
              resolutionType: 'dismissed',
              resolvedBy: 'system',
            });
            result.dismissed++;
            continue;
          }

          // Rule 2: No deliverable + aged → resolve in favor of filer
          if (!task?.submission_data && ageMs >= autoResolveThreshold) {
            await resolveDispute(dispute.id, {
              status: 'resolved',
              resolution: `Auto-resolved: no deliverable submitted after ${AUTO_RESOLVE_DAYS} days`,
              resolutionType: 'favor_filer',
              resolvedBy: 'system',
            });
            result.resolved++;

            // Apply reputation penalty to defendant
            await applyDisputePenalty(dispute.filedAgainstAgentId);
            continue;
          }
        }

        // Rule 3: General timeout — no activity + aged
        if (ageMs >= autoResolveThreshold) {
          // Check for recent comments (activity)
          const { data: recentComments } = await supabaseAdmin
            .from('dispute_comments')
            .select('id')
            .eq('dispute_id', dispute.id)
            .gte('created_at', new Date(now.getTime() - autoResolveThreshold).toISOString())
            .limit(1);

          if (!recentComments || recentComments.length === 0) {
            await resolveDispute(dispute.id, {
              status: 'resolved',
              resolution: `Auto-resolved: no activity for ${AUTO_RESOLVE_DAYS} days`,
              resolutionType: 'favor_filer',
              resolvedBy: 'system',
            });
            result.resolved++;

            // Apply reputation penalty to defendant
            await applyDisputePenalty(dispute.filedAgainstAgentId);
          }
        }
      } catch (err) {
        result.errors.push(`Dispute ${dispute.id}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }
  } catch (error) {
    result.errors.push(`Fatal: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return result;
}

/**
 * Resolve a dispute with full lifecycle handling:
 * - Update status
 * - Add system comment
 * - Trigger webhooks
 */
async function resolveDispute(
  disputeId: string,
  params: {
    status: DisputeStatus;
    resolution: string;
    resolutionType: ResolutionType;
    resolvedBy: string;
  }
): Promise<void> {
  await updateDisputeStatus(disputeId, params);

  // Add system comment
  const dispute = await getDispute(disputeId);
  if (dispute) {
    await supabaseAdmin.from('dispute_comments').insert({
      dispute_id: disputeId,
      author_address: 'system',
      comment_type: 'resolution',
      content: params.resolution,
      attachments: [],
    });

    // Webhook notifications
    if (dispute.filedByAgentId) {
      triggerWebhook(dispute.filedByAgentId, 'task.approved', {
        disputeId,
        resolution: params.resolution,
        resolutionType: params.resolutionType,
      }).catch(() => {});
    }
    if (dispute.filedAgainstAgentId) {
      triggerWebhook(dispute.filedAgainstAgentId, 'task.approved', {
        disputeId,
        resolution: params.resolution,
        resolutionType: params.resolutionType,
      }).catch(() => {});
    }
  }
}

/**
 * Apply reputation penalty to a disputed agent.
 * Submits low ERC-8004 feedback for agents with disputes resolved against them.
 */
async function applyDisputePenalty(agentId: string | null): Promise<void> {
  if (!agentId) return;

  try {
    const erc8004Id = await getErc8004AgentId(agentId);
    if (erc8004Id) {
      await submitOnChainFeedback({
        agentId: BigInt(erc8004Id),
        value: REPUTATION_PENALTY_SCORE,
        tag1: 'dispute-resolved-against',
        tag2: 'dispute',
      });
    }
  } catch (err) {
    console.error('[Disputes] Reputation penalty failed:', err);
  }
}

// ==========================================
// Helpers
// ==========================================

function mapDispute(data: Record<string, unknown>): Dispute {
  return {
    id: data.id as string,
    taskId: data.task_id as string | null,
    contractId: data.contract_id as string | null,
    filedByAddress: data.filed_by_address as string,
    filedByAgentId: data.filed_by_agent_id as string | null,
    filedAgainstAddress: data.filed_against_address as string,
    filedAgainstAgentId: data.filed_against_agent_id as string | null,
    disputeType: data.dispute_type as DisputeType,
    claim: data.claim as string,
    evidence: (data.evidence as unknown[]) || [],
    status: data.status as DisputeStatus,
    resolution: data.resolution as string | null,
    resolutionType: data.resolution_type as ResolutionType | null,
    resolvedBy: data.resolved_by as string | null,
    resolvedAt: data.resolved_at ? new Date(data.resolved_at as string) : null,
    createdAt: new Date(data.created_at as string),
  };
}

function mapComment(data: Record<string, unknown>): DisputeComment {
  return {
    id: data.id as string,
    disputeId: data.dispute_id as string,
    authorAddress: data.author_address as string,
    authorAgentId: data.author_agent_id as string | null,
    commentType: data.comment_type as 'comment' | 'evidence' | 'resolution' | 'system',
    content: data.content as string,
    attachments: (data.attachments as unknown[]) || [],
    createdAt: new Date(data.created_at as string),
  };
}
