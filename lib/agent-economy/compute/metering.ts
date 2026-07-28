/**
 * Compute Metering - Resource measurement and execution receipt generation
 * Tracks CPU, GPU, memory, tokens per execution within a session.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { keccak256, toHex } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionReceipt, ExecutionType } from './types';


// ==========================================
// Receipt Generation
// ==========================================

export interface MeteringData {
  inputTokens?: number;
  outputTokens?: number;
  cpuSeconds?: number;
  gpuSeconds?: number;
  memoryMbSeconds?: number;
  latencyMs?: number;
}

export interface CreateReceiptParams {
  sessionId: string;
  computeRequestId?: string;
  executionType: ExecutionType;
  input: string;
  output: string;
  metering: MeteringData;
  costUsdc: string;
  modelName?: string;
  status?: 'completed' | 'failed';
  errorMessage?: string;
}

/**
 * Hash content for execution receipts using keccak256
 */
function hashContent(content: string): string {
  return keccak256(toHex(content));
}

/**
 * Create an execution receipt for a single execution within a session
 */
export async function createExecutionReceipt(
  params: CreateReceiptParams
): Promise<{ success: boolean; receipt?: ExecutionReceipt; error?: string }> {
  try {
    const receiptId = uuidv4();
    const now = new Date().toISOString();
    const status = params.status || 'completed';

    const inputHash = hashContent(params.input);
    const outputHash = hashContent(params.output);

    const row = {
      id: receiptId,
      session_id: params.sessionId,
      compute_request_id: params.computeRequestId || null,
      execution_type: params.executionType,
      input_hash: inputHash,
      output_hash: outputHash,
      input_tokens: params.metering.inputTokens || 0,
      output_tokens: params.metering.outputTokens || 0,
      cpu_seconds: params.metering.cpuSeconds || 0,
      gpu_seconds: params.metering.gpuSeconds || 0,
      memory_mb_seconds: params.metering.memoryMbSeconds || 0,
      cost_usdc: params.costUsdc,
      latency_ms: params.metering.latencyMs || null,
      model_name: params.modelName || null,
      status,
      error_message: params.errorMessage || null,
      completed_at: status === 'completed' ? now : null,
    };

    const { error } = await supabaseAdmin
      .from('execution_receipts')
      .insert(row);

    if (error) {
      console.error('[Metering] Receipt insert error:', error);
      return { success: false, error: 'Failed to create execution receipt' };
    }

    const receipt: ExecutionReceipt = {
      id: receiptId,
      sessionId: params.sessionId,
      computeRequestId: params.computeRequestId || null,
      executionType: params.executionType,
      inputHash,
      outputHash,
      inputTokens: params.metering.inputTokens || 0,
      outputTokens: params.metering.outputTokens || 0,
      cpuSeconds: params.metering.cpuSeconds || 0,
      gpuSeconds: params.metering.gpuSeconds || 0,
      memoryMbSeconds: params.metering.memoryMbSeconds || 0,
      costUsdc: params.costUsdc,
      latencyMs: params.metering.latencyMs || null,
      providerSignature: null,
      modelName: params.modelName || null,
      status,
      errorMessage: params.errorMessage || null,
      createdAt: now,
      completedAt: status === 'completed' ? now : null,
    };

    return { success: true, receipt };
  } catch (error) {
    console.error('[Metering] createExecutionReceipt error:', error);
    return { success: false, error: 'Internal error creating receipt' };
  }
}

// ==========================================
// Session Metering Aggregation
// ==========================================

/**
 * Update session-level metering aggregates after an execution
 */
