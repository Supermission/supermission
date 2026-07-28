import { NextRequest, NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/agent-economy/auth';
import { retryWebhookDeliveries } from '@/lib/agent-economy/webhooks';

export async function POST(request: NextRequest) {
  try {
    const authError = requireServiceRole(request);
    if (authError) return authError;

    const result = await retryWebhookDeliveries({ limit: 100 });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Cron Webhook Retry] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
