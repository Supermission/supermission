import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json().catch(() => ({}));

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'Missing accessToken' },
        { status: 400 }
      );
    }

    // Verify the Privy JWT server-side — this is the security gate
    const { email, walletAddresses } = await verifyPrivyToken(accessToken);

    if (!email) {
      return NextResponse.json(
        { error: 'No email linked to Privy account' },
        { status: 400 }
      );
    }

    // Record wallet-to-email mapping (fire-and-forget)
    if (walletAddresses.length > 0) {
      Promise.resolve(
        supabaseAdmin
          .from('user_wallets')
          .upsert(
            walletAddresses.map((addr) => ({
              wallet_address: addr.toLowerCase(),
              email: email.toLowerCase(),
              chain: 'base',
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'wallet_address,chain' }
          )
      ).then(({ error }) => {
        if (error) console.error('[Auth Session] Failed to record wallet mapping:', error);
      }).catch((err: unknown) => {
        console.error('[Auth Session] Wallet mapping upsert threw:', err);
      });
    }

    // Record login event (fire-and-forget). Access is open to all signed-in
    // users now, so every login is recorded as 'approved'.
    Promise.resolve(
      supabaseAdmin.from('login_events').insert({
        email: email.toLowerCase(),
        wallet_addresses: walletAddresses.map((a) => a.toLowerCase()),
        waitlist_status: 'approved',
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: req.headers.get('user-agent') || null,
      })
    ).then(({ error }) => {
      if (error) console.error('[Auth Session] Failed to record login event:', error);
    }).catch((err: unknown) => {
      console.error('[Auth Session] Login event insert threw:', err);
    });

    const response = NextResponse.json({
      success: true,
      email,
    });

    // Set the real JWT as the auth cookie
    response.cookies.set('privy-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Set verified email cookie (extracted from JWT, not from user input)
    response.cookies.set('user-email', email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('Session verification failed:', err?.message);
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}