export async function updateSessionMetering(
  sessionId: string,
  metering: MeteringData,
  costUsdc: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch current session aggregates
    const { data: session, error: fetchErr } = await supabaseAdmin
      .from('compute_sessions')
      .select('total_input_tokens, total_output_tokens, total_cpu_seconds, total_gpu_seconds, total_memory_mb_seconds, total_cost_usdc, execution_count, max_cost_usdc')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !session) {
      return { success: false, error: 'Session not found' };
    }

    const newTotalCost = (BigInt(session.total_cost_usdc ?? 0) + BigInt(costUsdc || '0')).toString();

    const { error: updateErr } = await supabaseAdmin
      .from('compute_sessions')
      .update({
        total_input_tokens: (session.total_input_tokens || 0) + (metering.inputTokens || 0),
        total_output_tokens: (session.total_output_tokens || 0) + (metering.outputTokens || 0),
        total_cpu_seconds: (session.total_cpu_seconds || 0) + (metering.cpuSeconds || 0),
        total_gpu_seconds: (session.total_gpu_seconds || 0) + (metering.gpuSeconds || 0),
        total_memory_mb_seconds: (session.total_memory_mb_seconds || 0) + (metering.memoryMbSeconds || 0),
        total_cost_usdc: newTotalCost,
        execution_count: (session.execution_count || 0) + 1,
      })
      .eq('id', sessionId);

    if (updateErr) {
      console.error('[Metering] Session aggregate update error:', updateErr);
      return { success: false, error: 'Failed to update session metering' };
    }

    return { success: true };
  } catch (error) {
    console.error('[Metering] updateSessionMetering error:', error);
    return { success: false, error: 'Internal error updating session metering' };
  }
}

/**
 * Check if a session has exceeded its cost cap
 */
export async function isSessionOverBudget(sessionId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('compute_sessions')
    .select('total_cost_usdc, max_cost_usdc')
    .eq('id', sessionId)
    .single();

  if (!data || !data.max_cost_usdc) return false;

  return BigInt(data.total_cost_usdc ?? 0) >= BigInt(data.max_cost_usdc ?? 0);
}

/**
 * Check if a session has expired based on duration
 */
export function isSessionExpired(startedAt: string | null, maxDurationSeconds: number): boolean {
  if (!startedAt) return false;
  const startMs = new Date(startedAt).getTime();
  const nowMs = Date.now();
  return (nowMs - startMs) / 1000 > maxDurationSeconds;
}

// ==========================================
// Cost Calculation
// ==========================================

/**
 * Calculate cost for an inference execution based on token counts and model pricing
 */
export function calculateInferenceCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePer1k: string,
  outputPricePer1k: string,
  minChargeUsdc: string = '0'
): string {
  const inputPrice = parseFloat(inputPricePer1k);
  const outputPrice = parseFloat(outputPricePer1k);
  const actualCost = Math.ceil((inputTokens / 1000) * inputPrice + (outputTokens / 1000) * outputPrice);
  const minCharge = parseInt(minChargeUsdc) || 0;
  return String(Math.max(actualCost, minCharge));
}

/**
 * Get execution receipts for a session
 */
export async function getSessionReceipts(
  sessionId: string,
  limit: number = 50
): Promise<ExecutionReceipt[]> {
  const { data, error } = await supabaseAdmin
    .from('execution_receipts')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map(mapReceipt);
}

function mapReceipt(r: Record<string, unknown>): ExecutionReceipt {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    computeRequestId: r.compute_request_id as string | null,
    executionType: r.execution_type as ExecutionReceipt['executionType'],
    inputHash: r.input_hash as string | null,
    outputHash: r.output_hash as string | null,
    inputTokens: (r.input_tokens as number) || 0,
    outputTokens: (r.output_tokens as number) || 0,
    cpuSeconds: (r.cpu_seconds as number) || 0,
    gpuSeconds: (r.gpu_seconds as number) || 0,
    memoryMbSeconds: (r.memory_mb_seconds as number) || 0,
    costUsdc: String(r.cost_usdc ?? 0),
    latencyMs: r.latency_ms as number | null,
    providerSignature: r.provider_signature as string | null,
    modelName: r.model_name as string | null,
    status: r.status as ExecutionReceipt['status'],
    errorMessage: r.error_message as string | null,
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | null,
  };
}
