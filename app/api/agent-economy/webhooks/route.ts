/**
 * Webhook Management API
 * CRUD operations for agent webhook configurations
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createAuthErrorResponse,
  addAgenticHeaders,
  safeParseJson,
} from '@/lib/agent-economy/auth';
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  regenerateWebhookSecret,
  getWebhookDeliveries,
  type WebhookEvent,
} from '@/lib/agent-economy/webhooks';

/**
 * GET /api/agent-economy/webhooks
 * List webhooks for authenticated agent or get specific webhook
 *
 * Query params:
 * - webhookId: Get specific webhook (optional)
 * - agentId: List webhooks for agent (required if no webhookId)
 * - deliveries: Include delivery history for webhookId
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'read');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const searchParams = request.nextUrl.searchParams;

  const webhookId = searchParams.get('webhookId');
  const agentId = searchParams.get('agentId') || context.agentId;
  const includeDeliveries = searchParams.get('deliveries') === 'true';

  try {
    if (webhookId) {
      // Get specific webhook
      const webhook = await getWebhook(webhookId);

      if (!webhook) {
        const response = NextResponse.json(
          { success: false, error: 'Webhook not found', requestId: context.requestId },
          { status: 404 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      // Verify ownership
      if (webhook.agentId !== agentId) {
        const response = NextResponse.json(
          { success: false, error: 'Not authorized to view this webhook', requestId: context.requestId },
          { status: 403 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      // Optionally include deliveries
      let deliveries;
      if (includeDeliveries) {
        deliveries = await getWebhookDeliveries(webhookId, { limit: 20 });
      }

      const response = NextResponse.json({
        success: true,
        webhook,
        deliveries,
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    // List webhooks for agent
    if (!agentId) {
      const response = NextResponse.json(
        { success: false, error: 'agentId is required', requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const webhooks = await listWebhooks(agentId);

    // Optionally include recent deliveries per webhook
    let webhooksWithDeliveries = webhooks;
    if (includeDeliveries && webhooks.length > 0) {
      webhooksWithDeliveries = await Promise.all(
        webhooks.map(async (wh) => {
          const deliveries = await getWebhookDeliveries(wh.id, { limit: 5 });
          return { ...wh, recentDeliveries: deliveries };
        })
      );
    }

    const response = NextResponse.json({
      success: true,
      webhooks: webhooksWithDeliveries,
      count: webhooks.length,
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Webhooks API] GET error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * POST /api/agent-economy/webhooks
 * Create a new webhook
 *
 * Body:
 * - agentId: Agent to create webhook for
 * - url: Webhook URL (must be HTTPS in production)
 * - events: Array of events to subscribe to
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    agentId?: string;
    url: string;
    events: WebhookEvent[];
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body) {
    const response = NextResponse.json(
      { success: false, error: 'Request body is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  const agentId = body.agentId || context.agentId;
  if (!agentId) {
    const response = NextResponse.json(
      { success: false, error: 'agentId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.url) {
    const response = NextResponse.json(
      { success: false, error: 'url is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  if (!body.events || body.events.length === 0) {
    const response = NextResponse.json(
      { success: false, error: 'events array is required and must not be empty', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    const result = await createWebhook({
      agentId,
      url: body.url,
      events: body.events,
    });

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      webhook: result.webhook,
      secret: result.secret, // Only returned once at creation!
      message: 'Store the secret securely - it will not be shown again',
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Webhooks API] POST error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * PUT /api/agent-economy/webhooks
 * Update webhook settings or regenerate secret
 *
 * Body:
 * - webhookId: Webhook to update
 * - events: New events array (optional)
 * - isActive: Enable/disable webhook (optional)
 * - regenerateSecret: Set to true to regenerate secret
 */
export async function PUT(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;

  const { data: body, error: parseError } = await safeParseJson<{
    webhookId: string;
    events?: WebhookEvent[];
    isActive?: boolean;
    regenerateSecret?: boolean;
  }>(request);

  if (parseError) {
    return parseError;
  }

  if (!body?.webhookId) {
    const response = NextResponse.json(
      { success: false, error: 'webhookId is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Verify ownership
    const webhook = await getWebhook(body.webhookId);
    if (!webhook) {
      const response = NextResponse.json(
        { success: false, error: 'Webhook not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (webhook.agentId !== context.agentId) {
      const response = NextResponse.json(
        { success: false, error: 'Not authorized to update this webhook', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Handle secret regeneration
    if (body.regenerateSecret) {
      const result = await regenerateWebhookSecret(body.webhookId);
      if (!result.success) {
        const response = NextResponse.json(
          { success: false, error: result.error, requestId: context.requestId },
          { status: 400 }
        );
        return addAgenticHeaders(response, context, rateLimit);
      }

      const response = NextResponse.json({
        success: true,
        secret: result.secret,
        message: 'Store the secret securely - it will not be shown again',
        requestId: context.requestId,
      });
      return addAgenticHeaders(response, context, rateLimit);
    }

    // Handle regular updates
    const result = await updateWebhook(body.webhookId, {
      events: body.events,
      isActive: body.isActive,
    });

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Webhook updated',
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Webhooks API] PUT error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}

/**
 * DELETE /api/agent-economy/webhooks
 * Delete a webhook
 *
 * Query params:
 * - webhookId: Webhook to delete
 */
export async function DELETE(request: NextRequest) {
  const authResult = await authenticateRequest(request, 'write');
  if (!authResult.success) {
    return createAuthErrorResponse(authResult);
  }

  const context = authResult.context!;
  const rateLimit = authResult.rateLimit;
  const webhookId = request.nextUrl.searchParams.get('webhookId');

  if (!webhookId) {
    const response = NextResponse.json(
      { success: false, error: 'webhookId query param is required', requestId: context.requestId },
      { status: 400 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }

  try {
    // Verify ownership
    const webhook = await getWebhook(webhookId);
    if (!webhook) {
      const response = NextResponse.json(
        { success: false, error: 'Webhook not found', requestId: context.requestId },
        { status: 404 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    if (webhook.agentId !== context.agentId) {
      const response = NextResponse.json(
        { success: false, error: 'Not authorized to delete this webhook', requestId: context.requestId },
        { status: 403 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const result = await deleteWebhook(webhookId);

    if (!result.success) {
      const response = NextResponse.json(
        { success: false, error: result.error, requestId: context.requestId },
        { status: 400 }
      );
      return addAgenticHeaders(response, context, rateLimit);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Webhook deleted',
      requestId: context.requestId,
    });
    return addAgenticHeaders(response, context, rateLimit);
  } catch (error) {
    console.error('[Webhooks API] DELETE error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Internal server error', requestId: context.requestId },
      { status: 500 }
    );
    return addAgenticHeaders(response, context, rateLimit);
  }
}
