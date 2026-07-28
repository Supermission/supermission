// app/api/polymarket/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  
  if (!slug) {
    return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  }

  try {
    const url = `https://gamma-api.polymarket.com/markets/slug/${slug}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch market data' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
    console.error(`[Polymarket] ${isTimeout ? 'Timeout' : 'Error'} fetching slug="${slug}":`, isTimeout ? '10s exceeded' : error);
    return NextResponse.json(
      { error: isTimeout ? 'Polymarket API timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500 }
    );
  }
}