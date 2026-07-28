import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const address = searchParams.get('address');
    const statusFilter = searchParams.get('status');

    // Only query mission_payments — the sole source of agent economy transactions.
    // payment_proofs and x402_payments are chat/website payments, not agent economy activity.
    let query = supabaseAdmin
      .from('mission_payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (address) {
      query = query.or(`from_address.eq.${address},to_address.eq.${address}`);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Transactions GET] mission_payments error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    const transactions = (data || []).map((mp) => ({
      id: mp.id,
      from_address: mp.from_address,
      to_address: mp.to_address,
      amount: mp.amount,
      token_address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      tx_hash: mp.tx_hash,
      status: mp.status,
      metadata: {
        agent_name: mp.from_agent_name,
        to_agent_name: mp.to_agent_name,
        to_agent_id: mp.to_agent_id,
        mission_id: mp.mission_id,
        task_id: mp.task_id,
        error_message: mp.error_message,
      },
      created_at: mp.created_at,
    }));

    return NextResponse.json({
      success: true,
      transactions,
      total: count || 0,
    });
  } catch (error) {
    console.error('[Transactions GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
