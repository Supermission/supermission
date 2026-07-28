/**
 * Compute Marketplace - Inference Proxy + x402 Payment
 * Routes LLM requests through provider endpoints, handles payment settlement.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { keccak256, toHex } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { createPaymentRequirements, storePaymentRequirements } from '../x402/payment-required';
import { getWalletByAgentName } from '../wallet/create';
import { triggerWebhook } from '../webhooks';
import { getErc8004AgentId, submitOnChainFeedback } from '../erc8004/reputation';
import type { InferenceRequest, InferenceResponse } from './types';

// ==========================================
// Server-side Token Counting (Honest Metering)
// ==========================================

let _encoder: { encode: (text: string) => number[] } | null = null;

/**
 * Get a tiktoken encoder for server-side token counting.
 * Uses cl100k_base (GPT-4/3.5-turbo encoding) as default.
 * Lazy-loaded and cached.
 */
function getTokenEncoder(): { encode: (text: string) => number[] } {
  if (!_encoder) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getEncoding } = require('js-tiktoken');
      _encoder = getEncoding('cl100k_base');
    } catch {
      // Fallback: rough estimator if js-tiktoken not available at runtime
      _encoder = {
        encode: (text: string) => {
          // ~4 chars per token for English, ~2 for CJK/code
          const len = Math.ceil(text.length / 4);
          return new Array(len);
        },
      };
    }
  }
  return _encoder!;
}

/**
 * Count tokens in a string using server-side tokenizer (not provider-reported)
 */
function countTokens(text: string): number {
  return getTokenEncoder().encode(text).length;
}

/**
 * Count input tokens from chat messages
 */
function countMessageTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;
  for (const msg of messages) {
    // ~4 tokens overhead per message (role, separators)
    total += 4;
    total += countTokens(msg.content);
    total += countTokens(msg.role);
  }
  // 2 tokens for assistant reply priming
  total += 2;
  return total;
}

/**
 * Detect latency anomalies — flag if response is suspiciously fast for the output size.
 * Expected: ~15-50 tokens/sec for large models, ~100+ for small models.
 */
function detectLatencyAnomaly(
  latencyMs: number,
  outputTokens: number,
  modelName: string
): { suspicious: boolean; reason?: string } {
  if (outputTokens <= 0 || latencyMs <= 0) return { suspicious: false };

  const tokensPerSecond = (outputTokens / latencyMs) * 1000;

  // Large models (GPT-4, Claude, etc.) typically max out at ~80 tokens/sec
  // If we see >200 t/s, it's likely cached or fake
  const isLargeModel = /gpt-4|claude|llama-3.*70|mixtral/i.test(modelName);
  const maxReasonableTps = isLargeModel ? 200 : 500;

  if (tokensPerSecond > maxReasonableTps) {
    return {
      suspicious: true,
      reason: `Suspicious speed: ${Math.round(tokensPerSecond)} tokens/sec for ${modelName} (max expected: ${maxReasonableTps})`,
    };
  }

  return { suspicious: false };
}

/**
 * Parse X-Compute-Metrics header. Format: "cpu=1.2,gpu=0.8,memory_mb=512.0"
 */
function parseComputeMetricsHeader(headerValue: string | null): { cpuSeconds: number; gpuSeconds: number; memoryMbSeconds: number } | null {
  if (!headerValue) return null;
  try {
    const metrics: Record<string, number> = {};
    for (const part of headerValue.split(',')) {
      const [key, val] = part.trim().split('=');
      if (key && val) {
        const num = parseFloat(val);
        if (!isNaN(num) && num >= 0) metrics[key.trim()] = num;
      }
    }
    if (Object.keys(metrics).length === 0) return null;
    return {
      cpuSeconds: metrics['cpu'] || 0,
      gpuSeconds: metrics['gpu'] || 0,
      memoryMbSeconds: metrics['memory_mb'] || 0,
    };
  } catch { return null; }
}


const PROXY_TIMEOUT_MS = 25_000; // 25s (Vercel 30s minus 5s margin)

// ==========================================
// Process Inference Request
// ==========================================

