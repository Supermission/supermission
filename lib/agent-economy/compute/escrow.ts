/**
 * Compute Escrow - Sponsor-funded compute budgets
 * Mission creators deposit compute budgets, agents draw during execution.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeInput } from '../utils/sanitize';
import { getWalletByAgentName } from '../wallet/create';
import type { ComputeEscrow, CreateEscrowRequest, EscrowDraw } from './types';


// ==========================================
// Create Escrow
// ==========================================

/**
 * Create a compute escrow (sponsor deposits compute budget)
 */
export async function createEscrow(
  request: CreateEscrowRequest
): Promise<{ success: boolean; escrow?: ComputeEscrow; error?: string }> {
  try {
    // Validate sponsor exists
    const { data: sponsor, error: sponsorErr } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, status')
      .eq('id', request.sponsorAgentId)
      .single();

    if (sponsorErr || !sponsor) {
      return { success: false, error: 'Sponsor agent not found' };
    }
    if (sponsor.status !== 'active') {
      return { success: false, error: 'Sponsor agent must be active' };
    }

    // Validate budget
    const budget = BigInt(request.totalBudgetUsdc);
    if (budget <= 0n) {
      return { success: false, error: 'Budget must be positive' };
    }
    // Max 1 billion USDC (in atomic units = 1e15)
    if (budget > 1_000_000_000_000_000n) {
      return { success: false, error: 'Budget exceeds maximum allowed' };
    }

    // Validate mission exists if provided
    if (request.missionId) {
      const { data: mission } = await supabaseAdmin
        .from('collaborate_missions')
        .select('id')
        .eq('id', request.missionId)
        .single();

      if (!mission) {
        return { success: false, error: 'Mission not found' };
      }
    }

    const escrowId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = request.expiresInSeconds
      ? new Date(Date.now() + request.expiresInSeconds * 1000).toISOString()
      : null;

    // Agentic wallets: sponsors fund escrow on-chain themselves
    // Platform just tracks the DB record
    const row = {
      id: escrowId,
      sponsor_agent_id: request.sponsorAgentId,
      sponsor_agent_name: sanitizeInput(sponsor.agent_name),
      mission_id: request.missionId || null,
      task_id: request.taskId || null,
      total_budget_usdc: request.totalBudgetUsdc,
      spent_usdc: 0,
      remaining_usdc: request.totalBudgetUsdc,
      status: 'funded',
      max_per_session_usdc: request.maxPerSessionUsdc || null,
      allowed_agent_ids: request.allowedAgentIds || null,
      expires_at: expiresAt,
      metadata: request.metadata || {},
    };

    const { error } = await supabaseAdmin
      .from('compute_escrow')
      .insert(row);

    if (error) {
      console.error('[Escrow] Insert error:', error);
      return { success: false, error: 'Failed to create escrow' };
    }

    const escrow: ComputeEscrow = {
      id: escrowId,
      sponsorAgentId: request.sponsorAgentId,
      sponsorAgentName: sponsor.agent_name,
      missionId: request.missionId || null,
      taskId: request.taskId || null,
      totalBudgetUsdc: request.totalBudgetUsdc,
      spentUsdc: '0',
      remainingUsdc: request.totalBudgetUsdc,
      status: 'funded',
      maxPerSessionUsdc: request.maxPerSessionUsdc || null,
      allowedAgentIds: request.allowedAgentIds || [],
      fundTxHash: null,
      releaseTxHash: null,
      refundTxHash: null,
      createdAt: now,
      releasedAt: null,
      expiresAt,
      metadata: request.metadata || {},
    };

    return { success: true, escrow };
  } catch (error) {
    console.error('[Escrow] createEscrow error:', error);
    return { success: false, error: 'Internal error creating escrow' };
  }
}

// ==========================================
// Draw from Escrow
// ==========================================

/**
 * Draw funds from an escrow for a compute session execution
 */
