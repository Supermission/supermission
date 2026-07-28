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
      webhookStats,
      x402Stats,
      chatStats,
      chatByAgent,
      healthSummary,
      defiStats,
      recentWebhookFailsRes,
      recentX402FailsRes,
      slowestEndpointsRes,
      failingEndpointsRes,
    ] = await Promise.all([
      supabaseAdmin.rpc('admin_webhook_stats'),
      supabaseAdmin.rpc('admin_x402_stats'),
      supabaseAdmin.rpc('admin_chat_stats'),
      supabaseAdmin.rpc('admin_chat_by_agent'),
      supabaseAdmin.rpc('admin_endpoint_health_summary'),
      supabaseAdmin.rpc('admin_defi_stats'),
      supabaseAdmin
        .from('webhook_deliveries')
        .select('event_type, error_message, attempts, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('x402_payments')
        .select('id, status, amount, token, created_at, updated_at')
        .in('status', ['failed', 'expired'])
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin.rpc('admin_slowest_endpoints'),
      supabaseAdmin.rpc('admin_failing_endpoints'),
    ]);

    // Parse RPC results
    const ws = webhookStats.data?.[0] || webhookStats.data || {};
    const x4 = x402Stats.data?.[0] || x402Stats.data || {};
    const cs = chatStats.data?.[0] || chatStats.data || {};
    const hs = healthSummary.data?.[0] || healthSummary.data || {};
    const ds = defiStats.data?.[0] || defiStats.data || {};

    // Webhook delivery rate
    const webhookTotal = Number(ws.total) || 0;
    const webhookDelivered = Number(ws.delivered_count) || 0;
    const webhookDeliveryRate = webhookTotal > 0
      ? Math.round((webhookDelivered / webhookTotal) * 10000) / 100
      : 0;

    // x402 success rate
    const x402Total = Number(x4.total) || 0;
    const x402Completed = Number(x4.completed_count) || 0;
    const x402SuccessRate = x402Total > 0
      ? Math.round((x402Completed / x402Total) * 10000) / 100
      : 0;

    // Chat avg messages per session
    const totalSessions = Number(cs.total_sessions) || 0;
    const totalMessages = Number(cs.total_messages) || 0;
    const avgMessagesPerSession = totalSessions > 0
      ? Math.round((totalMessages / totalSessions) * 100) / 100
      : 0;

    // Health success rate
    const totalChecks = Number(hs.total_checks) || 0;
    const healthSuccess = Number(hs.success_count) || 0;
    const healthSuccessRate = totalChecks > 0
      ? Math.round((healthSuccess / totalChecks) * 10000) / 100
      : 0;

    const slowestEndpoints = (slowestEndpointsRes.data || []).map((r: any) => ({
      agentId: r.agent_id,
      url: r.endpoint_url,
      avgResponseTime: Number(r.avg_response_time) || 0,
    }));

    const failingEndpoints = (failingEndpointsRes.data || []).map((r: any) => ({
      agentId: r.agent_id,
      url: r.endpoint_url,
      failureCount: Number(r.failure_count) || 0,
      lastFailure: r.last_failure,
    }));

    // Recent webhook failures
    const recentWebhookFailures = (recentWebhookFailsRes.data || []).map((w: any) => ({
      eventType: w.event_type,
      errorMessage: w.error_message,
      attempts: w.attempts,
      createdAt: w.created_at,
    }));

    // Recent x402 failures
    const recentX402Failed = (recentX402FailsRes.data || []).map((p: any) => ({
      id: p.id,
      status: p.status,
      amount: p.amount,
      token: p.token,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    // By agent (from RPC)
    const byAgent = (chatByAgent.data || []).map((r: any) => ({
      agentId: r.agent_id,
      sessions: Number(r.sessions) || 0,
    }));

    return NextResponse.json({
      webhooks: {
        total: webhookTotal,
        byStatus: {
          pending: Number(ws.pending_count) || 0,
          delivered: webhookDelivered,
          failed: Number(ws.failed_count) || 0,
          retrying: Number(ws.retrying_count) || 0,
        },
        deliveryRate: webhookDeliveryRate,
        avgAttempts: Math.round((Number(ws.avg_attempts) || 0) * 100) / 100,
        dlqSize: Number(ws.dlq_size) || 0,
        recentFailures: recentWebhookFailures,
      },
      x402Pipeline: {
        total: x402Total,
        byStatus: {
          pending: Number(x4.pending_count) || 0,
          signing: Number(x4.signing_count) || 0,
          completed: x402Completed,
          failed: Number(x4.failed_count) || 0,
          expired: Number(x4.expired_count) || 0,
        },
        successRate: x402SuccessRate,
        totalVolume: Math.round((Number(x4.total_volume) || 0) * 100) / 100,
        volume24h: Math.round((Number(x4.volume_24h) || 0) * 100) / 100,
        recentFailed: recentX402Failed,
      },
      chat: {
        totalSessions,
        totalMessages,
        sessions24h: Number(cs.sessions_24h) || 0,
        uniqueUsers: Number(cs.unique_users) || 0,
        avgMessagesPerSession,
        byAgent,
      },
      endpointHealth: {
        checksLast24h: Number(hs.checks_24h) || 0,
        successRate: healthSuccessRate,
        avgResponseTime: Math.round((Number(hs.avg_response_time) || 0) * 100) / 100,
        slowestEndpoints,
        failingEndpoints,
      },
      defi: {
        totalActivities: Number(ds.total) || 0,
        activities24h: Number(ds.activities_24h) || 0,
        totalVolumeUsd: Math.round((Number(ds.total_volume_usd) || 0) * 100) / 100,
        byType: ds.by_type || {},
        byStatus: ds.by_status || {},
      },
      dailyActivity: [], // Removed full-table scan; use frontend charts from RPC data
    });
  } catch (err: any) {
    console.error('Admin system overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch system overview data' }, { status: 500 });
  }
}
