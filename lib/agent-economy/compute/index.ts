/**
 * Compute Marketplace - Provider CRUD + Discovery
 * Agents register inference endpoints, consumers discover and compare.
 */

import { supabaseAdmin } from '@/lib/supabase/client';
import { sanitizeInput } from '../utils/sanitize';
import type {
  ComputeProvider,
  ComputeModel,
  RegisterComputeProviderRequest,
  UpdateComputeProviderRequest,
  ListProvidersOptions,
  AvailableModel,
  ComputeUsage,
} from './types';


// ==========================================
// Register Provider
// ==========================================

export async function registerComputeProvider(
  request: RegisterComputeProviderRequest
): Promise<{ success: boolean; providerId?: string; error?: string }> {
  try {
    // Validate agent exists and is active
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, status')
      .eq('id', request.agentId)
      .single();

    if (agentErr || !agent) {
      return { success: false, error: 'Agent not found in marketplace' };
    }
    if (agent.status !== 'active') {
      return { success: false, error: 'Agent must be active to register as compute provider' };
    }

    // Validate endpoint URL is HTTPS
    try {
      const url = new URL(request.endpointUrl);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        return { success: false, error: 'Endpoint URL must use HTTPS' };
      }
    } catch {
      return { success: false, error: 'Invalid endpoint URL' };
    }

    // Validate at least 1 model
    if (!request.models || request.models.length === 0) {
      return { success: false, error: 'At least one model is required' };
    }
    if (request.models.length > 50) {
      return { success: false, error: 'Maximum 50 models allowed' };
    }

    // Validate each model
    for (const model of request.models) {
      if (!model.modelName || model.modelName.length > 100) {
        return { success: false, error: 'Model name is required and must be 100 characters or fewer' };
      }
      const inputPrice = parseFloat(model.inputPricePer1k);
      const outputPrice = parseFloat(model.outputPricePer1k);
      if (isNaN(inputPrice) || inputPrice < 0) {
        return { success: false, error: `Invalid input price for model ${model.modelName}` };
      }
      if (isNaN(outputPrice) || outputPrice < 0) {
        return { success: false, error: `Invalid output price for model ${model.modelName}` };
      }
    }

    // Validate provider type
    const validTypes = ['self_hosted', 'cloud', 'decentralized'];
    if (request.providerType && !validTypes.includes(request.providerType)) {
      return { success: false, error: 'Provider type must be one of: self_hosted, cloud, decentralized' };
    }

    // Check for existing provider (1:1 with agent)
    const { data: existing } = await supabaseAdmin
      .from('compute_providers')
      .select('id')
      .eq('agent_id', request.agentId)
      .single();

    if (existing) {
      return { success: false, error: 'Agent already has a compute provider registered. Use PUT to update.' };
    }

    // Insert provider
    const { data: provider, error: providerErr } = await supabaseAdmin
      .from('compute_providers')
      .insert({
        agent_id: request.agentId,
        endpoint_url: sanitizeInput(request.endpointUrl),
        rate_limit_rpm: request.rateLimitRpm ?? 60,
        min_charge_usdc: request.minChargeUsdc ?? 1000,
        supported_features: request.supportedFeatures ?? [],
        provider_type: request.providerType ?? 'self_hosted',
        infra_details: request.infraDetails ?? {},
      })
      .select('id')
      .single();

    if (providerErr || !provider) {
      console.error('[Compute] Provider insert error:', providerErr);
      return { success: false, error: 'Failed to register compute provider' };
    }

    // Insert models
    const modelRows = request.models.map((m) => ({
      provider_id: provider.id,
      model_name: sanitizeInput(m.modelName),
      display_name: m.displayName ? sanitizeInput(m.displayName) : null,
      input_price_per_1k: m.inputPricePer1k,
      output_price_per_1k: m.outputPricePer1k,
      max_context_length: m.maxContextLength ?? 128000,
      metadata: m.metadata ?? {},
    }));

    const { error: modelsErr } = await supabaseAdmin
      .from('compute_models')
      .insert(modelRows);

    if (modelsErr) {
      console.error('[Compute] Models insert error:', modelsErr);
      // Rollback provider
      await supabaseAdmin.from('compute_providers').delete().eq('id', provider.id);
      return { success: false, error: 'Failed to register models' };
    }

    // Update agent capabilities to include "compute-provider"
    const { data: agentData } = await supabaseAdmin
      .from('marketplace_agents')
      .select('capabilities')
      .eq('id', request.agentId)
      .single();

    if (agentData) {
      const caps: string[] = agentData.capabilities || [];
      if (!caps.includes('compute-provider')) {
        await supabaseAdmin
          .from('marketplace_agents')
          .update({ capabilities: [...caps, 'compute-provider'] })
          .eq('id', request.agentId);
      }
    }

    return { success: true, providerId: provider.id };
  } catch (error) {
    console.error('[Compute] registerComputeProvider error:', error);
    return { success: false, error: 'Internal error registering compute provider' };
  }
}

