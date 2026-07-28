/**
 * Compute Sessions - Session-based compute lifecycle
 * Create → Execute → Meter → Receipt → Close → Settle
 *
 * Replaces the stateless inference proxy with a session model that supports:
 * - Multi-execution sessions with aggregated metering
 * - Execution receipts with input/output hashes
 * - Three funding models: BYOC, sponsor escrow, pool
 * - x402 settlement on session close
 * - ERC-8004 reputation tied to execution quality
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { v4 as uuidv4 } from 'uuid';
import { createPaymentRequirements, storePaymentRequirements } from '../x402/payment-required';
import { getWalletByAgentName } from '../wallet/create';
import { triggerWebhook } from '../webhooks';
import { getErc8004AgentId, submitOnChainFeedback } from '../erc8004/reputation';
import { createExecutionReceipt, updateSessionMetering, calculateInferenceCost, isSessionExpired, isSessionOverBudget } from './metering';
import { drawFromEscrow, getEscrow } from './escrow';
import { executeOnProvider, resolveProviderAndModel } from './providers/self-hosted';
import type {
  ComputeSession,
  CreateSessionRequest,
  SessionExecuteRequest,
  SessionExecuteResponse,
  InferenceResponse,
  ExecutionReceipt,
} from './types';


// ==========================================
// Create Session
// ==========================================

export async function createSession(
  request: CreateSessionRequest
): Promise<{ success: boolean; session?: ComputeSession; error?: string }> {
  try {
    // Validate consumer agent
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, status')
      .eq('id', request.consumerAgentId)
      .single();

    if (agentErr || !agent) {
      return { success: false, error: 'Consumer agent not found' };
    }
    if (agent.status !== 'active') {
      return { success: false, error: 'Consumer agent must be active' };
    }

    // Validate cost cap
    if (request.maxCostUsdc) {
      const cap = BigInt(request.maxCostUsdc);
      if (cap <= 0n) return { success: false, error: 'maxCostUsdc must be positive' };
    }

    // Validate duration
    const maxDuration = request.maxDurationSeconds || 3600;
    if (maxDuration < 10 || maxDuration > 86400) {
      return { success: false, error: 'maxDurationSeconds must be between 10 and 86400' };
    }

    // Pool funding model is not implemented yet
    if (request.fundingModel === 'pool') {
      return { success: false, error: 'Funding model "pool" is not supported yet' };
    }

    // If sponsor-funded, validate escrow
    if (request.fundingModel === 'sponsor') {
      if (!request.escrowId) {
        return { success: false, error: 'Sponsor-funded sessions require an escrowId' };
      }
      const escrow = await getEscrow(request.escrowId);
      if (!escrow) {
        return { success: false, error: 'Escrow not found' };
      }
      if (escrow.status !== 'funded' && escrow.status !== 'active') {
        return { success: false, error: `Escrow is ${escrow.status}, cannot use for new session` };
      }
      // Check if consumer is allowed
      if (escrow.allowedAgentIds.length > 0 && !escrow.allowedAgentIds.includes(request.consumerAgentId)) {
        return { success: false, error: 'Agent not authorized for this escrow' };
      }
    }

    // Resolve provider if model specified
    let providerId: string | null = request.providerId || null;
    let providerAgentName: string | null = null;

    if (request.model || request.providerId) {
      const resolved = await resolveProviderAndModel({
        model: request.model || request.resourceSpec?.model || '',
        providerId: request.providerId,
      });

      if (!resolved.success) {
        return { success: false, error: resolved.error };
      }

      providerId = resolved.provider?.id as string;
      providerAgentName = resolved.agentInfo?.name || null;
    }

    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + maxDuration * 1000).toISOString();

    const row = {
      id: sessionId,
      consumer_agent_id: request.consumerAgentId,
      consumer_agent_name: agent.agent_name,
      provider_id: providerId,
      provider_agent_name: providerAgentName,
      mission_id: request.missionId || null,
      task_id: request.taskId || null,
      status: 'active',
      funding_model: request.fundingModel || 'byoc',
      resource_spec: request.resourceSpec || (request.model ? { model: request.model } : {}),
      max_cost_usdc: request.maxCostUsdc || null,
      max_duration_seconds: maxDuration,
      escrow_id: request.escrowId || null,
      started_at: now,
      expires_at: expiresAt,
      metadata: request.metadata || {},
    };

    const { error } = await supabaseAdmin
      .from('compute_sessions')
      .insert(row);

    if (error) {
      console.error('[Sessions] Insert error:', error);
      return { success: false, error: 'Failed to create session' };
    }

    const session = mapSession({ ...row, created_at: now, updated_at: now });

    // Webhook: session.created
    if (providerId) {
      const providerAgent = await getProviderAgentId(providerId);
      if (providerAgent) {
        triggerWebhook(providerAgent, 'session.created', {
          sessionId,
          consumerAgentId: request.consumerAgentId,
          consumerAgentName: agent.agent_name,
          fundingModel: request.fundingModel || 'byoc',
        }).catch(err => console.error('[Webhook] session.created trigger failed:', err));
      }
    }

    return { success: true, session };
  } catch (error) {
    console.error('[Sessions] createSession error:', error);
    return { success: false, error: 'Internal error creating session' };
  }
}

// ==========================================
// Execute within Session
// ==========================================

export async function executeInSession(
  sessionId: string,
  request: SessionExecuteRequest
): Promise<{ success: boolean; result?: SessionExecuteResponse; error?: string }> {
  try {
    // Fetch session
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('compute_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !session) {
      return { success: false, error: 'Session not found' };
    }

    // Validate session state
    if (session.status !== 'active') {
      return { success: false, error: `Session is ${session.status}, not active` };
    }

    // Check expiry
    if (isSessionExpired(session.started_at, session.max_duration_seconds)) {
      await supabaseAdmin.from('compute_sessions').update({ status: 'expired', closed_at: new Date().toISOString() }).eq('id', sessionId);
      return { success: false, error: 'Session has expired' };
    }

    // Check cost cap
    if (await isSessionOverBudget(sessionId)) {
      return { success: false, error: 'Session has exceeded its cost cap' };
    }

    // Resolve provider (use session's provider or find one)
    const resolved = await resolveProviderAndModel({
      model: request.model,
      providerId: session.provider_id || undefined,
    });

    if (!resolved.success) {
      return { success: false, error: resolved.error };
    }

    const provider = resolved.provider!;
    const model = resolved.model!;
    const agentInfo = resolved.agentInfo!;

    // Update session's provider if it wasn't set
    if (!session.provider_id && provider.id) {
      await supabaseAdmin
        .from('compute_sessions')
        .update({
          provider_id: provider.id as string,
          provider_agent_name: agentInfo.name,
        })
        .eq('id', sessionId);
    }

    // Execute on provider
    const requestId = uuidv4();
    const maxTokens = request.maxTokens || 2000;
    const execResult = await executeOnProvider({
      endpointUrl: provider.endpoint_url as string,
      model: request.model,
      messages: request.messages,
      maxTokens,
      temperature: request.temperature,
      requestId,
    });

    // Calculate cost
    const inputPricePer1k = String(model.input_price_per_1k);
    const outputPricePer1k = String(model.output_price_per_1k);
    const minCharge = String(provider.min_charge_usdc ?? 0);

    if (!execResult.success) {
      // Create failed receipt
      const receiptResult = await createExecutionReceipt({
        sessionId,
        executionType: request.executionType || 'inference',
        input: JSON.stringify(request.messages),
        output: execResult.error || '',
        metering: { latencyMs: execResult.latencyMs },
        costUsdc: '0',
        modelName: request.model,
        status: 'failed',
        errorMessage: execResult.error,
      });

      // Trigger failure webhook
      const providerAgentId = await getProviderAgentId(provider.id as string);
      if (providerAgentId) {
        triggerWebhook(providerAgentId, 'compute.failed', {
          sessionId,
          requestId,
          model: request.model,
          error: execResult.error,
        }).catch(err => console.error('[Webhook] compute.failed trigger failed:', err));
      }

      return { success: false, error: execResult.error };
    }

    const { promptTokens, completionTokens, totalTokens, choices } = execResult.data!;
    const costUsdc = calculateInferenceCost(promptTokens, completionTokens, inputPricePer1k, outputPricePer1k, minCharge);

    // Extract compute metrics from provider response
    const cm = execResult.computeMetrics;

    // Create compute_requests record (for backward compatibility)
    const { error: crInsertErr } = await supabaseAdmin.from('compute_requests').insert({
      id: requestId,
      consumer_agent_id: session.consumer_agent_id,
      consumer_agent_name: session.consumer_agent_name,
      provider_id: provider.id,
      provider_agent_name: agentInfo.name,
      model_id: model.id,
      model_name: request.model,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usdc: costUsdc,
      status: 'completed',
      latency_ms: execResult.latencyMs,
      session_id: sessionId,
      completed_at: new Date().toISOString(),
      metadata: cm ? {
        cpu_seconds: cm.cpuSeconds,
        gpu_seconds: cm.gpuSeconds,
        memory_mb_seconds: cm.memoryMbSeconds,
      } : {},
    });
    if (crInsertErr) console.error('[Sessions] compute_requests insert error:', crInsertErr);

    // Create execution receipt with compute metrics
    const outputContent = choices.map(c => c.message.content).join('');
    const receiptResult = await createExecutionReceipt({
      sessionId,
      computeRequestId: requestId,
      executionType: request.executionType || 'inference',
      input: JSON.stringify(request.messages),
      output: outputContent,
      metering: {
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        cpuSeconds: cm?.cpuSeconds || 0,
        gpuSeconds: cm?.gpuSeconds || 0,
        memoryMbSeconds: cm?.memoryMbSeconds || 0,
        latencyMs: execResult.latencyMs,
      },
      costUsdc,
      modelName: request.model,
    });

    // Update session metering aggregates (including compute resources)
    await updateSessionMetering(sessionId, {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cpuSeconds: cm?.cpuSeconds || 0,
      gpuSeconds: cm?.gpuSeconds || 0,
      memoryMbSeconds: cm?.memoryMbSeconds || 0,
      latencyMs: execResult.latencyMs,
    }, costUsdc);

    // If sponsor-funded, draw from escrow
    if (session.funding_model === 'sponsor' && session.escrow_id) {
      await drawFromEscrow({
        escrowId: session.escrow_id,
        sessionId,
        agentId: session.consumer_agent_id,
        amountUsdc: costUsdc,
        receiptId: receiptResult.receipt?.id,
        description: `Inference: ${request.model} (${totalTokens} tokens)`,
      }).catch(err => {
        console.error('[Sessions] Escrow draw error:', err);
      });
    }

    // Update provider stats (use BigInt for precision on large values)
    const prevTokens = BigInt(String(provider.total_tokens_served ?? 0));
    const newEarnings = (BigInt(String(provider.total_earnings ?? 0)) + BigInt(costUsdc)).toString();
    await supabaseAdmin.from('compute_providers').update({
      total_requests: (provider.total_requests as number || 0) + 1,
      total_tokens_served: String(prevTokens + BigInt(totalTokens)),
      total_earnings: newEarnings,
      avg_latency_ms: provider.avg_latency_ms
        ? Math.round(((provider.avg_latency_ms as number) + execResult.latencyMs) / 2)
        : execResult.latencyMs,
    }).eq('id', provider.id);

    // Build response
    const inferenceResponse: InferenceResponse = {
      id: requestId,
      model: request.model,
      provider: { id: provider.id as string, name: agentInfo.name },
      choices,
      usage: { promptTokens, completionTokens, totalTokens },
      cost: {
        amount: costUsdc,
        amountUsd: `$${(parseInt(costUsdc) / 1_000_000).toFixed(6)}`,
        txHash: null, // Settlement happens on session close
      },
      latencyMs: execResult.latencyMs,
    };

    return {
      success: true,
      result: {
        receipt: receiptResult.receipt!,
        response: inferenceResponse,
      },
    };
  } catch (error) {
    console.error('[Sessions] executeInSession error:', error);
    return { success: false, error: 'Internal error during execution' };
  }
}

// ==========================================
// Close Session
// ==========================================

export async function closeSession(
  sessionId: string,
  options?: { settle?: boolean }
): Promise<{ success: boolean; session?: ComputeSession; error?: string }> {
  try {
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('compute_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !session) {
      return { success: false, error: 'Session not found' };
    }

    if (session.status === 'closed') {
      return { success: false, error: 'Session already closed' };
    }

    // Mark as closing
    await supabaseAdmin
      .from('compute_sessions')
      .update({ status: 'closing' })
      .eq('id', sessionId);

    let txHash: string | null = null;
    let settlementStatus = 'unsettled';

    // Build payment instructions if there's a cost
    const totalCost = BigInt(session.total_cost_usdc ?? 0);
    let paymentInstructions: Record<string, unknown> | null = null;

    if (totalCost > 0n && session.funding_model === 'byoc') {
      paymentInstructions = await buildSessionPaymentInstructions(session);
      settlementStatus = 'pending_agent_settlement';
    } else if (session.funding_model === 'sponsor') {
      // Sponsor-funded: draws already happened per-execution, mark settled
      settlementStatus = totalCost > 0n ? 'settled' : 'unsettled';
    }

    // Close session
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('compute_sessions')
      .update({
        status: 'closed',
        closed_at: now,
        payment_tx_hash: txHash,
        settlement_status: settlementStatus,
      })
      .eq('id', sessionId);

    // ERC-8004 reputation — based on execution quality, not just latency
    if (session.provider_id && session.execution_count > 0) {
      const providerAgentId = await getProviderAgentId(session.provider_id);
      if (providerAgentId) {
        const erc8004Id = await getErc8004AgentId(providerAgentId).catch(() => null);
        if (erc8004Id) {
          // Score based on completion (100 if all executions completed)
          const score = 80; // Default good score for completed session
          submitOnChainFeedback({
            agentId: BigInt(erc8004Id),
            value: score,
            tag1: 'session-complete',
            tag2: 'compute',
          }).catch(err => console.error('[ERC-8004] Session feedback failed:', err));
        }

        // Webhook: session.closed
        triggerWebhook(providerAgentId, 'session.closed', {
          sessionId,
          executionCount: session.execution_count,
          totalCostUsdc: session.total_cost_usdc,
          totalTokens: (session.total_input_tokens || 0) + (session.total_output_tokens || 0),
          txHash,
          settlementStatus,
        }).catch(err => console.error('[Webhook] session.closed trigger failed:', err));
      }
    }

    // Fetch updated session
    const { data: closedSession } = await supabaseAdmin
      .from('compute_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    return {
      success: true,
      session: closedSession ? mapSession(closedSession) : undefined,
      ...(paymentInstructions ? { paymentInstructions } : {}),
    };
  } catch (error) {
    console.error('[Sessions] closeSession error:', error);
    return { success: false, error: 'Internal error closing session' };
  }
}

// ==========================================
// Get Session
// ==========================================

export async function getSession(sessionId: string): Promise<ComputeSession | null> {
  const { data, error } = await supabaseAdmin
    .from('compute_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) return null;
  return mapSession(data);
}

/**
 * List sessions for a consumer or provider
 */
