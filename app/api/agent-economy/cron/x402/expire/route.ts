import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireServiceRole } from '@/lib/agent-economy/auth';


export async function POST(request: NextRequest) {
  try {
    const authError = requireServiceRole(request);
    if (authError) return authError;

    const nowSeconds = Math.floor(Date.now() / 1000);

    const { data: payments, error } = await supabaseAdmin
      .from('x402_payments')
      .select('id, requirements, status')
      .in('status', ['pending', 'signing'])
      .limit(200);

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to query x402 payments' },
        { status: 500 }
      );
    }

    const expiredIds = (payments || [])
      .filter((p) => {
        const expiresAt = (p.requirements as { expiresAt?: number })?.expiresAt;
        return typeof expiresAt === 'number' && nowSeconds > expiresAt;
      })
      .map((p) => p.id);

    if (expiredIds.length === 0) {
      return NextResponse.json({
        success: true,
        expired: 0,
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from('x402_payments')
      .update({
        status: 'expired',
        completed_at: new Date().toISOString(),
      })
      .in('id', expiredIds);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: 'Failed to update expired payments' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      expired: expiredIds.length,
    });
  } catch (error) {
    console.error('[Cron x402 Expire] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
