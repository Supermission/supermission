import { NextRequest, NextResponse } from 'next/server';
import { isConnected } from '@/lib/robinhood/store';

/** GET /api/robinhood/status → { connected: boolean } for the current user. */
export async function GET(request: NextRequest) {
  const owner = request.headers.get('x-verified-wallet')?.split(',')[0]?.toLowerCase();
  if (!owner) return NextResponse.json({ connected: false });
  try {
    return NextResponse.json({ connected: await isConnected(owner) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
