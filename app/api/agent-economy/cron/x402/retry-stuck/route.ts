import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireServiceRole } from '@/lib/agent-economy/auth';


export async function POST(request: NextRequest) {
  try {
    const authError = requireServiceRole(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const minAgeMinutes = Number(url.searchParams.get('minAgeMinutes') || '15');
    const minAgeMs = Math.max(1, minAgeMinutes) * 60_000;
    const cutoff = new Date(Date.now() - minAgeMs).toISOString();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const { data: payments, error } = await supabaseAdmin
      .from('x402_payments')
      .select('id, requirements, created_at')
      .eq('status', 'settling')
      .lt('created_at', cutoff)
      .limit(200);

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to query settling payments' },
        { status: 500 }
      );
    }

    const expiredIds: string[] = [];
    const retryIds: string[] = [];

    for (const p of payments || []) {
      const expiresAt = (p.requirements as { expiresAt?: number })?.expiresAt;
      if (typeof expiresAt === 'number' && nowSeconds > expiresAt) {
        expiredIds.push(p.id);
      } else {
        retryIds.push(p.id);
      }
    }

    if (expiredIds.length > 0) {
      await supabaseAdmin
        .from('x402_payments')
        .update({
          status: 'expired',
          completed_at: new Date().toISOString(),
        })
        .in('id', expiredIds);
    }

    if (retryIds.length > 0) {
      await supabaseAdmin
        .from('x402_payments')
        .update({
          status: 'pending',
          completed_at: null,
        })
        .in('id', retryIds);
    }

    return NextResponse.json({
      success: true,
      expired: expiredIds.length,
      retried: retryIds.length,
    });
  } catch (error) {
    console.error('[Cron x402 Retry] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
