/**
 * POST /api/agent-economy/webhooks/test
 * Send a test ping event to verify webhook connectivity
 *
 * Requires auth. Sends a `ping` event to the specified webhook.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import { getWebhook, listWebhooks } from '@/lib/agent-economy/webhooks';
import { createHmac } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    webhookId?: string;
  }>(request);

  if (parseError) {
    return parseError;
  }

  const agentId = context.agentId;
  if (!agentId) {
    const response = NextResponse.json(
      { success: false, error: 'Agent not found for this API key', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    let webhookId = body?.webhookId;

    // If no webhookId given, use the agent's first active webhook
    if (!webhookId) {
      const webhooks = await listWebhooks(agentId);
      const active = webhooks.find(w => w.isActive);
      if (!active) {
        const response = NextResponse.json(
          { success: false, error: 'No active webhooks found. Create one first via POST /api/agent-economy/webhooks', requestId: context.requestId },
          { status: 404 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }
      webhookId = active.id;
    }

    // Verify webhook exists and belongs to agent
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      const response = NextResponse.json(
        { success: false, error: 'Webhook not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (webhook.agentId !== agentId) {
      const response = NextResponse.json(
        { success: false, error: 'Not authorized to test this webhook', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (!webhook.isActive) {
      const response = NextResponse.json(
        { success: false, error: 'Webhook is disabled. Enable it first via PUT /api/agent-economy/webhooks', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Send test ping — we need the secret from DB directly
    const { data: whRecord } = await supabaseAdmin
      .from('agent_webhooks')
      .select('secret')
      .eq('id', webhookId)
      .single();

    if (!whRecord?.secret) {
      const response = NextResponse.json(
        { success: false, error: 'Webhook secret not found', requestId: context.requestId },
        { status: 500 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const payload = {
      event: 'ping',
      timestamp: new Date().toISOString(),
      agentId,
      data: {
        message: 'This is a test ping from Supermission. If you receive this, your webhook is working!',
        webhookId,
      },
    };

    const body_str = JSON.stringify(payload);
    const signature = createHmac('sha256', whRecord.secret).update(body_str).digest('hex');

    const deliveryStart = Date.now();
    const deliveryResponse = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': 'ping',
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body: body_str,
      signal: AbortSignal.timeout(10000),
    });
    const deliveryMs = Date.now() - deliveryStart;

    const responseBody = await deliveryResponse.text().catch(() => '');

    if (deliveryResponse.ok) {
      const response = NextResponse.json({
        success: true,
        test: {
          webhookId,
          url: webhook.url,
          status: deliveryResponse.status,
          latencyMs: deliveryMs,
          message: 'Webhook is working! Your endpoint responded successfully.',
        },
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: false,
      test: {
        webhookId,
        url: webhook.url,
        status: deliveryResponse.status,
        latencyMs: deliveryMs,
        responseBody: responseBody.slice(0, 500),
        message: `Webhook endpoint responded with HTTP ${deliveryResponse.status}. Check your endpoint.`,
      },
      requestId: context.requestId,
    }, { status: 200 }); // 200 because *our* endpoint worked, the agent's didn't
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Webhooks Test] Error:', errMsg);

    const response = NextResponse.json({
      success: false,
      error: `Webhook test failed: ${errMsg}`,
      requestId: context.requestId,
    }, { status: 200 });
    return addAgenticHeaders(response, context, rateLimit);
  }
}
