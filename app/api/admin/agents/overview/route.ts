import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { supabaseAdmin } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // All RPCs + limited direct queries in parallel
    const [
      agentCounts,
      missionCounts,
      taskCounts,
      disputeCounts,
      competitionCounts,
      applicationCounts,
      topEarnersRes,
      recentAgentsRes,
      recentMissionsRes,
      recentDisputesRes,
      healthFailuresRes,
    ] = await Promise.all([
      supabaseAdmin.rpc('admin_agent_counts'),
      supabaseAdmin.rpc('admin_mission_counts'),
      supabaseAdmin.rpc('admin_task_counts'),
      supabaseAdmin.rpc('admin_dispute_counts'),
      supabaseAdmin.rpc('admin_competition_counts'),
      supabaseAdmin.rpc('admin_application_counts'),
      supabaseAdmin
        .from('marketplace_agents')
        .select('id, agent_name, total_earnings, jobs_completed, rating')
        .order('total_earnings', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('marketplace_agents')
        .select('id, agent_name, agent_type, agent_status, endpoint_url, endpoint_status, rating, jobs_completed, total_earnings, is_available, is_platform_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('collaborate_missions')
        .select('id, title, status, budget, required_agents, current_agents, creator_address, created_at, deadline')
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('disputes')
        .select('id, dispute_type, status, filed_by_agent_id, filed_against_agent_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('agent_endpoint_health')
        .select('agent_id, status_code, response_time_ms, created_at')
        .eq('is_success', false)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Parse RPC results (single-row returns)
    const ac = agentCounts.data?.[0] || agentCounts.data || {};
    const mc = missionCounts.data?.[0] || missionCounts.data || {};
    const tc = taskCounts.data?.[0] || taskCounts.data || {};
    const dc = disputeCounts.data?.[0] || disputeCounts.data || {};
    const cc = competitionCounts.data?.[0] || competitionCounts.data || {};
    const apc = applicationCounts.data?.[0] || applicationCounts.data || {};

    const topEarners = (topEarnersRes.data || []).map((a: any) => ({
      id: a.id,
      name: a.agent_name,
      earnings: Number(a.total_earnings) || 0,
      jobs: Number(a.jobs_completed) || 0,
      rating: Number(a.rating) || 0,
    }));

    const recentMissions = (recentMissionsRes.data || []).map((m: any) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      budget: Number(m.budget) || 0,
      requiredAgents: m.required_agents,
      currentAgents: m.current_agents,
      creatorAddress: m.creator_address,
      createdAt: m.created_at,
      deadline: m.deadline,
    }));

    // Health: compute healthy/unhealthy from latest per agent
    // Use a quick query to get distinct agents with their latest health status
    const { data: latestHealth } = await supabaseAdmin
      .from('agent_endpoint_health')
      .select('agent_id, is_success, response_time_ms')
      .order('created_at', { ascending: false })
      .limit(500);

    const agentHealthMap = new Map<string, boolean>();
    const responseTimes: number[] = [];
    for (const h of (latestHealth || [])) {
      if (!agentHealthMap.has(h.agent_id)) {
        agentHealthMap.set(h.agent_id, !!h.is_success);
      }
      const rt = Number(h.response_time_ms);
      // Only successful checks contribute to the average; failed-check response
      // times (connection timeouts, 5xx latency) distort the "how fast are
      // healthy endpoints?" reading the dashboard is trying to show.
      if (rt > 0 && h.is_success) responseTimes.push(rt);
    }
    let healthyAgents = 0;
    let unhealthyAgents = 0;
    for (const [, isHealthy] of agentHealthMap) {
      if (isHealthy) healthyAgents++;
      else unhealthyAgents++;
    }
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : 0;

    const recentFailures = (healthFailuresRes.data || []).map((h: any) => ({
      agent_id: h.agent_id,
      status_code: h.status_code,
      response_time_ms: Number(h.response_time_ms) || 0,
      created_at: h.created_at,
    }));

    // Application acceptance rate
    const accepted = Number(apc.accepted_count) || 0;
    const rejected = Number(apc.rejected_count) || 0;
    const decided = accepted + rejected;
    const acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 10000) / 100 : 0;

    // Task completion rate
    const taskTotal = Number(tc.total) || 0;
    const taskApproved = Number(tc.approved_count) || 0;
    const completionRate = taskTotal > 0 ? Math.round((taskApproved / taskTotal) * 10000) / 100 : 0;

    return NextResponse.json({
      agents: {
        total: Number(ac.total) || 0,
        byType: {
          ai: Number(ac.ai_count) || 0,
          human: Number(ac.human_count) || 0,
          hybrid: Number(ac.hybrid_count) || 0,
        },
        byStatus: {
          active: Number(ac.active_count) || 0,
          inactive: Number(ac.inactive_count) || 0,
          suspended: Number(ac.suspended_count) || 0,
          pending: Number(ac.pending_count) || 0,
        },
        platformAgents: Number(ac.platform_count) || 0,
        availableAgents: Number(ac.available_count) || 0,
        avgRating: Math.round((Number(ac.avg_rating) || 0) * 100) / 100,
        topEarners,
        recentAgents: recentAgentsRes.data || [],
      },
      missions: {
        total: Number(mc.total) || 0,
        byStatus: {
          active: Number(mc.active_count) || 0,
          in_progress: Number(mc.in_progress_count) || 0,
          completed: Number(mc.completed_count) || 0,
          cancelled: Number(mc.cancelled_count) || 0,
        },
        totalBudget: Math.round((Number(mc.total_budget) || 0) * 100) / 100,
        avgBudget: Math.round((Number(mc.avg_budget) || 0) * 100) / 100,
        recentMissions,
      },
      tasks: {
        total: taskTotal,
        byStatus: {
          pending: Number(tc.pending_count) || 0,
          assigned: Number(tc.assigned_count) || 0,
          in_progress: Number(tc.in_progress_count) || 0,
          submitted: Number(tc.submitted_count) || 0,
          approved: taskApproved,
          rejected: Number(tc.rejected_count) || 0,
        },
        completionRate,
        totalRewards: Math.round((Number(tc.total_rewards) || 0) * 100) / 100,
      },
      disputes: {
        total: Number(dc.total) || 0,
        open: Number(dc.open_count) || 0,
        byType: {
          task_rejection: Number(dc.task_rejection) || 0,
          payment: Number(dc.payment) || 0,
          quality: Number(dc.quality) || 0,
          communication: Number(dc.communication) || 0,
          deadline: Number(dc.deadline) || 0,
          other: Number(dc.other_type) || 0,
        },
        byStatus: {
          open: Number(dc.st_open) || 0,
          under_review: Number(dc.st_under_review) || 0,
          resolved: Number(dc.st_resolved) || 0,
          dismissed: Number(dc.st_dismissed) || 0,
          escalated: Number(dc.st_escalated) || 0,
        },
        recentDisputes: recentDisputesRes.data || [],
      },
      competitions: {
        total: Number(cc.total) || 0,
        byStatus: {
          upcoming: Number(cc.upcoming_count) || 0,
          active: Number(cc.active_count) || 0,
          judging: Number(cc.judging_count) || 0,
          completed: Number(cc.completed_count) || 0,
          cancelled: Number(cc.cancelled_count) || 0,
        },
        totalPrizePool: Math.round((Number(cc.total_prize_pool) || 0) * 100) / 100,
      },
      health: {
        agentsChecked: agentHealthMap.size,
        healthyAgents,
        unhealthyAgents,
        avgResponseTime,
        recentFailures,
      },
      applications: {
        total: Number(apc.total) || 0,
        byStatus: {
          pending: Number(apc.pending_count) || 0,
          accepted,
          rejected,
          expired: Number(apc.expired_count) || 0,
          withdrawn: Number(apc.withdrawn_count) || 0,
        },
        acceptanceRate,
      },
    });
  } catch (err: any) {
    console.error('Admin agents overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch agents overview' }, { status: 500 });
  }
}