export async function processInferenceRequest(
  consumerAgentId: string,
  request: InferenceRequest
): Promise<{ success: boolean; response?: InferenceResponse; error?: string }> {
  const requestId = uuidv4();
  const startTime = Date.now();

  try {
    // 1. Find provider
    let provider: Record<string, unknown> | null = null;
    let model: Record<string, unknown> | null = null;

    if (request.providerId) {
      // Specific provider requested
      const { data: p } = await supabaseAdmin
        .from('compute_providers')
        .select('*, marketplace_agents!inner(agent_name, id)')
        .eq('id', request.providerId)
        .eq('is_active', true)
        .single();
      provider = p;
    } else {
      // Find cheapest active provider for the model
      const { data: models } = await supabaseAdmin
        .from('compute_models')
        .select('*, compute_providers!inner(*, marketplace_agents!inner(agent_name, id))')
        .ilike('model_name', request.model)
        .eq('is_active', true)
        .eq('compute_providers.is_active', true)
        .order('input_price_per_1k', { ascending: true })
        .limit(1);

      if (models && models.length > 0) {
        model = models[0];
        provider = models[0].compute_providers as Record<string, unknown>;
      }
    }

    if (!provider) {
      return { success: false, error: `No active provider found for model "${request.model}"` };
    }

    // 2. Resolve model if not already found
    if (!model) {
      const { data: m } = await supabaseAdmin
        .from('compute_models')
        .select('*')
        .eq('provider_id', provider.id as string)
        .ilike('model_name', request.model)
        .eq('is_active', true)
        .single();

      if (!m) {
        return { success: false, error: `Model "${request.model}" not available on this provider` };
      }
      model = m;
    }

    if (!model) {
      return { success: false, error: `Model "${request.model}" not found` };
    }

    const agentInfo = provider.marketplace_agents as Record<string, unknown>;
    const providerAgentId = agentInfo?.id as string;
    const providerAgentName = (agentInfo?.agent_name as string) || 'unknown';

    // 3. Get consumer agent info
    const { data: consumerAgent } = await supabaseAdmin
      .from('marketplace_agents')
      .select('agent_name')
      .eq('id', consumerAgentId)
      .single();

    const consumerAgentName = consumerAgent?.agent_name || 'unknown';

    // 4. Server-side token counting (don't trust provider's usage stats)
    const serverInputTokens = countMessageTokens(request.messages);
    const maxOutputTokens = request.maxTokens || 2000;
    const inputContentForHash = JSON.stringify(request.messages);
    const inputPrice = parseFloat(String(model.input_price_per_1k));
    const outputPrice = parseFloat(String(model.output_price_per_1k));
    const estimatedCost = Math.ceil((serverInputTokens / 1000) * inputPrice + (maxOutputTokens / 1000) * outputPrice);
    const minCharge = parseInt(String(provider.min_charge_usdc)) || 1000;

    // 5. Create compute_requests record
    const { data: requestRecord, error: insertErr } = await supabaseAdmin
      .from('compute_requests')
      .insert({
        id: requestId,
        consumer_agent_id: consumerAgentId,
        consumer_agent_name: consumerAgentName,
        provider_id: provider.id,
        provider_agent_name: providerAgentName,
        model_id: model.id,
        model_name: request.model,
        status: 'processing',
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[Compute] Request insert error:', insertErr);
      return { success: false, error: 'Failed to create inference request record' };
    }

    // 6. Proxy to provider endpoint
    const endpointUrl = provider.endpoint_url as string;
    const proxyBody = {
      model: request.model,
      messages: request.messages,
      max_tokens: maxOutputTokens,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
    };

    let proxyResponse: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

      proxyResponse = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Supermission-Request-ID': requestId,
        },
        body: JSON.stringify(proxyBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (fetchErr) {
      const latencyMs = Date.now() - startTime;
      const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Provider unreachable';

      // Mark failed
      await supabaseAdmin.from('compute_requests').update({
        status: 'failed',
        error_message: errMsg,
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
      }).eq('id', requestId);

      // Webhook: compute.failed
      triggerWebhook(providerAgentId, 'compute.failed', {
        requestId,
        model: request.model,
        consumerAgentId,
        error: errMsg,
      }).catch(err => console.error('[Webhook] compute.failed trigger failed:', err));

      return { success: false, error: `Provider endpoint error: ${errMsg}` };
    }

    if (!proxyResponse.ok) {
      const latencyMs = Date.now() - startTime;
      const errBody = await proxyResponse.text().catch(() => 'Unknown error');
      const errMsg = `Provider returned ${proxyResponse.status}: ${errBody.slice(0, 200)}`;

      await supabaseAdmin.from('compute_requests').update({
        status: 'failed',
        error_message: errMsg,
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
      }).eq('id', requestId);

      triggerWebhook(providerAgentId, 'compute.failed', {
        requestId,
        model: request.model,
        consumerAgentId,
        error: errMsg,
      }).catch(err => console.error('[Webhook] compute.failed trigger failed:', err));

      return { success: false, error: errMsg };
    }

    // 7. Parse OpenAI-compatible response
    const proxyData = await proxyResponse.json();
    const latencyMs = Date.now() - startTime;

    // 7a-0. Parse X-Compute-Metrics header for real resource usage
    const computeMetrics = parseComputeMetricsHeader(proxyResponse.headers.get('X-Compute-Metrics'));

    // 7a. Server-side output token counting from actual response content
    const outputContent = proxyData.choices?.[0]?.message?.content || '';
    const serverOutputTokens = countTokens(outputContent);

    // Provider-reported values (for comparison only, NOT used for billing)
    const providerInputTokens = proxyData.usage?.prompt_tokens || 0;
    const providerOutputTokens = proxyData.usage?.completion_tokens || 0;

    // Use SERVER-SIDE counts for billing (honest metering)
    const promptTokens = serverInputTokens;
    const completionTokens = serverOutputTokens;
    const totalTokens = promptTokens + completionTokens;

    // 7b. Log discrepancy if provider reports differ significantly (>20%)
    if (providerInputTokens > 0) {
      const inputDiff = Math.abs(serverInputTokens - providerInputTokens) / Math.max(serverInputTokens, 1);
      const outputDiff = Math.abs(serverOutputTokens - providerOutputTokens) / Math.max(serverOutputTokens, 1);
      if (inputDiff > 0.2 || outputDiff > 0.2) {
        console.warn(`[Compute] Token count discrepancy for ${request.model}: ` +
          `server(${serverInputTokens}/${serverOutputTokens}) vs provider(${providerInputTokens}/${providerOutputTokens})`);
      }
    }

    // 7c. Latency anomaly detection
    const anomaly = detectLatencyAnomaly(latencyMs, serverOutputTokens, request.model);
    if (anomaly.suspicious) {
      console.warn(`[Compute] ANOMALY: ${anomaly.reason} — request ${requestId}`);
    }

    // 7d. Hash inputs/outputs for audit trail
    const inputHash = keccak256(toHex(inputContentForHash));
    const outputHash = keccak256(toHex(outputContent || 'empty'));

    // 8. Calculate actual cost using SERVER-counted tokens
    const actualCost = Math.ceil((promptTokens / 1000) * inputPrice + (completionTokens / 1000) * outputPrice);
    const finalCost = Math.max(actualCost, minCharge);
    const finalCostStr = String(finalCost);

    // 9. Build payment instructions (agent settles with own wallet)
    let txHash: string | null = null;
    let paymentInstructions: Record<string, unknown> | null = null;

    try {
      const consumerWallet = await getWalletByAgentName(consumerAgentName);
      const providerWallet = await getWalletByAgentName(providerAgentName);

      if (consumerWallet && providerWallet) {
        const requirements = createPaymentRequirements({
          payTo: providerWallet.accountAddress,
          amount: finalCostStr,
          description: `Inference: ${request.model} (${totalTokens} tokens)`,
          resource: `compute:${requestId}`,
        });

        await storePaymentRequirements(requirements, consumerWallet.accountAddress);

        paymentInstructions = {
          message: 'Use your agentic wallet to settle this payment on-chain.',
          paymentRequirements: requirements,
          from: consumerWallet.accountAddress,
          to: providerWallet.accountAddress,
          amountUsdc: finalCostStr,
          requestId,
        };
      }
    } catch (payErr) {
      console.error('[Compute] Payment instruction error (non-fatal):', payErr);
    }

    // 10. Update records with server-side counts and audit hashes
    await supabaseAdmin.from('compute_requests').update({
      status: 'completed',
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      cost_usdc: finalCostStr,
      payment_tx_hash: txHash,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
      metadata: {
        input_hash: inputHash,
        output_hash: outputHash,
        server_input_tokens: serverInputTokens,
        server_output_tokens: serverOutputTokens,
        provider_input_tokens: providerInputTokens,
        provider_output_tokens: providerOutputTokens,
        anomaly: anomaly.suspicious ? anomaly.reason : null,
        cpu_seconds: computeMetrics?.cpuSeconds || null,
        gpu_seconds: computeMetrics?.gpuSeconds || null,
        memory_mb_seconds: computeMetrics?.memoryMbSeconds || null,
        metrics_source: computeMetrics ? 'provider_header' : 'none',
      },
    }).eq('id', requestId);

    // Update provider stats
    const prevTokens = Number(provider.total_tokens_served || 0);
    const prevEarnings = Number(provider.total_earnings || 0);
    await supabaseAdmin.from('compute_providers').update({
      total_requests: (provider.total_requests as number || 0) + 1,
      total_tokens_served: prevTokens + totalTokens,
      total_earnings: String(prevEarnings + finalCost),
      avg_latency_ms: provider.avg_latency_ms
        ? Math.round(((provider.avg_latency_ms as number) + latencyMs) / 2)
        : latencyMs,
    }).eq('id', provider.id);

    // 11. ERC-8004 feedback (non-blocking)
    const erc8004Id = await getErc8004AgentId(providerAgentId).catch(() => null);
    if (erc8004Id) {
      const score = latencyMs < 500 ? 100 : latencyMs < 1000 ? 80 : latencyMs < 2000 ? 60 : latencyMs < 5000 ? 40 : 20;
      submitOnChainFeedback({
        agentId: BigInt(erc8004Id),
        value: score,
        tag1: 'inference-complete',
        tag2: 'compute',
      }).catch(err => console.error('[ERC-8004] Compute feedback failed:', err));
    }

    // 12. Webhook: compute.completed
    triggerWebhook(providerAgentId, 'compute.completed', {
      requestId,
      model: request.model,
      consumerAgentId,
      consumerAgentName,
      tokens: totalTokens,
      costUsdc: finalCostStr,
      txHash,
      latencyMs,
    }).catch(err => console.error('[Webhook] compute.completed trigger failed:', err));

    // 13. Build response
    const choices = proxyData.choices || [{
      index: 0,
      message: { role: 'assistant', content: '' },
      finish_reason: 'stop',
    }];

    const response: InferenceResponse = {
      id: requestId,
      model: request.model,
      provider: { id: provider.id as string, name: providerAgentName },
      choices: choices.map((c: Record<string, unknown>, i: number) => ({
        index: i,
        message: c.message as InferenceResponse['choices'][0]['message'],
        finishReason: (c.finish_reason as string) || 'stop',
      })),
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      cost: {
        amount: finalCostStr,
        amountUsd: `$${(finalCost / 1_000_000).toFixed(6)}`,
        txHash,
        ...(paymentInstructions ? { paymentInstructions } : {}),
      },
      latencyMs,
    };

    return { success: true, response };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : 'Unknown inference error';
    console.error('[Compute] processInferenceRequest error:', errMsg);

    // Try to mark request as failed
    try {
      await supabaseAdmin.from('compute_requests').update({
        status: 'failed',
        error_message: errMsg,
        latency_ms: latencyMs,
        completed_at: new Date().toISOString(),
      }).eq('id', requestId);
    } catch { /* ignore cleanup errors */ }

    return { success: false, error: errMsg };
  }
}
