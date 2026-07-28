/**
 * Daily cleanup — Vercel-runnable port of worker/src/cleanup.ts:runDailyCleanup().
 *
 * Pure Supabase DELETEs, no in-memory dependencies. Runs once a day
 * at 4am UTC to prune stale rows across several tables. Tables that
 * don't exist yet are ignored so the job stays safe across schemas.
 */

import { supabaseAdmin } from '@/lib/supabase/client';

const INACTIVE_RETENTION_DAYS = 7;
const SIGNAL_RETENTION_DAYS = 7;
const NOTIFICATION_RETENTION_DAYS = 30;
const TRACKING_RETENTION_DAYS = 90;
const PREDICTION_LOG_RETENTION_DAYS = 180;

const TRACKING_TABLES = [
  'agent_endpoint_health',
  'agent_request_log',
  'trade_failures',
  'login_events',
  'webhook_deliveries',
  'compute_requests',
  'execution_receipts',
  'agent_heartbeats',
] as const;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export interface CleanupResult {
  durationMs: number;
  deletedMarkets: number;
  deletedSignals: number;
  deletedNotifications: number;
  deletedPredictions: number;
  deletedTracking: Record<string, number>;
}

export async function runDailyCleanup(): Promise<CleanupResult> {
  const t = Date.now();

  const inactiveCutoff = isoDaysAgo(INACTIVE_RETENTION_DAYS);
  const signalCutoff = isoDaysAgo(SIGNAL_RETENTION_DAYS);
  const notifCutoff = isoDaysAgo(NOTIFICATION_RETENTION_DAYS);
  const trackingCutoff = isoDaysAgo(TRACKING_RETENTION_DAYS);
  const predLogCutoff = isoDaysAgo(PREDICTION_LOG_RETENTION_DAYS);

  let deletedMarkets = 0;
  let deletedSignals = 0;
  let deletedNotifications = 0;
  let deletedPredictions = 0;
  const deletedTracking: Record<string, number> = {};

  const { count: markets, error: marketErr } = await supabaseAdmin
    .from('market_catalog')
    .delete({ count: 'exact' })
    .eq('is_active', false)
    .lt('updated_at', inactiveCutoff);
  if (marketErr) console.error('[CLEANUP] market_catalog:', marketErr.message);
  else deletedMarkets = markets ?? 0;

  const { count: signals, error: signalErr } = await supabaseAdmin
    .from('market_signals')
    .delete({ count: 'exact' })
    .lt('created_at', signalCutoff);
  if (signalErr) console.error('[CLEANUP] market_signals:', signalErr.message);
  else deletedSignals = signals ?? 0;

  const { count: notifs, error: notifErr } = await supabaseAdmin
    .from('alert_notifications')
    .delete({ count: 'exact' })
    .eq('is_read', true)
    .lt('created_at', notifCutoff);
  if (notifErr && !notifErr.message?.includes('does not exist')) {
    console.error('[CLEANUP] alert_notifications:', notifErr.message);
  } else {
    deletedNotifications = notifs ?? 0;
  }

  const { count: predLogs, error: predLogErr } = await supabaseAdmin
    .from('prediction_log')
    .delete({ count: 'exact' })
    .not('resolved_at', 'is', null)
    .lt('predicted_at', predLogCutoff);
  if (predLogErr && !predLogErr.message?.includes('does not exist')) {
    console.error('[CLEANUP] prediction_log:', predLogErr.message);
  } else {
    deletedPredictions = predLogs ?? 0;
  }

  for (const table of TRACKING_TABLES) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .delete({ count: 'exact' })
      .lt('created_at', trackingCutoff);
    if (error) {
      if (!error.message?.includes('does not exist')) {
        console.error(`[CLEANUP] ${table}:`, error.message);
      }
      continue;
    }
    deletedTracking[table] = count ?? 0;
  }

  return {
    durationMs: Date.now() - t,
    deletedMarkets,
    deletedSignals,
    deletedNotifications,
    deletedPredictions,
    deletedTracking,
  };
}
