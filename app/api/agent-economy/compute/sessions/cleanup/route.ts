/**
 * Compute Session Cleanup API
 * POST /api/agent-economy/compute/sessions/cleanup — Expire stale sessions
 *
 * Can be called by Vercel Cron or manually. Finds sessions past their
 * expires_at timestamp and auto-closes them with partial settlement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { closeSession } from '@/lib/agent-economy/compute/sessions';
import { triggerWebhook } from '@/lib/agent-economy/webhooks';
import { requireServiceRole } from '@/lib/agent-economy/auth';


export async function POST(request: NextRequest) {
  try {
    const authError = requireServiceRole(request);
    if (authError) return authError;

    const now = new Date().toISOString();

    // Find active sessions that have expired
    const { data: expiredSessions, error } = await supabaseAdmin
      .from('compute_sessions')
      .select('id, consumer_agent_id, provider_id')
      .eq('status', 'active')
      .lt('expires_at', now)
      .limit(50); // Process in batches

    if (error) {
      console.error('[Session Cleanup] Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to query expired sessions' },
        { status: 500 }
      );
    }

    if (!expiredSessions || expiredSessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired sessions found',
        processed: 0,
      });
    }

    let closed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const session of expiredSessions) {
      try {
        // Mark as expired first
        await supabaseAdmin
          .from('compute_sessions')
          .update({ status: 'expired' })
          .eq('id', session.id);

        // Close with settlement
        const result = await closeSession(session.id, { settle: true });

        if (result.success) {
          closed++;
        } else {
          failed++;
          errors.push(`${session.id}: ${result.error}`);
        }

        // Webhook: session.expired
        if (session.provider_id) {
          const { data: provider } = await supabaseAdmin
            .from('compute_providers')
            .select('agent_id')
            .eq('id', session.provider_id)
            .single();

          if (provider?.agent_id) {
            triggerWebhook(provider.agent_id, 'session.expired', {
              sessionId: session.id,
              consumerAgentId: session.consumer_agent_id,
            }).catch(err => console.error('[Webhook] session.expired failed:', err));
          }
        }
      } catch (err) {
        failed++;
        errors.push(`${session.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${expiredSessions.length} expired sessions`,
      processed: expiredSessions.length,
      closed,
      failed,
      ...(errors.length > 0 && { errors }),
    });
  } catch (error) {
    console.error('[Session Cleanup] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