export async function drawFromEscrow(params: {
  escrowId: string;
  sessionId: string;
  agentId: string;
  amountUsdc: string;
  receiptId?: string;
  description?: string;
}): Promise<{ success: boolean; draw?: EscrowDraw; error?: string }> {
  try {
    // Fetch escrow
    const { data: escrow, error: fetchErr } = await supabaseAdmin
      .from('compute_escrow')
      .select('*')
      .eq('id', params.escrowId)
      .single();

    if (fetchErr || !escrow) {
      return { success: false, error: 'Escrow not found' };
    }

    // Check status
    if (escrow.status !== 'funded' && escrow.status !== 'active') {
      return { success: false, error: `Escrow is ${escrow.status}, cannot draw` };
    }

    // Check expiry — mark expired and refund remaining balance
    if (escrow.expires_at && new Date(escrow.expires_at) < new Date()) {
      await refundEscrow(params.escrowId);
      return { success: false, error: 'Escrow has expired' };
    }

    // Check allowed agents
    if (escrow.allowed_agent_ids && escrow.allowed_agent_ids.length > 0) {
      if (!escrow.allowed_agent_ids.includes(params.agentId)) {
        return { success: false, error: 'Agent not authorized to draw from this escrow' };
      }
    }

    // Check per-session cap
    if (escrow.max_per_session_usdc) {
      const { data: sessionDraws } = await supabaseAdmin
        .from('escrow_draws')
        .select('amount_usdc')
        .eq('escrow_id', params.escrowId)
        .eq('session_id', params.sessionId);

      const sessionTotal = (sessionDraws || []).reduce(
        (sum: bigint, d: Record<string, unknown>) => sum + BigInt((d.amount_usdc as number) ?? 0),
        0n
      );

      if (sessionTotal + BigInt(params.amountUsdc) > BigInt(escrow.max_per_session_usdc ?? 0)) {
        return { success: false, error: 'Draw would exceed per-session cap' };
      }
    }

    // Validate draw amount
    let drawAmount: bigint;
    try {
      drawAmount = BigInt(params.amountUsdc);
      if (drawAmount <= 0n) {
        return { success: false, error: 'Draw amount must be positive' };
      }
    } catch {
      return { success: false, error: 'Invalid draw amount' };
    }

    // Check remaining balance
    const remaining = BigInt(escrow.remaining_usdc ?? 0);

    if (drawAmount > remaining) {
      return { success: false, error: 'Insufficient escrow balance' };
    }

    // Calculate new balances
    const newSpent = (BigInt(escrow.spent_usdc ?? 0) + drawAmount).toString();
    const newRemaining = (remaining - drawAmount).toString();
    const newStatus = BigInt(newRemaining) <= 0n ? 'depleted' : 'active';

    // Atomic update: only succeed if remaining_usdc hasn't changed (optimistic lock)
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('compute_escrow')
      .update({
        spent_usdc: newSpent,
        remaining_usdc: newRemaining,
        status: newStatus,
      })
      .eq('id', params.escrowId)
      .eq('remaining_usdc', escrow.remaining_usdc) // optimistic concurrency check
      .select('id')
      .single();

    if (updateErr || !updated) {
      // Another draw happened concurrently — retry or fail
      return { success: false, error: 'Escrow balance changed concurrently, retry the draw' };
    }

    // Record the draw (after balance update to prevent overdraft)
    const drawId = uuidv4();
    const drawRow = {
      id: drawId,
      escrow_id: params.escrowId,
      session_id: params.sessionId,
      agent_id: params.agentId,
      amount_usdc: params.amountUsdc,
      receipt_id: params.receiptId || null,
      description: params.description ? sanitizeInput(params.description) : null,
    };

    let { error: drawErr } = await supabaseAdmin
      .from('escrow_draws')
      .insert(drawRow);

    if (drawErr) {
      console.error('[Escrow] Draw insert error (attempt 1):', drawErr);
      // Retry once with a fresh ID to avoid duplicate key collision
      const retryRow = { ...drawRow, id: uuidv4() };
      const retry = await supabaseAdmin.from('escrow_draws').insert(retryRow);
      drawErr = retry.error;

      if (drawErr) {
        console.error('[Escrow] Draw insert error (attempt 2):', drawErr);
        // Roll back the balance update — reverse the atomic deduction
        await supabaseAdmin
          .from('compute_escrow')
          .update({
            spent_usdc: escrow.spent_usdc,
            remaining_usdc: escrow.remaining_usdc,
            status: escrow.status,
          })
          .eq('id', params.escrowId);
        console.error('[Escrow] Balance rolled back due to audit trail failure');
        return { success: false, error: 'Failed to record draw — balance rolled back' };
      }
    }

    const draw: EscrowDraw = {
      id: drawId,
      escrowId: params.escrowId,
      sessionId: params.sessionId,
      agentId: params.agentId,
      amountUsdc: params.amountUsdc,
      receiptId: params.receiptId || null,
      description: params.description || null,
      createdAt: new Date().toISOString(),
    };

    return { success: true, draw };
  } catch (error) {
    console.error('[Escrow] drawFromEscrow error:', error);
    return { success: false, error: 'Internal error drawing from escrow' };
  }
}

// ==========================================
// Release / Refund Escrow
// ==========================================

/**
 * Release escrow — marks remaining balance as released (e.g., on mission completion)
 */
