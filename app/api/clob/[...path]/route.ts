import { NextRequest, NextResponse } from 'next/server';

const CLOB_API = 'https://clob.polymarket.com';

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const upstreamPath = '/' + path.join('/');

  // Forward query params
  const upstream = new URL(`${CLOB_API}${upstreamPath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstream.searchParams.set(key, value);
  });

  // Build headers — forward POLY_* auth headers plus standard headers
  // that Cloudflare WAF expects (missing User-Agent triggers bot detection).
  const headers: Record<string, string> = {
    'User-Agent': 'Supermission/1.0 (https://supermission.fun)',
    'Accept': 'application/json',
  };
  request.headers.forEach((value, key) => {
    const upper = key.toUpperCase();
    if (upper.startsWith('POLY_')) {
      headers[upper] = value;
    }
  });

  const ct = request.headers.get('content-type');
  if (ct) headers['content-type'] = ct;

  // Read body for non-GET requests
  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.text();
    } catch {
      // no body
    }
  }

  try {
    const res = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    const reason =
      err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'timeout (15s)'
        : err?.cause?.code ?? err?.code ?? err?.message ?? 'unknown';
    console.error(`[/api/clob] ${request.method} ${upstreamPath} error:`, reason, err?.message);
    return NextResponse.json(
      { error: 'Failed to reach Polymarket CLOB', reason },
      { status: 502 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
