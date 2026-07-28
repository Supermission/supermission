/**
 * GET /api/health/chat-metrics
 *
 * Rolling 2-hour counters for the chat agents. Safe to poll from a status
 * page / uptime check. No wallet data exposed — only aggregate counts.
 *
 * Protected by a shared secret so we don't leak operational signal to the
 * public. Set METRICS_READ_TOKEN in env and pass it as the `?token=` query
 * param or `x-metrics-token` header. Anyone with the secret sees the same data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readChatMetrics } from '@/lib/ai/shared/chat-metrics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const required = process.env.METRICS_READ_TOKEN;
  if (required) {
    const provided =
      req.headers.get('x-metrics-token') ||
      req.nextUrl.searchParams.get('token') ||
      '';
    if (provided !== required) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const snapshot = await readChatMetrics();
    return NextResponse.json(snapshot, {
      headers: {
        // Don't cache — this is point-in-time.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to read metrics', detail: err?.message },
      { status: 500 },
    );
  }
}
