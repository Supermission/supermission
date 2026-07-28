import { NextRequest } from 'next/server';
import { WORKER_API } from '@/lib/config/worker';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const upstream = `${WORKER_API}/v1/markets${qs ? `?${qs}` : ''}`;

  // Bypass Next data cache and Vercel edge cache. The previous
  // `next: { revalidate: 15 }` + `stale-while-revalidate=30` combo could pin
  // a stale entry indefinitely (observed: `sort=ending_soon&limit=20` stuck
  // on total=4336 with month-old end_dates while the worker reported 215
  // with future dates). The worker has its own 15s in-memory cache, so always
  // proxying through is cheap.
  const upstreamRes = await fetch(upstream, { cache: 'no-store' });

  const body = await upstreamRes.arrayBuffer();
  return new Response(body, {
    status: upstreamRes.status,
    headers: {
      'content-type': upstreamRes.headers.get('content-type') ?? 'application/json',
      // Browser may keep for 15s; no s-maxage so Vercel's shared cache stays out.
      'cache-control': 'private, max-age=15',
    },
  });
}