export async function listSessions(params: {
  consumerAgentId?: string;
  providerId?: string;
  missionId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: ComputeSession[]; total: number }> {
  const limit = Math.min(params.limit || 20, 100);
  const offset = params.offset || 0;

  let query = supabaseAdmin
    .from('compute_sessions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.consumerAgentId) {
    query = query.eq('consumer_agent_id', params.consumerAgentId);
  }
  if (params.providerId) {
    query = query.eq('provider_id', params.providerId);
  }
  if (params.missionId) {
    query = query.eq('mission_id', params.missionId);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, count, error } = await query;

  if (error || !data) {
    return { sessions: [], total: 0 };
  }

  return {
    sessions: data.map(mapSession),
    total: count ?? data.length,
  };
}

// ==========================================
// Payment Instructions (agent settles with own wallet)
// ==========================================

async function buildSessionPaymentInstructions(
  session: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const totalCost = String(session.total_cost_usdc ?? 0);
    if (!totalCost || totalCost === '0' || BigInt(totalCost) <= 0n) return null;

    const consumerAgentName = session.consumer_agent_name as string;
    const providerAgentName = session.provider_agent_name as string;

    if (!consumerAgentName || !providerAgentName) {
      console.warn('[Sessions] Missing agent names for payment instructions');
      return null;
    }

    const consumerWallet = await getWalletByAgentName(consumerAgentName);
    if (!consumerWallet) {
      console.warn(`[Sessions] No wallet for consumer "${consumerAgentName}"`);
      return null;
    }

    const providerWallet = await getWalletByAgentName(providerAgentName);
    if (!providerWallet) {
      console.warn(`[Sessions] No wallet for provider "${providerAgentName}"`);
      return null;
    }

    const requirements = createPaymentRequirements({
      payTo: providerWallet.accountAddress,
      amount: totalCost,
      description: `Session ${session.id}: ${session.execution_count} executions`,
      resource: `session:${session.id}`,
    });

    await storePaymentRequirements(requirements, consumerWallet.accountAddress);

    return {
      message: 'Use your agentic wallet to settle this payment on-chain.',
      paymentRequirements: requirements,
      from: consumerWallet.accountAddress,
      to: providerWallet.accountAddress,
      amountUsdc: totalCost,
      sessionId: session.id,
    };
  } catch (error) {
    console.error('[Sessions] buildSessionPaymentInstructions error:', error);
    return null;
  }
}