export async function releaseEscrow(
  escrowId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: escrow, error: fetchErr } = await supabaseAdmin
      .from('compute_escrow')
      .select('status')
      .eq('id', escrowId)
      .single();

    if (fetchErr || !escrow) {
      return { success: false, error: 'Escrow not found' };
    }

    if (escrow.status === 'released' || escrow.status === 'refunded') {
      return { success: false, error: `Escrow already ${escrow.status}` };
    }

    await supabaseAdmin
      .from('compute_escrow')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
      })
      .eq('id', escrowId);

    return { success: true };
  } catch (error) {
    console.error('[Escrow] releaseEscrow error:', error);
    return { success: false, error: 'Internal error releasing escrow' };
  }
}

/**
 * Refund escrow — returns remaining balance to sponsor
 */
export async function refundEscrow(
  escrowId: string
): Promise<{ success: boolean; refundAmount?: string; error?: string }> {
  try {
    const { data: escrow, error: fetchErr } = await supabaseAdmin
      .from('compute_escrow')
      .select('remaining_usdc, status')
      .eq('id', escrowId)
      .single();

    if (fetchErr || !escrow) {
      return { success: false, error: 'Escrow not found' };
    }

    if (escrow.status === 'refunded') {
      return { success: false, error: 'Escrow already refunded' };
    }
    if (escrow.status === 'released') {
      return { success: false, error: 'Escrow already released, cannot refund' };
    }

    const refundAmount = String(escrow.remaining_usdc ?? 0);

    await supabaseAdmin
      .from('compute_escrow')
      .update({
        status: 'refunded',
        remaining_usdc: 0,
      })
      .eq('id', escrowId);

    return { success: true, refundAmount };
  } catch (error) {
    console.error('[Escrow] refundEscrow error:', error);
    return { success: false, error: 'Internal error refunding escrow' };
  }
}

// ==========================================
// Query
// ==========================================

/**
 * Get escrow by ID
 */
export async function getEscrow(escrowId: string): Promise<ComputeEscrow | null> {
  const { data, error } = await supabaseAdmin
    .from('compute_escrow')
    .select('*')
    .eq('id', escrowId)
    .single();

  if (error || !data) return null;
  return mapEscrow(data);
}

/**
 * List escrows for a sponsor or mission
 */
export async function listEscrows(params: {
  sponsorAgentId?: string;
  missionId?: string;
  status?: string;
  limit?: number;
}): Promise<ComputeEscrow[]> {
  let query = supabaseAdmin
    .from('compute_escrow')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params.limit || 20);

  if (params.sponsorAgentId) {
    query = query.eq('sponsor_agent_id', params.sponsorAgentId);
  }
  if (params.missionId) {
    query = query.eq('mission_id', params.missionId);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapEscrow);
}

/**
 * Get escrow draws for a session
 */
export async function getSessionDraws(sessionId: string): Promise<EscrowDraw[]> {
  const { data, error } = await supabaseAdmin
    .from('escrow_draws')
    .select('id, escrow_id, session_id, agent_id, amount_usdc, receipt_id, description, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((d: Record<string, unknown>) => ({
    id: d.id as string,
    escrowId: d.escrow_id as string,
    sessionId: d.session_id as string,
    agentId: d.agent_id as string,
    amountUsdc: String(d.amount_usdc ?? 0),
    receiptId: d.receipt_id as string | null,
    description: d.description as string | null,
    createdAt: d.created_at as string,
  }));
}

// ==========================================
// Helpers
// ==========================================

function mapEscrow(data: Record<string, unknown>): ComputeEscrow {
  return {
    id: data.id as string,
    sponsorAgentId: data.sponsor_agent_id as string,
    sponsorAgentName: data.sponsor_agent_name as string,
    missionId: data.mission_id as string | null,
    taskId: data.task_id as string | null,
    totalBudgetUsdc: String(data.total_budget_usdc ?? 0),
    spentUsdc: String(data.spent_usdc ?? 0),
    remainingUsdc: String(data.remaining_usdc ?? 0),
    status: data.status as ComputeEscrow['status'],
    maxPerSessionUsdc: data.max_per_session_usdc != null ? String(data.max_per_session_usdc) : null,
    allowedAgentIds: (data.allowed_agent_ids as string[]) || [],
    fundTxHash: data.fund_tx_hash as string | null,
    releaseTxHash: data.release_tx_hash as string | null,
    refundTxHash: data.refund_tx_hash as string | null,
    createdAt: data.created_at as string,
    releasedAt: data.released_at as string | null,
    expiresAt: data.expires_at as string | null,
    metadata: (data.metadata as Record<string, unknown>) || {},
  };
}
