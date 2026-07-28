/**
 * SUPERMISSION Agent Proxy
 * Wraps external agent endpoints with X402 payment handling
 *
 * This proxy allows agents to onboard to SUPERMISSION without implementing X402 themselves.
 * SUPERMISSION handles all payment verification and forwards successful requests to the agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { verifyPaymentProof } from '@/lib/x402/middleware';
import type { X402PaymentProof } from '@/lib/x402/types';
import { validateExternalUrl } from '@/lib/security';
import { supabaseAdmin } from '@/lib/supabase/client';

interface AgentProfile {
  id: string;
  name: string;
  address: string;
  pricing_model: 'per_task' | 'per_message' | null;
  pricing_rate: number | null;
  endpoint_url: string | null;
  use_proxy: boolean | null;
  capabilities: string[];
  agent_type: 'ai' | 'human' | 'hybrid';
}

/**
 * GET /api/proxy/[agentId]
 * Health check endpoint for proxied agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Look up agent in database
    const agent = await getAgentProfile(agentId);

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Check if agent has proxy enabled
    if (!agent.use_proxy) {
      return NextResponse.json(
        {
          error: 'Proxy not enabled',
          message: 'This agent does not use SUPERMISSION proxy. Contact the agent directly.',
          agentEndpoint: agent.endpoint_url,
        },
        { status: 400 }
      );
    }

    // Check if agent has endpoint configured
    if (!agent.endpoint_url) {
      return NextResponse.json(
        {
          error: 'Endpoint not configured',
          message: 'Agent has not configured their endpoint URL.',
        },
        { status: 503 }
      );
    }

    // Return proxy health status
    return NextResponse.json({
      status: 'ok',
      agentId: agent.id,
      agentName: agent.name,
      agentAddress: agent.address,
      capabilities: agent.capabilities,
      agentType: agent.agent_type,
      proxyEnabled: true,
      pricingModel: agent.pricing_model,
      pricingRate: agent.pricing_rate,
      timestamp: new Date().toISOString(),
      message: 'SUPERMISSION proxy endpoint - ready to accept requests',
    });
  } catch (error) {
    console.error('[Proxy] Health check error:', error);
    return NextResponse.json(
      {
        error: 'Proxy request failed',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxy/[agentId]
 * Proxy endpoint with X402 payment handling
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const logPrefix = '[Proxy:POST]';

  try {
    const { agentId } = await params;

    console.log(`${logPrefix} ========================================`);
    console.log(`${logPrefix} New request for agent: ${agentId}`);
    console.log(`${logPrefix} Request headers:`, {
      contentType: request.headers.get('content-type'),
      hasPaymentProof: request.headers.has('x-payment-proof'),
      userAgent: request.headers.get('user-agent'),
    });

    // Look up agent in database
    console.log(`${logPrefix} Looking up agent profile in database...`);
    const agent = await getAgentProfile(agentId);

    if (!agent) {
      console.error(`${logPrefix} ✗ Agent not found:`, { agentId });
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    console.log(`${logPrefix} Agent profile found:`, {
      name: agent.name,
      address: agent.address,
      pricingModel: agent.pricing_model,
      pricingRate: agent.pricing_rate,
      useProxy: agent.use_proxy,
      endpointUrl: agent.endpoint_url,
      capabilities: agent.capabilities,
    });

    // Verify proxy is enabled
    if (!agent.use_proxy) {
      console.error(`${logPrefix} ✗ Proxy not enabled for agent:`, { agentId, name: agent.name });
      return NextResponse.json(
        {
          error: 'Proxy not enabled',
          message: 'This agent does not use SUPERMISSION proxy.',
          agentEndpoint: agent.endpoint_url,
        },
        { status: 400 }
      );
    }

    // Verify endpoint is configured
    if (!agent.endpoint_url) {
      console.error(`${logPrefix} ✗ Endpoint not configured for agent:`, { agentId, name: agent.name });
      return NextResponse.json(
        {
          error: 'Endpoint not configured',
          message: 'Agent has not configured their endpoint URL.',
        },
        { status: 503 }
      );
    }

    // Check for payment proof header
    const paymentProofHeader = request.headers.get('x-payment-proof');

    // If no payment proof, return 402 Payment Required
    if (!paymentProofHeader) {
      console.log(`${logPrefix} No payment proof provided - returning 402 Payment Required`);

      // Calculate payment amount based on pricing model
      const paymentAmount = calculatePaymentAmount(agent);

      console.log(`${logPrefix} Payment request details:`, {
        amount: paymentAmount,
        amountUSDC: (Number(paymentAmount) / 1_000_000).toFixed(2),
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        recipient: agent.address,
        chainId: 8453,
        pricingModel: agent.pricing_model,
        pricingRate: agent.pricing_rate,
      });

      const paymentRequest = {
        amount: paymentAmount.toString(),
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base Mainnet
        recipient: agent.address, // Agent's wallet address
        chainId: 8453, // Base Mainnet
        description: `Payment for ${agent.name} - ${agent.pricing_model || 'per_task'} (${agent.pricing_rate || 0} USDC)`,
      };

      console.log(`${logPrefix} Returning 402 Payment Required`);

      // Track 402 attempt
      supabaseAdmin.from('agent_request_log').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        event_type: 'payment_required',
        payment_amount: paymentAmount.toString(),
        response_status: 402,
        metadata: { pricingModel: agent.pricing_model, pricingRate: agent.pricing_rate },
      }).then(() => {});

      return NextResponse.json(
        {
          error: 'Payment required',
          message: `Please provide payment to use ${agent.name}`,
          agentId: agent.id,
          agentName: agent.name,
          pricingModel: agent.pricing_model,
          pricingRate: agent.pricing_rate,
          proxyInfo: 'This agent uses SUPERMISSION proxy for payment handling',
        },
        {
          status: 402,
          headers: {
            'X-Payment-Required': JSON.stringify(paymentRequest),
          },
        }
      );
    }

    // Verify payment proof
    console.log(`${logPrefix} ========================================`);
    console.log(`${logPrefix} Payment proof provided - starting verification...`);

    let paymentProof!: X402PaymentProof;
    try {
      console.log(`${logPrefix} Parsing payment proof header...`);
      paymentProof = JSON.parse(paymentProofHeader);

      console.log(`${logPrefix} Payment proof parsed:`, {
        txHash: paymentProof.txHash,
        from: paymentProof.from,
        to: paymentProof.to,
        amount: paymentProof.amount,
        token: paymentProof.token,
        timestamp: paymentProof.timestamp,
      });

      // Validate payment proof structure
      console.log(`${logPrefix} Validating payment proof structure...`);
      if (!paymentProof.txHash || !paymentProof.amount || !paymentProof.from || !paymentProof.to) {
        throw new Error('Invalid payment proof format: missing required fields');
      }
      console.log(`${logPrefix} Structure validation passed`);

      // Verify recipient matches agent wallet
      console.log(`${logPrefix} Verifying recipient matches agent wallet...`);
      if (paymentProof.to.toLowerCase() !== agent.address.toLowerCase()) {
        throw new Error(`Payment recipient mismatch: expected ${agent.address}, got ${paymentProof.to}`);
      }
      console.log(`${logPrefix} Recipient verification passed`);

      // Verify payment amount is sufficient
      const expectedAmount = calculatePaymentAmount(agent);
      console.log(`${logPrefix} Verifying payment amount...`, {
        expected: expectedAmount,
        expectedUSDC: (Number(expectedAmount) / 1_000_000).toFixed(2),
        received: paymentProof.amount,
        receivedUSDC: (Number(paymentProof.amount) / 1_000_000).toFixed(2),
      });

      if (BigInt(paymentProof.amount) < BigInt(expectedAmount)) {
        throw new Error(`Insufficient payment: expected ${expectedAmount}, got ${paymentProof.amount}`);
      }
      console.log(`${logPrefix} Amount verification passed`);

      // Verify payment using auto facilitator
      console.log(`${logPrefix} Calling middleware verifyPaymentProof with auto facilitator...`);
      const isValid = await verifyPaymentProof(paymentProof, {
        expectedAmount: BigInt(expectedAmount),
        expectedRecipient: agent.address as `0x${string}`,
        expectedToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, // USDC on Base Mainnet
        chainId: 8453, // Base Mainnet
        agentId: agent.id,
      });

      if (!isValid) {
        throw new Error('Payment proof verification failed: facilitator verification failed');
      }

      console.log(`${logPrefix} ✓ Payment verified successfully via auto facilitator:`, {
        from: paymentProof.from,
        to: paymentProof.to,
        amount: paymentProof.amount,
        txHash: paymentProof.txHash,
      });

      // Track verified payment
      supabaseAdmin.from('agent_request_log').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        from_address: paymentProof.from?.toLowerCase(),
        event_type: 'payment_verified',
        payment_amount: paymentProof.amount,
        response_status: 200,
        metadata: { txHash: paymentProof.txHash },
      }).then(() => {});
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} ✗ Payment verification failed:`, {
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Track failed payment verification
      supabaseAdmin.from('agent_request_log').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        from_address: paymentProof?.from?.toLowerCase(),
        event_type: 'payment_failed',
        payment_amount: paymentProof?.amount,
        response_status: 400,
        error_message: errMsg,
      }).then(() => {});

      return NextResponse.json(
        {
          error: 'Invalid payment proof',
          message: errMsg,
          hint: 'Ensure the payment transaction is confirmed on-chain and the proof is correctly formatted',
        },
        { status: 400 }
      );
    }

    // Payment verified - forward request to agent endpoint
    console.log(`${logPrefix} ========================================`);
    console.log(`${logPrefix} Forwarding request to agent endpoint: ${agent.endpoint_url}`);

    // Validate endpoint URL before forwarding (SSRF prevention)
    const urlError = validateExternalUrl(agent.endpoint_url);
    if (urlError) {
      console.error(`${logPrefix} ✗ Blocked SSRF attempt: ${urlError}`);
      return NextResponse.json(
        { error: 'Invalid agent endpoint URL', details: urlError },
        { status: 400 }
      );
    }

    try {
      // Get request body
      const body = await request.json();
      console.log(`${logPrefix} Request body:`, {
        hasBody: !!body,
        bodyKeys: Object.keys(body || {}),
      });

      // Forward request to agent's actual endpoint (without payment proof)
      // The agent doesn't need to handle X402 - we've already verified payment
      const forwardHeaders = {
        'Content-Type': 'application/json',
        // Add custom headers to let agent know this came through proxy
        'X-Supermission-Proxy': 'true',
        'X-Supermission-Agent-Id': agent.id,
        'X-Supermission-Payment-Verified': 'true',
        'X-Supermission-Payer': paymentProof.from,
        'X-Supermission-Payment-Amount': paymentProof.amount,
        'X-Supermission-Payment-Tx': paymentProof.txHash,
      };

      console.log(`${logPrefix} Forwarding with headers:`, forwardHeaders);

      const startTime = Date.now();
      const agentResponse = await fetch(agent.endpoint_url, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(body),
      });
      const responseTime = Date.now() - startTime;

      console.log(`${logPrefix} Agent response received:`, {
        status: agentResponse.status,
        statusText: agentResponse.statusText,
        responseTime: `${responseTime}ms`,
        contentType: agentResponse.headers.get('content-type'),
      });

      // Get response from agent
      const agentData = await agentResponse.json();

      console.log(`${logPrefix} Agent response data:`, {
        hasData: !!agentData,
        dataKeys: Object.keys(agentData || {}),
      });

      console.log(`${logPrefix} ✓ Request completed successfully`);

      // Track successful agent forwarding
      supabaseAdmin.from('agent_request_log').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        from_address: paymentProof.from?.toLowerCase(),
        event_type: 'agent_forwarded',
        payment_amount: paymentProof.amount,
        response_status: agentResponse.status,
        response_time_ms: responseTime,
        metadata: { txHash: paymentProof.txHash },
      }).then(() => {});

      // Track agent endpoint health
      supabaseAdmin.from('agent_endpoint_health').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        endpoint_url: agent.endpoint_url,
        status_code: agentResponse.status,
        response_time_ms: responseTime,
        is_success: agentResponse.ok,
      }).then(() => {});

      // Forward agent's response
      return NextResponse.json(agentData, {
        status: agentResponse.status,
        headers: {
          'X-Supermission-Proxy': 'true',
          'X-Supermission-Agent-Id': agent.id,
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`${logPrefix} ✗ Failed to forward request to agent:`, {
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
        agentEndpoint: agent.endpoint_url,
        agentId: agent.id,
      });

      // Track agent error
      supabaseAdmin.from('agent_request_log').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        from_address: paymentProof.from?.toLowerCase(),
        event_type: 'agent_error',
        payment_amount: paymentProof.amount,
        response_status: 503,
        error_message: errMsg,
        metadata: { txHash: paymentProof.txHash },
      }).then(() => {});

      // Track agent endpoint health failure
      supabaseAdmin.from('agent_endpoint_health').insert({
        agent_id: agent.id,
        agent_name: agent.name,
        endpoint_url: agent.endpoint_url,
        is_success: false,
        error_message: errMsg,
      }).then(() => {});

      return NextResponse.json(
        {
          error: 'Proxy request failed',
          hint: 'The agent may be offline or their endpoint may be misconfigured',
        },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error(`${logPrefix} ✗ Unexpected proxy error:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: 'Proxy request failed',
      },
      { status: 500 }
    );
  }
}

/**
 * Helper: Get agent profile from database
 */
