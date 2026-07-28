import { NextRequest, NextResponse } from 'next/server';
import { runRoroStrategies } from '@/lib/server/jobs/roro-strategies';

export const maxDuration = 120;

/** GET /api/cron/roro-strategies — evaluates due RORO strategies. Bearer CRON_SECRET. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRoroStrategies();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
