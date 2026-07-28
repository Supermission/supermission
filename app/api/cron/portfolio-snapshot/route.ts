/**
 * Daily Portfolio Snapshot Cron
 * GET /api/cron/portfolio-snapshot
 *
 * Runs daily at midnight UTC via Vercel Cron.
 * Snapshots each active user's portfolio value from Polymarket positions API,
 * enabling accurate period PnL (1D, 1W, 1M, 1Y) calculations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // 1. Get all unique user addresses that have traded
    const { data: users, error: usersError } = await supabaseAdmin
      .from('trade_history')
      .select('user_address')
      .limit(10000);

    if (usersError) {
      console.error('[Portfolio Snapshot] Failed to fetch users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    const uniqueAddresses = [...new Set((users || []).map((u: any) => u.user_address))];

    if (uniqueAddresses.length === 0) {
      return NextResponse.json({ success: true, message: 'No users to snapshot', snapshotted: 0 });
    }

    // 2. For each user, fetch positions from Polymarket and snapshot
    let snapshotted = 0;
    let skipped = 0;
    const batchSize = 5;

    for (let i = 0; i < uniqueAddresses.length; i += batchSize) {
      const batch = uniqueAddresses.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (address) => {
          try {
            const res = await fetch(`https://data-api.polymarket.com/positions?user=${address}`, {
              signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) return { address, totalValue: 0, positions: [] };

            const positionsData = await res.json();
            let totalValue = 0;
            const positions: { conditionId: string; outcome: string; size: number; price: number }[] = [];

            for (const p of positionsData || []) {
              const size = typeof p.size === 'string' ? parseFloat(p.size) : (p.size || 0);
              const curPrice = typeof p.curPrice === 'string' ? parseFloat(p.curPrice) : (p.curPrice || 0);
              if (size > 0) {
                const conditionId = p.asset?.condition_id || p.conditionId || '';
                const outcome = p.asset?.outcome || p.outcome || 'Yes';
                totalValue += size * curPrice;
                positions.push({ conditionId, outcome, size, price: curPrice });
              }
            }

            return { address, totalValue: Math.round(totalValue * 100) / 100, positions };
          } catch (error) {
            console.warn('[cron/portfolio-snapshot] snapshot failed for', address, error);
            return { address, totalValue: 0, positions: [] };
          }
        })
      );

      // Upsert snapshots
      for (const result of results) {
        // Skip users with no positions and $0 value — no point storing empty snapshots
        if (result.positions.length === 0 && result.totalValue === 0) {
          skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from('portfolio_snapshots')
          .upsert(
            {
              user_address: result.address,
              snapshot_date: today,
              total_value: result.totalValue,
              positions: result.positions,
            },
            { onConflict: 'user_address,snapshot_date' }
          );

        if (error) {
          console.error(`[Portfolio Snapshot] Failed to upsert for ${result.address}:`, error);
        } else {
          snapshotted++;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Portfolio Snapshot] Done: ${snapshotted} snapshotted, ${skipped} skipped in ${duration}ms`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      totalUsers: uniqueAddresses.length,
      snapshotted,
      skipped,
    });
  } catch (error) {
    console.error('[Portfolio Snapshot] Error:', error);
    return NextResponse.json(
      { error: 'Snapshot failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