async function getAgentProfile(agentId: string): Promise<AgentProfile | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data, error } = await supabase
    .from('marketplace_agents')
    .select('id, agent_name, wallet_address, pricing_model, pricing_rate, endpoint_url, use_proxy, capabilities, agent_type')
    .eq('id', agentId)
    .single();

  if (error) {
    console.error('[Proxy] Failed to fetch agent profile:', error);
    return null;
  }

  // Map marketplace_agents columns to local AgentProfile shape
  return {
    id: data.id,
    name: data.agent_name,
    address: data.wallet_address,
    pricing_model: data.pricing_model,
    pricing_rate: data.pricing_rate,
    endpoint_url: data.endpoint_url,
    use_proxy: data.use_proxy,
    capabilities: data.capabilities,
    agent_type: data.agent_type,
  } as AgentProfile;
}

/**
 * Helper: Calculate payment amount based on agent's pricing model
 */
function calculatePaymentAmount(agent: AgentProfile): string {
  // If no pricing configured, default to 0.01 USDC (10000 with 6 decimals)
  if (!agent.pricing_rate || agent.pricing_rate <= 0) {
    return '10000'; // 0.01 USDC
  }

  // Convert pricing rate (in USDC) to smallest unit (6 decimals)
  // e.g., 0.05 USDC -> 50000
  const amount = Math.floor(agent.pricing_rate * 1_000_000);

  return amount.toString();
}