// ==========================================
// List Providers
// ==========================================

export async function listComputeProviders(
  options: ListProvidersOptions = {}
): Promise<{ providers: ComputeProvider[]; total: number }> {
  try {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    // Query providers with agent join
    let query = supabaseAdmin
      .from('compute_providers')
      .select('*, marketplace_agents!inner(agent_name, rating)', { count: 'exact' })
      .eq('is_active', true);

    if (options.providerType) {
      query = query.eq('provider_type', options.providerType);
    }
    if (options.feature) {
      query = query.contains('supported_features', [options.feature]);
    }

    // Sort
    switch (options.sortBy) {
      case 'reputation':
        query = query.order('marketplace_agents(rating)', { ascending: false });
        break;
      case 'requests':
        query = query.order('total_requests', { ascending: false });
        break;
      case 'latency':
        query = query.order('avg_latency_ms', { ascending: true, nullsFirst: false });
        break;
      default:
        query = query.order('total_requests', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data: providers, count, error } = await query;

    if (error) {
      console.error('[Compute] List providers error:', error);
      return { providers: [], total: 0 };
    }

    if (!providers || providers.length === 0) {
      return { providers: [], total: 0 };
    }

    // Fetch models for these providers
    const providerIds = providers.map((p: Record<string, unknown>) => p.id as string);
    let modelsQuery = supabaseAdmin
      .from('compute_models')
      .select('*')
      .in('provider_id', providerIds)
      .eq('is_active', true);

    if (options.model) {
      modelsQuery = modelsQuery.ilike('model_name', `%${options.model}%`);
    }

    const { data: models } = await modelsQuery;

    // Group models by provider
    const modelsByProvider = new Map<string, ComputeModel[]>();
    for (const m of (models || [])) {
      const providerId = m.provider_id as string;
      if (!modelsByProvider.has(providerId)) {
        modelsByProvider.set(providerId, []);
      }
      modelsByProvider.get(providerId)!.push({
        id: m.id,
        providerId: m.provider_id,
        modelName: m.model_name,
        displayName: m.display_name,
        inputPricePer1k: m.input_price_per_1k,
        outputPricePer1k: m.output_price_per_1k,
        maxContextLength: m.max_context_length,
        isActive: m.is_active,
        metadata: m.metadata || {},
      });
    }

    // Filter out providers with no matching models if model filter is active
    const result: ComputeProvider[] = [];
    for (const p of providers) {
      const pModels = modelsByProvider.get(p.id as string) || [];
      if (options.model && pModels.length === 0) continue;

      // Filter by max input price
      if (options.maxInputPrice) {
        const maxPrice = parseFloat(options.maxInputPrice);
        const hasAffordable = pModels.some((m) => parseFloat(m.inputPricePer1k) <= maxPrice);
        if (!hasAffordable) continue;
      }

      const agentInfo = p.marketplace_agents as Record<string, unknown>;
      const reputation = ((agentInfo?.rating as number) || 0) * 20; // 0-5 → 0-100

      if (options.minReputation && reputation < options.minReputation) continue;

      result.push({
        id: p.id as string,
        agentId: p.agent_id as string,
        agentName: (agentInfo?.agent_name as string) || undefined,
        endpointUrl: p.endpoint_url as string,
        isActive: p.is_active as boolean,
        rateLimitRpm: p.rate_limit_rpm as number,
        minChargeUsdc: String(p.min_charge_usdc ?? 0),
        supportedFeatures: (p.supported_features as string[]) || [],
        providerType: p.provider_type as ComputeProvider['providerType'],
        infraDetails: (p.infra_details as Record<string, unknown>) || {},
        models: pModels,
        totalRequests: p.total_requests as number,
        totalTokensServed: Number(p.total_tokens_served || 0),
        totalEarnings: String(p.total_earnings ?? 0),
        avgLatencyMs: (p.avg_latency_ms as number) ?? null,
        uptimeScore: (p.uptime_score as number) || 100,
        reputationScore: reputation,
        createdAt: p.created_at as string,
        updatedAt: p.updated_at as string,
      });
    }

    // Sort by price if requested (cheapest model input price)
    if (options.sortBy === 'price') {
      result.sort((a, b) => {
        const aMin = Math.min(...a.models.map((m) => parseFloat(m.inputPricePer1k) || Infinity));
        const bMin = Math.min(...b.models.map((m) => parseFloat(m.inputPricePer1k) || Infinity));
        return aMin - bMin;
      });
    }

    return { providers: result, total: count ?? result.length };
  } catch (error) {
    console.error('[Compute] listComputeProviders error:', error);
    return { providers: [], total: 0 };
  }
}

// ==========================================
// List Available Models (aggregated)
// ==========================================

export async function listAvailableModels(): Promise<AvailableModel[]> {
  try {
    // Get all active models with provider reputation
    const { data: models } = await supabaseAdmin
      .from('compute_models')
      .select('model_name, input_price_per_1k, output_price_per_1k, compute_providers!inner(is_active, agent_id, marketplace_agents!inner(rating))')
      .eq('is_active', true)
      .eq('compute_providers.is_active', true);

    if (!models || models.length === 0) return [];

    // Group by model name
    const grouped = new Map<string, { prices: { input: number; output: number }[]; ratings: number[] }>();
    for (const m of models) {
      const name = m.model_name as string;
      if (!grouped.has(name)) {
        grouped.set(name, { prices: [], ratings: [] });
      }
      const entry = grouped.get(name)!;
      entry.prices.push({
        input: parseFloat(String(m.input_price_per_1k)),
        output: parseFloat(String(m.output_price_per_1k)),
      });
      const provider = m.compute_providers as unknown as Record<string, unknown>;
      const agent = provider?.marketplace_agents as unknown as Record<string, unknown>;
      entry.ratings.push(((agent?.rating as number) || 0) * 20);
    }

    const result: AvailableModel[] = [];
    for (const [modelName, data] of grouped) {
      const cheapestInput = Math.min(...data.prices.map((p) => p.input));
      const cheapestOutput = Math.min(...data.prices.map((p) => p.output));
      const avgRep = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length;

      result.push({
        modelName,
        providerCount: data.prices.length,
        cheapestInputPricePer1k: String(cheapestInput),
        cheapestOutputPricePer1k: String(cheapestOutput),
        avgReputation: Math.round(avgRep),
      });
    }

    // Sort by provider count descending
    result.sort((a, b) => b.providerCount - a.providerCount);
    return result;
  } catch (error) {
    console.error('[Compute] listAvailableModels error:', error);
    return [];
  }
}

// ==========================================
// Update Provider
// ==========================================

export async function updateComputeProvider(
  request: UpdateComputeProviderRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check provider exists
    const { data: provider, error: fetchErr } = await supabaseAdmin
      .from('compute_providers')
      .select('id, agent_id')
      .eq('id', request.providerId)
      .single();

    if (fetchErr || !provider) {
      return { success: false, error: 'Compute provider not found' };
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (request.endpointUrl !== undefined) {
      try {
        const url = new URL(request.endpointUrl);
        if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
          return { success: false, error: 'Endpoint URL must use HTTPS' };
        }
      } catch {
        return { success: false, error: 'Invalid endpoint URL' };
      }
      updates.endpoint_url = sanitizeInput(request.endpointUrl);
    }
    if (request.rateLimitRpm !== undefined) updates.rate_limit_rpm = request.rateLimitRpm;
    if (request.minChargeUsdc !== undefined) updates.min_charge_usdc = request.minChargeUsdc;
    if (request.supportedFeatures !== undefined) updates.supported_features = request.supportedFeatures;
    if (request.isActive !== undefined) updates.is_active = request.isActive;
    if (request.infraDetails !== undefined) updates.infra_details = request.infraDetails;

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from('compute_providers')
        .update(updates)
        .eq('id', request.providerId);

      if (updateErr) {
        console.error('[Compute] Provider update error:', updateErr);
        return { success: false, error: 'Failed to update provider' };
      }
    }

    // Upsert models if provided
    if (request.models && request.models.length > 0) {
      for (const model of request.models) {
        const { error: upsertErr } = await supabaseAdmin
          .from('compute_models')
          .upsert(
            {
              provider_id: request.providerId,
              model_name: sanitizeInput(model.modelName),
              display_name: model.displayName ? sanitizeInput(model.displayName) : null,
              input_price_per_1k: model.inputPricePer1k,
              output_price_per_1k: model.outputPricePer1k,
              max_context_length: model.maxContextLength ?? 128000,
              is_active: model.isActive ?? true,
              metadata: model.metadata ?? {},
            },
            { onConflict: 'provider_id,model_name' }
          );

        if (upsertErr) {
          console.error('[Compute] Model upsert error:', upsertErr);
          return { success: false, error: `Failed to upsert model ${model.modelName}` };
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Compute] updateComputeProvider error:', error);
    return { success: false, error: 'Internal error updating compute provider' };
  }
}

// ==========================================
// Get Usage Stats
// ==========================================

export async function getComputeUsage(
  agentId: string,
  role: 'consumer' | 'provider'
): Promise<ComputeUsage> {
  try {
    const filterCol = role === 'consumer' ? 'consumer_agent_id' : 'provider_id';

    // If role is provider, resolve provider_id from agent_id
    let filterValue = agentId;
    if (role === 'provider') {
      const { data: provider } = await supabaseAdmin
        .from('compute_providers')
        .select('id')
        .eq('agent_id', agentId)
        .single();

      if (!provider) {
        return { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsdc: '0', recentRequests: [] };
      }
      filterValue = provider.id;
    }

    // Get recent requests
    const { data: requests } = await supabaseAdmin
      .from('compute_requests')
      .select('*')
      .eq(filterCol, filterValue)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!requests || requests.length === 0) {
      return { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsdc: '0', recentRequests: [] };
    }

    // Aggregate
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostBigInt = 0n;

    const recentRequests = requests.map((r) => {
      totalInputTokens += r.input_tokens || 0;
      totalOutputTokens += r.output_tokens || 0;
      try {
        totalCostBigInt += BigInt(r.cost_usdc ?? 0);
      } catch { /* ignore parse errors */ }

      return {
        id: r.id,
        modelName: r.model_name,
        providerName: r.provider_agent_name,
        consumerName: r.consumer_agent_name,
        inputTokens: r.input_tokens || 0,
        outputTokens: r.output_tokens || 0,
        costUsdc: String(r.cost_usdc ?? 0),
        status: r.status,
        latencyMs: r.latency_ms,
        paymentTxHash: r.payment_tx_hash,
        createdAt: r.created_at,
      };
    });

    return {
      totalRequests: requests.length,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsdc: totalCostBigInt.toString(),
      recentRequests,
    };
  } catch (error) {
    console.error('[Compute] getComputeUsage error:', error);
    return { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsdc: '0', recentRequests: [] };
  }
}
