import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { invalidateUserContext } from '@/lib/ai/user-context';
import { invalidatePositionsCache } from '@/lib/ai/oracle/positions-cache';

/**
 * PATCH /api/trades/record — Update an existing trade record (e.g. payout after redemption)
 */
export async function PATCH(request: NextRequest) {
  try {
    const verifiedWallet = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!verifiedWallet) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { order_id, amount, price, status } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (amount != null) updates.amount = amount;
    if (price != null) updates.price = price;
    if (status) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('trade_history')
      .update(updates)
      .eq('order_id', order_id)
      .eq('user_address', verifiedWallet)
      .select()
      .single();

    if (error) {
      console.error('[/api/trades/record PATCH] Error:', error);
      return NextResponse.json({ error: 'Failed to update trade', detail: error.message }, { status: 500 });
    }

    // Flush chat caches so the next chat turn sees the updated trade state.
    await Promise.all([
      invalidateUserContext(verifiedWallet),
      invalidatePositionsCache(verifiedWallet),
    ]);

    return NextResponse.json({ trade: data });
  } catch (err) {
    console.error('[/api/trades/record PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/trades/record — Record a completed trade (idempotent via order_id)
 */
export async function POST(request: NextRequest) {
  try {
    const verifiedWallet = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!verifiedWallet) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      condition_id,
      token_id,
      side,
      outcome,
      amount,
      price,
      shares,
      order_id,
      market_question,
      status = 'completed',
      executed_at,
    } = body;

    if (!condition_id || !side || !outcome || amount == null || price == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // For REDEEM trades, normalize outcome to match the user's BUY outcome for this condition_id.
    // BUY trades record outcome as "YES"/"NO", but positions use market-specific names
    // (e.g., "Sunrisers Hyderabad" instead of "NO"). Mismatched outcomes break P&L calculations.
    let normalizedOutcome = outcome;
    if (side === 'REDEEM') {
      try {
        const { data: buyTrade } = await supabaseAdmin
          .from('trade_history')
          .select('outcome')
          .eq('user_address', verifiedWallet)
          .eq('condition_id', condition_id)
          .eq('side', 'BUY')
          .limit(1)
          .single();
        if (buyTrade?.outcome) {
          normalizedOutcome = buyTrade.outcome;
        }
      } catch {
        // If lookup fails, use the original outcome
      }
    }

    const row = {
      user_address: verifiedWallet,
      condition_id,
      token_id,
      side,
      outcome: normalizedOutcome,
      amount,
      price,
      shares,
      order_id: order_id || null,
      market_question: market_question || null,
      status,
      ...(executed_at ? { created_at: executed_at } : {}),
    };

    // Insert trade record. The partial unique index on order_id (WHERE order_id IS NOT NULL)
    // prevents duplicates — if a retry sends the same order_id, we get a 23505 unique violation
    // which we treat as success (idempotent).
    const { data, error } = await (supabaseAdmin as any)
      .from('trade_history')
      .insert(row)
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation — duplicate order_id, already recorded (retry-safe)
      if (error.code === '23505') {
        return NextResponse.json({ trade: null, duplicate: true });
      }
      console.error('[/api/trades/record] Error:', error, 'Row:', JSON.stringify(row));
      return NextResponse.json({ error: 'Failed to record trade', detail: error.message || error.code || String(error) }, { status: 500 });
    }

    // Flush chat caches — the recent-trades list and positions both moved.
    await Promise.all([
      invalidateUserContext(verifiedWallet),
      invalidatePositionsCache(verifiedWallet),
    ]);

    return NextResponse.json({ trade: data });
  } catch (err) {
    console.error('[/api/trades/record] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
