import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, processWebhookEvent } from '@/lib/circle/webhooks';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-circle-signature') || '';

    if (!verifyWebhookSignature(body, signature)) {
      console.warn('[Circle Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(body);
    await processWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Circle Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
