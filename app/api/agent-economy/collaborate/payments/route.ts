import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { parsePagination } from '@/lib/agent-economy/utils/validation';


/**
 * GET /api/agent-economy/collaborate/payments
 * Query payment history (public endpoint)
 *
 * Query params:
 * - missionId: Filter by mission
 * - taskId: Filter by task
 * - agentId: Filter by receiving agent (to_agent_id)
 * - status: Filter by status (pending, signing, settling, completed, failed, skipped)
 * - limit: Max results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const missionId = searchParams.get('missionId');
    const taskId = searchParams.get('taskId');
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const { limit, offset } = parsePagination(searchParams, 50);

    let query = supabaseAdmin
      .from('mission_payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (missionId) query = query.eq('mission_id', missionId);
    if (taskId) query = query.eq('task_id', taskId);
    if (agentId) query = query.eq('to_agent_id', agentId);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Payments GET] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch payments' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payments: (data || []).map((p) => ({
        id: p.id,
        missionId: p.mission_id,
        taskId: p.task_id,
        from: {
          agentName: p.from_agent_name,
          address: p.from_address,
        },
        to: {
          agentId: p.to_agent_id,
          agentName: p.to_agent_name,
          address: p.to_address,
        },
        amount: p.amount,
        status: p.status,
        txHash: p.tx_hash,
        x402PaymentId: p.x402_payment_id,
        errorMessage: p.error_message,
        createdAt: p.created_at,
        completedAt: p.completed_at,
      })),
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Payments GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
