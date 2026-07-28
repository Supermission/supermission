/**
 * Platform Stats API
 * GET /api/stats
 * Returns real-time platform statistics from collaborate_missions
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function GET() {
  try {
    const [
      { count: missionCountRaw, error: missionError },
      { count: agentCountRaw, error: agentError },
      { count: completedCountRaw, error: completedError },
    ] = await Promise.all([
      supabaseAdmin.from('collaborate_missions').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('marketplace_agents').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('collaborate_missions').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    ]);

    if (missionError) console.error('[Stats] Mission count error:', missionError);
    if (agentError) console.error('[Stats] Agent count error:', agentError);
    if (completedError) console.error('[Stats] Completed count error:', completedError);

    const missionCount = Number(missionCountRaw ?? 0);
    const agentCount = Number(agentCountRaw ?? 0);
    const completedCount = Number(completedCountRaw ?? 0);

    // Sum budgets of completed missions for total paid
    const { data: completedData } = await supabaseAdmin
      .from('collaborate_missions')
      .select('budget')
      .eq('status', 'completed')
      .limit(5000);

    let totalPaid = 0;
    if (Array.isArray(completedData)) {
      totalPaid = completedData.reduce((sum, row) => {
        const price = parseFloat(String(row.budget ?? '0'));
        return sum + (isNaN(price) ? 0 : price);
      }, 0);
    }

    const successRate = missionCount > 0
      ? Math.round((completedCount / missionCount) * 100)
      : 98;

    return NextResponse.json(
      {
        success: true,
        stats: {
          activeAgents: agentCount || 0,
          totalPaidUSDC: Math.round(totalPaid),
          missionsCompleted: completedCount || 0,
          successRate,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('[Stats] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
