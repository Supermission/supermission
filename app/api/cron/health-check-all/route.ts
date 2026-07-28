/**
 * Automated Health Check Cron Job
 * GET /api/cron/health-check-all
 *
 * Runs every 5 minutes via Vercel Cron
 * Checks all agent endpoints and updates their status
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import axios from 'axios';

interface HealthCheckResult {
  agentId: string;
  name: string;
  endpoint: string;
  previousStatus: string;
  newStatus: 'active' | 'inactive' | 'error';
  responseTime?: number;
  error?: string;
}

/** Reject URLs that target private/internal networks (SSRF prevention) */
function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname === '::1') return false;
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const a = parseInt(parts[0]);
      const b = parseInt(parts[1]);
      if (a === 10) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
      if (a === 127) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Platform agents that should always be active (skip health checks)
const PLATFORM_AGENTS = [
  'agent_1760886157698_lzy2czh83', // LogoMaster AI
  'agent_1760886159008_0qns6xy6u', // CopyWriter
  'agent_1760886159300_zitacvck8', // SocialMedia
];

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // SECURITY: Verify request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron Health Check] Unauthorized request - invalid or missing secret');
    return NextResponse.json(
      { error: 'Unauthorized - invalid cron secret' },
      { status: 401 }
    );
  }

  console.log('[Cron Health Check] Starting automated health check...');

  try {
    // Step 1: Fetch all agents with endpoint URLs (excluding platform agents)
    const { data: agents, error: fetchError } = await supabaseAdmin
      .from('marketplace_agents')
      .select('id, agent_name, endpoint_url, endpoint_status')
      .not('endpoint_url', 'is', null);

    if (fetchError) {
      console.error('[Cron Health Check] Database fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch agents', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      console.log('[Cron Health Check] No agents with endpoints found');
      return NextResponse.json({
        success: true,
        message: 'No agents to check',
        checked: 0,
        skipped: 0,
      });
    }

    console.log(`[Cron Health Check] Found ${agents.length} agents to check`);

    // Step 2: Check each endpoint (batch of 10 concurrent checks)
    const results: HealthCheckResult[] = [];
    const batchSize = 10;

    for (let i = 0; i < agents.length; i += batchSize) {
      const batch = agents.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (agent) => {
          const checkStart = Date.now();
          let newStatus: 'active' | 'inactive' | 'error' = 'inactive';
          let errorMessage: string | undefined;

          if (!isUrlSafe(agent.endpoint_url!)) {
            return {
              agentId: agent.id,
              name: agent.agent_name,
              endpoint: agent.endpoint_url!,
              previousStatus: agent.endpoint_status || 'unknown',
              newStatus: 'error' as const,
              responseTime: 0,
              error: 'Blocked: URL must be HTTPS and not target private networks',
            };
          }

          try {
            // Health check with 5-second timeout
            const response = await axios.post(
              agent.endpoint_url!,
              {
                action: 'health_check',
                message: 'SUPERMISSION automated health check',
              },
              {
                timeout: 5000,
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'SUPERMISSION-Cron/1.0',
                },
              }
            );

            if (response.status === 200) {
              newStatus = 'active';
            } else {
              newStatus = 'error';
              errorMessage = `HTTP ${response.status}`;
            }
          } catch (error) {
            newStatus = 'inactive';
            if (axios.isAxiosError(error)) {
              if (error.code === 'ECONNABORTED') {
                errorMessage = 'Timeout (>5s)';
              } else if (error.response) {
                errorMessage = `HTTP ${error.response.status}`;
                newStatus = 'error';
              } else if (error.request) {
                errorMessage = 'Connection failed';
              } else {
                errorMessage = error.message;
              }
            } else {
              errorMessage = error instanceof Error ? error.message : 'Unknown error';
            }
          }

          const responseTime = Date.now() - checkStart;

          return {
            agentId: agent.id,
            name: agent.agent_name,
            endpoint: agent.endpoint_url!,
            previousStatus: agent.endpoint_status || 'unknown',
            newStatus,
            responseTime,
            error: errorMessage,
          };
        })
      );

      results.push(...batchResults);
    }

    // Step 3: Update database with new statuses
    const updates = results.map((result) => ({
      id: result.agentId,
      endpoint_status: result.newStatus,
      last_checked_at: new Date().toISOString(),
    }));

    // Batch update all agents
    for (const update of updates) {
      await supabaseAdmin
        .from('marketplace_agents')
        .update({
          endpoint_status: update.endpoint_status,
          last_checked_at: update.last_checked_at,
        })
        .eq('id', update.id);
    }

    // Step 4: Log summary
    const statusChanges = results.filter(
      (r) => r.previousStatus !== r.newStatus
    );

    const summary = {
      active: results.filter((r) => r.newStatus === 'active').length,
      inactive: results.filter((r) => r.newStatus === 'inactive').length,
      error: results.filter((r) => r.newStatus === 'error').length,
      statusChanges: statusChanges.length,
    };

    console.log('[Cron Health Check] Summary:', summary);
    if (statusChanges.length > 0) {
      console.log('[Cron Health Check] Status changes:', statusChanges);
    }

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: 'Health check completed',
      timestamp: new Date().toISOString(),
      duration: `${totalTime}ms`,
      checked: results.length,
      skipped: PLATFORM_AGENTS.length,
      summary,
      changes: statusChanges.map((r) => ({
        agent: r.name,
        from: r.previousStatus,
        to: r.newStatus,
        error: r.error,
      })),
    });

  } catch (error) {
    console.error('[Cron Health Check] Error:', error);
    return NextResponse.json(
      {
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
