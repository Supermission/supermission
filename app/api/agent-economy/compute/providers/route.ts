/**
 * Compute Providers API
 * GET  /api/agent-economy/compute/providers — List/search providers (public)
 * POST /api/agent-economy/compute/providers — Register as compute provider (auth: write)
 * PUT  /api/agent-economy/compute/providers — Update provider config (auth: write)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import {
  registerComputeProvider,
  listComputeProviders,
  listAvailableModels,
  updateComputeProvider,
} from '@/lib/agent-economy/compute';
import type { ProviderType } from '@/lib/agent-economy/compute/types';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const view = params.get('view'); // 'models' for aggregated model list

    if (view === 'models') {
      const models = await listAvailableModels();
      return NextResponse.json({ success: true, models }, {
        headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
      });
    }

    const options = {
      model: params.get('model') || undefined,
      feature: params.get('feature') || undefined,
      providerType: (params.get('providerType') as ProviderType) || undefined,
      maxInputPrice: params.get('maxInputPrice') || undefined,
      minReputation: params.get('minReputation') ? Number(params.get('minReputation')) : undefined,
      sortBy: (params.get('sortBy') as 'price' | 'reputation' | 'requests' | 'latency') || undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
      offset: params.get('offset') ? Number(params.get('offset')) : undefined,
    };

    const result = await listComputeProviders(options);

    return NextResponse.json({
      success: true,
      providers: result.providers,
      total: result.total,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[Compute Providers GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { agentId, endpointUrl, rateLimitRpm, minChargeUsdc, supportedFeatures, providerType, infraDetails, models } = body;

    // Validate required fields
    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 });
    }
    if (!endpointUrl || typeof endpointUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'endpointUrl is required' }, { status: 400 });
    }
    if (endpointUrl.length > 500) {
      return NextResponse.json({ success: false, error: 'endpointUrl must be 500 characters or fewer' }, { status: 400 });
    }
    if (!models || !Array.isArray(models) || models.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one model is required' }, { status: 400 });
    }

    // Validate each model has required pricing
    for (const model of models) {
      if (!model.modelName || typeof model.modelName !== 'string') {
        return NextResponse.json({ success: false, error: 'Each model must have a modelName' }, { status: 400 });
      }
      if (!model.inputPricePer1k || !model.outputPricePer1k) {
        return NextResponse.json(
          { success: false, error: `Model "${model.modelName}" requires inputPricePer1k and outputPricePer1k` },
          { status: 400 }
        );
      }
    }

    const result = await registerComputeProvider({
      agentId,
      endpointUrl,
      rateLimitRpm,
      minChargeUsdc,
      supportedFeatures,
      providerType,
      infraDetails,
      models,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      providerId: result.providerId,
      message: 'Compute provider registered. Your inference endpoint is now discoverable.',
    });
  } catch (error) {
    console.error('[Compute Providers POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request, 'write');
    if (!authResult.success) {
      return createAuthErrorResponse(authResult);
    }

    const body = await request.json();
    const { providerId } = body;

    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ success: false, error: 'providerId is required' }, { status: 400 });
    }

    const result = await updateComputeProvider(body);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Provider updated' });
  } catch (error) {
    console.error('[Compute Providers PUT] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
