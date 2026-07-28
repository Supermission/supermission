/**
 * On-Demand Agent Health Check API
 * GET /api/agents/check-health?agentId=xxx
 *
 * Checks agent health by hitting their endpoint and updates status
 * This is perfect for serverless agents that can't send heartbeats
 *
 * Usage:
 * - Frontend calls this when loading leaderboard/agent pages
 * - Checks specific agent or all agents
 * - Updates database with real-time status
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import axios from 'axios';

interface HealthCheckResult {
  agentId: string;
  name: string;
  status: 'active' | 'inactive';
  responseTime?: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    // Fetch agents to check
    let query = supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, endpoint_url');

    if (agentId) {
      query = query.eq('id', agentId);
    } else {
      // Only check agents with endpoint URLs
      query = query.not('endpoint_url', 'is', null);
    }

    const { data: agents, error: fetchError } = await query;

    if (fetchError) {
      console.error('[HealthCheck] Failed to fetch agents:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch agents', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({
        success: true,
        message: agentId ? 'Agent not found' : 'No agents to check',
        results: [],
      });
    }

    // Check each agent's health
    const results: HealthCheckResult[] = await Promise.all(
      agents.map(async (agent) => {
        return checkAgentHealth(agent.id, agent.agent_name, agent.endpoint_url);
      })
    );

    const now = new Date().toISOString();
    const activeIds = results.filter(r => r.status === "active").map(r => r.agentId);
    const inactiveIds = results.filter(r => r.status === "inactive").map(r => r.agentId);

    if (activeIds.length > 0){
      await supabaseAdmin
        .from('marketplace_agents')
        .update({
          endpoint_status: 'active',
          last_checked_at: now
        })
        .in('id', activeIds);
    }

    if (inactiveIds.length > 0){
      await supabaseAdmin
        .from('marketplace_agents')
        .update({
          endpoint_status: 'inactive',
          last_checked_at: now
        })
        .in('id', inactiveIds);
    }

    const activeCount = activeIds.length
    const inactiveCount = inactiveIds.length

    return NextResponse.json({
      success: true,
      message: `Checked ${results.length} agents: ${activeCount} active, ${inactiveCount} inactive`,
      results,
      summary: {
        total: results.length,
        active: activeCount,
        inactive: inactiveCount,
      },
    });

  } catch (error) {
    console.error('[HealthCheck] Error:', error);
    return NextResponse.json(
      {
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Check individual agent health by hitting their endpoint
 */
async function checkAgentHealth(
  agentId: string,
  name: string,
  endpointUrl: string | null
): Promise<HealthCheckResult> {
  // If no endpoint URL, mark as inactive
  if (!endpointUrl) {
    return {
      agentId,
      name,
      status: 'inactive',
      error: 'No endpoint URL configured',
    };
  }

  try {
    const startTime = Date.now();

    // Hit the agent's health endpoint (GET request)
    const response = await axios.get(endpointUrl, {
      timeout: 5000, // 5 second timeout
      validateStatus: (status) => status < 500, // Accept 4xx as "agent is running"
    });

    const responseTime = Date.now() - startTime;

    // If agent responds (even with 4xx), it's active
    if (response.status < 500) {
      console.log(`[HealthCheck] ${name} is ACTIVE (${responseTime}ms)`);
      return {
        agentId,
        name,
        status: 'active',
        responseTime,
      };
    }

    // 5xx errors mean agent is having issues
    console.log(`[HealthCheck] ${name} returned ${response.status}`);
    return {
      agentId,
      name,
      status: 'inactive',
      error: `Server error: ${response.status}`,
    };

  } catch (error) {
    // Network errors, timeouts, etc. = inactive
    console.log(`[HealthCheck] ${name} is INACTIVE:`, error instanceof Error ? error.message : 'Unknown error');
    return {
      agentId,
      name,
      status: 'inactive',
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
