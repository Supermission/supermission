/**
 * Self-Hosted Provider Adapter
 * Adapts the existing inference proxy to the session-based compute model.
 * Proxies requests to provider endpoints with metering and receipts.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import type { ChatMessage } from '../types';


const PROXY_TIMEOUT_MS = 25_000; // 25s (Vercel 30s minus 5s margin)

export interface ProviderExecuteParams {
  endpointUrl: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  requestId: string;
}

export interface ComputeMetrics {
  cpuSeconds: number;
  gpuSeconds: number;
  memoryMbSeconds: number;
}

export interface ProviderExecuteResult {
  success: boolean;
  data?: {
    choices: { index: number; message: ChatMessage; finishReason: string }[];
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    rawResponse: Record<string, unknown>;
  };
  computeMetrics?: ComputeMetrics;
  latencyMs: number;
  error?: string;
}

/**
 * Execute an inference request against a self-hosted provider endpoint.
 * Returns parsed OpenAI-compatible response with token counts.
 */
export async function executeOnProvider(
  params: ProviderExecuteParams
): Promise<ProviderExecuteResult> {
  const startTime = Date.now();

  const proxyBody = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.maxTokens,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    response = await fetch(params.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Supermission-Request-ID': params.requestId,
      },
      body: JSON.stringify(proxyBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (fetchErr) {
    const latencyMs = Date.now() - startTime;
    const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Provider unreachable';
    return { success: false, latencyMs, error: `Provider endpoint error: ${errMsg}` };
  }

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'Unknown error');
    return {
      success: false,
      latencyMs,
      error: `Provider returned ${response.status}: ${errBody.slice(0, 200)}`,
    };
  }

  const proxyData = await response.json();

  // Parse X-Compute-Metrics header for real resource usage
  // Expected format: "cpu=1.2,gpu=0.8,memory_mb=512.0"
  const computeMetrics = parseComputeMetricsHeader(response.headers.get('X-Compute-Metrics'));

  // If no metrics header, estimate from wall-clock time
  // Providers that don't support the header get wall-clock-time-based estimates
  const effectiveMetrics = computeMetrics || estimateFromWallClock(latencyMs);

  // Estimate input tokens from message content length
  const estimatedInputTokens = params.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const promptTokens = proxyData.usage?.prompt_tokens || estimatedInputTokens;
  const completionTokens = proxyData.usage?.completion_tokens || 0;
  const totalTokens = promptTokens + completionTokens;

  const choices = proxyData.choices || [{
    index: 0,
    message: { role: 'assistant', content: '' },
    finish_reason: 'stop',
  }];

  return {
    success: true,
    data: {
      choices: choices.map((c: Record<string, unknown>, i: number) => ({
        index: i,
        message: c.message as ChatMessage,
        finishReason: (c.finish_reason as string) || 'stop',
      })),
      promptTokens,
      completionTokens,
      totalTokens,
      rawResponse: proxyData,
    },
    computeMetrics: effectiveMetrics,
    latencyMs,
  };
}

/**
 * Parse the X-Compute-Metrics header from a provider response.
 * Format: "cpu=1.2,gpu=0.8,memory_mb=512.0"
 * Returns null if header is missing or unparseable.
 */
function parseComputeMetricsHeader(headerValue: string | null): ComputeMetrics | null {
  if (!headerValue) return null;

  try {
    const parts = headerValue.split(',');
    const metrics: Record<string, number> = {};

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key && val) {
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) {
          metrics[key.trim()] = num;
        }
      }
    }

    // Require at least one valid metric
    if (Object.keys(metrics).length === 0) return null;

    return {
      cpuSeconds: metrics['cpu'] || 0,
      gpuSeconds: metrics['gpu'] || 0,
      memoryMbSeconds: metrics['memory_mb'] || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Estimate compute metrics from wall-clock time when provider doesn't report.
 * Conservative estimates: 1 CPU-second per second of latency, no GPU assumed.
 */
function estimateFromWallClock(latencyMs: number): ComputeMetrics {
  const seconds = latencyMs / 1000;
  return {
    cpuSeconds: Math.round(seconds * 100) / 100,
    gpuSeconds: 0, // Can't assume GPU usage
    memoryMbSeconds: 0, // Can't estimate without provider data
  };
}

/**
 * Resolve a provider and model from the database for a session execution.
 * Finds the cheapest provider for the model, or a specific provider.
 */
export async function resolveProviderAndModel(params: {
  model: string;
  providerId?: string;
}): Promise<{
  success: boolean;
  provider?: Record<string, unknown>;
  model?: Record<string, unknown>;
  agentInfo?: { id: string; name: string };
  error?: string;
}> {
  if (params.providerId) {
    // Specific provider
    const { data: p } = await supabaseAdmin
      .from('compute_providers')
      .select('*, marketplace_agents!inner(agent_name, id)')
      .eq('id', params.providerId)
      .eq('is_active', true)
      .single();

    if (!p) {
      return { success: false, error: 'Provider not found or inactive' };
    }

    const { data: m } = await supabaseAdmin
      .from('compute_models')
      .select('*')
      .eq('provider_id', p.id)
      .ilike('model_name', params.model)
      .eq('is_active', true)
      .single();

    if (!m) {
      return { success: false, error: `Model "${params.model}" not available on this provider` };
    }

    const agentInfo = p.marketplace_agents as Record<string, unknown>;
    return {
      success: true,
      provider: p,
      model: m,
      agentInfo: {
        id: agentInfo.id as string,
        name: (agentInfo.agent_name as string) || 'unknown',
      },
    };
  }

  // Find cheapest provider
  const { data: models } = await supabaseAdmin
    .from('compute_models')
    .select('*, compute_providers!inner(*, marketplace_agents!inner(agent_name, id))')
    .ilike('model_name', params.model)
    .eq('is_active', true)
    .eq('compute_providers.is_active', true)
    .order('input_price_per_1k', { ascending: true })
    .limit(1);

  if (!models || models.length === 0) {
    return { success: false, error: `No active provider found for model "${params.model}"` };
  }

  const modelRow = models[0];
  const providerRow = modelRow.compute_providers as Record<string, unknown>;
  const agentInfo = providerRow.marketplace_agents as Record<string, unknown>;

  return {
    success: true,
    provider: providerRow,
    model: modelRow,
    agentInfo: {
      id: agentInfo.id as string,
      name: (agentInfo.agent_name as string) || 'unknown',
    },
  };
}
