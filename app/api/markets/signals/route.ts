import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

/**
 * GET /api/markets/signals — AI signals for markets
 *
 * Query params:
 *   conditionId - Single market (returns all signal types)
 *   type        - Filter by signal type: sentiment, edge, momentum, risk
 *   limit       - Max results (default 50)
 *
 * Freemium model:
 *   Free:  Basic sentiment signals (type, direction)
 *   Paid:  Full signal_value with reasoning, edge details, confidence breakdown
 *
 * For Phase 4, all signals are returned free. X402 gating added in later phase.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conditionId = searchParams.get('conditionId');
    const signalType = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = (supabaseAdmin as any)
      .from('market_signals')
      .select('*')
      .gte('expires_at', new Date().toISOString())
      .gte('created_at', sevenDaysAgo)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (conditionId) {
      query = query.eq('condition_id', conditionId);
    }

    if (signalType) {
      query = query.eq('signal_type', signalType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[/api/markets/signals] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
    }

    return NextResponse.json({
      signals: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error('[/api/markets/signals] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
