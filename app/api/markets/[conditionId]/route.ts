import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * GET /api/markets/[conditionId] — Single market detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conditionId: string }> }
) {
  try {
    const { conditionId } = await params;

    const { data, error } = await (supabaseAdmin as any)
      .from('market_catalog')
      .select('*')
      .eq('condition_id', conditionId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('[/api/markets/[conditionId]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
