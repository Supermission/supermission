/**
 * Agent Endpoint Management API
 * PUT /api/agents/[agentId]/endpoint
 * Updates agent endpoint URL and verifies it's working
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import axios from 'axios';
import { validateExternalUrl } from '@/lib/security';

interface UpdateEndpointRequest {
  endpointUrl: string;
  ownerAddress: string; // To verify ownership
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const body: UpdateEndpointRequest = await request.json();

    console.log('[Endpoint Update] Starting update:', {
      agentId,
      endpoint: body.endpointUrl,
      owner: body.ownerAddress,
    });

    // Auth is handled by middleware — read verified wallets from header
    const walletHeader = request.headers.get('x-verified-wallet') || '';
    const userWallets = walletHeader.split(',').filter(Boolean);

    // Step 2: Verify agent exists
    const { data: agent, error: fetchError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('agent_name, wallet_address')
      .eq('id', agentId)
      .maybeSingle();

    if (fetchError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Step 3: Verify ownership — user must own the agent's wallet
    if (!agent.wallet_address || !userWallets.includes(agent.wallet_address.toLowerCase())) {
      return NextResponse.json(
        { error: 'Forbidden: you do not own this agent' },
        { status: 403 }
      );
    }

    // Step 2: Validate endpoint URL (SSRF prevention)
    const urlError = validateExternalUrl(body.endpointUrl);
    if (urlError) {
      return NextResponse.json(
        { error: 'Invalid endpoint URL', details: urlError },
        { status: 400 }
      );
    }

    // Step 3: Verify endpoint is working
    console.log('[Endpoint Update] Verifying endpoint health...');
    let endpointStatus = 'inactive';
    let errorMessage: string | null = null;

    try {
      const healthCheckResponse = await axios.post(
        body.endpointUrl,
        {
          action: 'health_check',
          message: 'SUPERMISSION endpoint verification',
        },
        {
          timeout: 5000, // 5 second timeout
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'SUPERMISSION/1.0',
          },
        }
      );

      // Endpoint responded successfully
      if (healthCheckResponse.status === 200) {
        endpointStatus = 'active';
        console.log('[Endpoint Update] Endpoint is healthy');
      } else {
        errorMessage = `Endpoint returned status ${healthCheckResponse.status}`;
        console.warn('[Endpoint Update] Endpoint returned non-200 status:', healthCheckResponse.status);
      }
    } catch (error) {
      endpointStatus = 'inactive';
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          errorMessage = 'Endpoint timeout - no response within 5 seconds';
        } else if (error.response) {
          errorMessage = `Endpoint error: ${error.response.status} ${error.response.statusText}`;
        } else if (error.request) {
          errorMessage = 'Endpoint unreachable - connection failed';
        } else {
          errorMessage = `Request error: ${error.message}`;
        }
      } else {
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
      console.error('[Endpoint Update] Endpoint health check failed:', errorMessage);
    }

    // Step 3: Update database with new endpoint and status
    const { error: updateError } = await supabaseAdmin
      .from('marketplace_agents')
      .update({
        endpoint_url: body.endpointUrl,
        endpoint_status: endpointStatus,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('[Endpoint Update] Database update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to update endpoint', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[Endpoint Update] Endpoint updated successfully:', {
      status: endpointStatus,
      url: body.endpointUrl,
    });

    return NextResponse.json({
      success: true,
      message: endpointStatus === 'active'
        ? 'Endpoint verified and updated successfully!'
        : 'Endpoint saved but health check failed',
      endpoint: {
        url: body.endpointUrl,
        status: endpointStatus,
        lastChecked: new Date().toISOString(),
        error: errorMessage,
      },
    });

  } catch (error) {
    console.error('[Endpoint Update] Error:', error);
    return NextResponse.json(
      {
        error: 'Endpoint verification failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/[agentId]/endpoint
 * Returns endpoint info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    const { data: agent, error } = await supabaseAdmin
      .from('marketplace_agents')
      .select('endpoint_url, endpoint_status, last_checked_at')
      .eq('id', agentId)
      .maybeSingle();

    if (error || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      endpoint: {
        url: agent.endpoint_url,
        status: agent.endpoint_status || 'inactive',
        lastChecked: agent.last_checked_at,
      },
    });

  } catch (error) {
    console.error('[Endpoint GET] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch endpoint info',
      },
      { status: 500 }
    );
  }
}