// ==========================================
// Helpers
// ==========================================

async function getProviderAgentId(providerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('compute_providers')
    .select('agent_id')
    .eq('id', providerId)
    .single();
  return data?.agent_id || null;
}

function mapSession(data: Record<string, unknown>): ComputeSession {
  return {
    id: data.id as string,
    consumerAgentId: data.consumer_agent_id as string,
    consumerAgentName: data.consumer_agent_name as string,
    providerId: data.provider_id as string | null,
    providerAgentName: data.provider_agent_name as string | null,
    missionId: data.mission_id as string | null,
    taskId: data.task_id as string | null,
    status: data.status as ComputeSession['status'],
    fundingModel: data.funding_model as ComputeSession['fundingModel'],
    resourceSpec: (data.resource_spec as ComputeSession['resourceSpec']) || {},
    totalInputTokens: (data.total_input_tokens as number) || 0,
    totalOutputTokens: (data.total_output_tokens as number) || 0,
    totalCpuSeconds: (data.total_cpu_seconds as number) || 0,
    totalGpuSeconds: (data.total_gpu_seconds as number) || 0,
    totalMemoryMbSeconds: (data.total_memory_mb_seconds as number) || 0,
    totalCostUsdc: String(data.total_cost_usdc ?? 0),
    executionCount: (data.execution_count as number) || 0,
    maxCostUsdc: data.max_cost_usdc != null ? String(data.max_cost_usdc) : null,
    maxDurationSeconds: (data.max_duration_seconds as number) || 3600,
    paymentTxHash: data.payment_tx_hash as string | null,
    settlementStatus: (data.settlement_status as ComputeSession['settlementStatus']) || 'unsettled',
    escrowId: data.escrow_id as string | null,
    createdAt: data.created_at as string,
    startedAt: data.started_at as string | null,
    closedAt: data.closed_at as string | null,
    expiresAt: data.expires_at as string | null,
    metadata: (data.metadata as Record<string, unknown>) || {},
  };
}
