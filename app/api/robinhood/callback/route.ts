import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/robinhood/oauth';
import { consumeOAuthState, saveConnection } from '@/lib/robinhood/store';

/**
 * GET /api/robinhood/callback?code=...&state=...
 * OAuth redirect target. Public (secured by the single-use state token + PKCE,
 * not the session cookie). Reconciles the user via the stored state's owner,
 * exchanges the code for tokens, encrypts + stores them, then redirects to /roro.
 */
function redirectTo(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/roro', request.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const oauthError = request.nextUrl.searchParams.get('error');

  if (oauthError) return redirectTo(request, { rh: 'error', reason: oauthError });
  if (!code || !state) return redirectTo(request, { rh: 'error', reason: 'missing_code_or_state' });

  try {
    const st = await consumeOAuthState(state);
    if (!st) return redirectTo(request, { rh: 'error', reason: 'invalid_or_expired_state' });

    const tokens = await exchangeCode({ code, codeVerifier: st.verifier });
    await saveConnection(st.owner, tokens);
    return redirectTo(request, { rh: 'connected' });
  } catch (err: any) {
    console.error('[robinhood/callback]', err?.message);
    return redirectTo(request, { rh: 'error', reason: 'exchange_failed' });
  }
}
