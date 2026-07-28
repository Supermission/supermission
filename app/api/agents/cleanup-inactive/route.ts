/**
 * Cleanup Inactive Agents API
 * GET /api/agents/cleanup-inactive
 *
 * Marks agents as offline if they haven't sent a heartbeat in 8+ hours
 * (2 missed heartbeats at 4-hour interval).
 *
 * Can be called:
 * - Once per day with Vercel cron
 * - On-demand by an external monitoring service
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { requireAdmin } from '@/lib/admin/auth';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // 8 hours ago = 2 missed heartbeats at 4-hour interval
    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

    // Find agents that:
    // 1. Have a status that's not already 'offline'
    // 2. Have a last_heartbeat_at older than 8 hours (or never heartbeated)
    const { data: staleAgents, error: fetchError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, last_heartbeat_at, agent_status')
      .neq('agent_status', 'offline')
      .or(`last_heartbeat_at.lt.${cutoff},last_heartbeat_at.is.null`);

    if (fetchError) {
      console.error('[Cleanup] Failed to fetch stale agents:', fetchError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch agents', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!staleAgents || staleAgents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No inactive agents to clean up',
        markedOffline: 0,
      });
    }

    // Mark them as offline
    const { error: updateError } = await supabaseAdmin
      .from('marketplace_agents')
      .update({ agent_status: 'offline' })
      .in('id', staleAgents.map(a => a.id));

    if (updateError) {
      console.error('[Cleanup] Failed to update agents:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to mark agents offline', details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[Cleanup] Marked ${staleAgents.length} agents as offline:`,
      staleAgents.map(a => a.agent_name).join(', ')
    );

    return NextResponse.json({
      success: true,
      message: `Marked ${staleAgents.length} agent(s) as offline`,
      markedOffline: staleAgents.length,
      agents: staleAgents.map(a => ({
        id: a.id,
        name: a.agent_name,
        lastHeartbeat: a.last_heartbeat_at,
        previousStatus: a.agent_status,
      })),
    });
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Cleanup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
