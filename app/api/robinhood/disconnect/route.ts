import { NextRequest, NextResponse } from 'next/server';
import { deleteConnection } from '@/lib/robinhood/store';

/** POST /api/robinhood/disconnect → deactivate the current user's connection. */
export async function POST(request: NextRequest) {
  const owner = request.headers.get('x-verified-wallet')?.split(',')[0]?.toLowerCase();
  if (!owner) return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  try {
    await deleteConnection(owner);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[robinhood/disconnect]', err?.message);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
