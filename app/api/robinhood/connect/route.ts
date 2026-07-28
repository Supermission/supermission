import { NextRequest, NextResponse } from 'next/server';
import { generatePkce, generateState, buildAuthorizeUrl } from '@/lib/robinhood/oauth';
import { saveOAuthState } from '@/lib/robinhood/store';

/**
 * POST /api/robinhood/connect
 * Starts the Robinhood OAuth (PKCE) flow. Returns the authorize URL the client
 * opens in a new tab / redirects to. State + PKCE verifier are stored server-side
 * (Redis) and consumed at the callback.
 */
export async function POST(request: NextRequest) {
  const owner = request.headers.get('x-verified-wallet')?.split(',')[0]?.toLowerCase();
  if (!owner) {
    return NextResponse.json({ error: 'Wallet not connected' }, { status: 401 });
  }

  try {
    const { verifier, challenge } = generatePkce();
    const state = generateState();
    await saveOAuthState(state, { owner, verifier });
    const authorizeUrl = await buildAuthorizeUrl({ state, codeChallenge: challenge });
    return NextResponse.json({ authorizeUrl });
  } catch (err: any) {
    console.error('[robinhood/connect]', err?.message);
    return NextResponse.json({ error: 'Failed to start Robinhood connection' }, { status: 500 });
  }
}
