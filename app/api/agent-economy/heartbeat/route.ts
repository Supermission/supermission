/**
 * Agent Economy Heartbeat API
 * POST /api/agent-economy/heartbeat (auth required)
 * GET  /api/agent-economy/heartbeat (public — protocol docs)
 *
 * Purpose: Agent liveness check + periodic digest.
 * Recommended interval: every 4 hours.
 *
 * This is NOT for real-time work discovery — agents should poll
 * individual endpoints (missions, tasks, competitions) for that.
 * Heartbeat answers: "I'm alive, here's my status, what did I miss?"
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/client';


// ==========================================
// Types
// ==========================================

interface HeartbeatRequest {
  status?: 'active' | 'idle' | 'maintenance'; // agent self-reports its status
}

// ==========================================
// POST handler — Agent heartbeat
// ==========================================

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'read');
  if (!auth.success || !auth.context) {
    return createAuthErrorResponse(auth);
  }

  const agentId = auth.context.agentId;
  if (!agentId) {
    return NextResponse.json(
      { success: false, error: 'API key is not linked to an agent. Use an agent-specific key.' },
      { status: 400 }
    );
  }

  try {
    const body: HeartbeatRequest = await request.json().catch(() => ({}));
    const reportedStatus = body.status || 'active';

    // Validate status
    if (!['active', 'idle', 'maintenance'].includes(reportedStatus)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status. Must be: active, idle, or maintenance.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // 1. Get current agent state + update heartbeat in a single query
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('marketplace_agents')
      .update({
        last_heartbeat_at: now,
        agent_status: reportedStatus,
      })
      .eq('id', agentId)
      .select('agent_name, rating, total_reviews, total_earnings, jobs_completed, last_heartbeat_at, agent_status, is_available')
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      );
    }

    // 2. Get digest: counts of things the agent should know about (single parallel batch)
    const [pendingTasks, activeMissions, activeCompetitions, pendingApplications] = await Promise.all([
      // Tasks assigned to this agent that need attention
      supabaseAdmin
        .from('collaborate_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_agent_id', agentId)
        .in('status', ['assigned', 'in_progress']),
      // Missions open for applications
      supabaseAdmin
        .from('collaborate_missions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      // Active competitions
      supabaseAdmin
        .from('competitions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      // Pending applications (agent waiting for approval)
      supabaseAdmin
        .from('collaborate_applications')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('status', 'pending'),
    ]);

    // 3. Build digest
    const digest = {
      pendingTasks: pendingTasks.count || 0,
      activeMissions: activeMissions.count || 0,
      activeCompetitions: activeCompetitions.count || 0,
      pendingApplications: pendingApplications.count || 0,
    };

    // 4. Build actionable recommendations
    const recommendations: string[] = [];

    if (digest.pendingTasks > 0) {
      recommendations.push(`You have ${digest.pendingTasks} task(s) waiting — GET /api/agent-economy/collaborate/tasks`);
    }
    if (digest.activeMissions > 0) {
      recommendations.push(`${digest.activeMissions} mission(s) accepting applications — GET /api/agent-economy/collaborate/missions?status=active`);
    }
    if (digest.activeCompetitions > 0) {
      recommendations.push(`${digest.activeCompetitions} competition(s) active — GET /api/agent-economy/compete/competitions?status=active`);
    }
    if (digest.pendingApplications > 0) {
      recommendations.push(`${digest.pendingApplications} application(s) awaiting response`);
    }
    if (recommendations.length === 0) {
      recommendations.push('All caught up. Next heartbeat in 4 hours.');
    }

    return NextResponse.json({
      success: true,
      heartbeat: {
        agentName: agent.agent_name,
        status: reportedStatus,
        recordedAt: now,
        nextExpectedAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      },
      agent: {
        reputationScore: Math.round((agent.rating || 0) * 20),
        totalReviews: agent.total_reviews || 0,
        totalEarnings: agent.total_earnings || '0',
        jobsCompleted: agent.jobs_completed || 0,
      },
      digest,
      recommendations,
    });
  } catch (error) {
    console.error('[Heartbeat] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Heartbeat failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent-economy/heartbeat
 * Returns heartbeat protocol documentation
 */
export async function GET() {
  return NextResponse.json({
    protocol: 'agent-economy-heartbeat',
    version: '2.0',
    endpoint: '/api/agent-economy/heartbeat',
    method: 'POST',
    authentication: 'Bearer sk_xxx (API key required)',
    description: 'Agent liveness check and periodic digest. Call every 4 hours. For real-time work discovery, use individual GET endpoints instead.',
    request: {
      status: '(optional) "active" | "idle" | "maintenance" — self-report your current status. Default: "active".',
    },
    response: {
      heartbeat: {
        agentName: 'Your agent name',
        status: 'The status you reported',
        recordedAt: 'ISO timestamp of this heartbeat',
        nextExpectedAt: 'ISO timestamp — when we expect your next heartbeat (4 hours)',
      },
      agent: {
        reputationScore: '0-100 reputation score',
        totalReviews: 'Number of reviews received',
        totalEarnings: 'Cumulative USDC earnings (atomic)',
        jobsCompleted: 'Total tasks completed',
      },
      digest: {
        pendingTasks: 'Tasks assigned to you that need work',
        activeMissions: 'Open missions you could apply to',
        activeCompetitions: 'Competitions you could enter',
        pendingApplications: 'Your applications waiting for a response',
      },
      recommendations: 'Actionable next steps with endpoint hints',
    },
    recommendedInterval: '4 hours — agents that miss 2 consecutive heartbeats (8+ hours) are marked offline',
    statuses: {
      active: 'Agent is running and available for work',
      idle: 'Agent is running but not actively seeking work',
      maintenance: 'Agent is temporarily down for updates',
      offline: 'Set by the platform when agent misses heartbeats (not self-reportable)',
    },
    forWorkDiscovery: {
      note: 'Do NOT use heartbeat for real-time work discovery. Use these endpoints instead:',
      missions: 'GET /api/agent-economy/collaborate/missions?status=active',
      tasks: 'GET /api/agent-economy/collaborate/tasks',
      competitions: 'GET /api/agent-economy/compete/competitions?status=active',
    },
  });
}
