import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { fetchAllRows } from '@/lib/admin/db';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // fetchAllRows paginates past the 1000-row Supabase cap. The previous
    // .limit(500) meant totals and 24h/7d counters silently maxed out at 500.
    const [failures, bridgeRows] = await Promise.all([
      fetchAllRows(
        'trade_failures',
        'id, user_address, side, condition_id, token_id, amount, error_reason, error_step, metadata, created_at',
        (q) => q.order('created_at', { ascending: false }),
      ),
      fetchAllRows(
        'bridge_transactions',
        'id, user_address, amount, source_chain, dest_chain, tx_hash, deposit_address, status, error_message, created_at',
        (q) => q.order('created_at', { ascending: false }),
      ),
    ]);

    const now = Date.now();
    const oneDayAgo = now - 86_400_000;
    const oneWeekAgo = now - 7 * 86_400_000;

    // --- Trade failure stats ---
    let failures24h = 0;
    let failures7d = 0;
    const failuresByStep = new Map<string, number>();
    const failuresBySide: Record<string, number> = { BUY: 0, SELL: 0 };
    const failuresByDay = new Map<string, number>();

    for (const f of failures) {
      const ts = new Date(f.created_at).getTime();
      if (ts >= oneDayAgo) failures24h++;
      if (ts >= oneWeekAgo) failures7d++;
      const step = f.error_step || 'unknown';
      failuresByStep.set(step, (failuresByStep.get(step) || 0) + 1);
      // Normalize to match the pre-declared BUY/SELL buckets; a lowercase
      // 'buy' from a new writer would otherwise create a separate slot.
      const side = (f.side || 'UNKNOWN').toUpperCase();
      failuresBySide[side] = (failuresBySide[side] || 0) + 1;
      const day = new Date(f.created_at).toISOString().slice(0, 10);
      failuresByDay.set(day, (failuresByDay.get(day) || 0) + 1);
    }

    // --- Bridge stats ---
    let bridgesInitiated = 0;
    let bridgesArrived = 0;
    let bridgesTimeout = 0;
    let bridgesFailed = 0;
    let bridgesPending = 0;
    let bridges24h = 0;
    let totalBridgeAmount = 0;

    for (const b of bridgeRows) {
      const ts = new Date(b.created_at).getTime();
      if (ts >= oneDayAgo) bridges24h++;
      totalBridgeAmount += Number(b.amount) || 0;

      switch (b.status) {
        case 'initiated': bridgesInitiated++; break;
        case 'tx_sent': bridgesPending++; break;
        case 'arrived': bridgesArrived++; break;
        case 'timeout': bridgesTimeout++; break;
        case 'failed': bridgesFailed++; break;
      }
    }

    // Success rate denominator = terminal bridges only. Including `initiated`
    // and `tx_sent` (still in flight) silently lowers the rate until they land.
    const terminalBridges = bridgesArrived + bridgesTimeout + bridgesFailed;
    const bridgeSuccessRate = terminalBridges > 0
      ? Math.round((bridgesArrived / terminalBridges) * 10000) / 100
      : 0;

    // Failure reasons breakdown
    const failuresByReason = new Map<string, number>();
    for (const f of failures) {
      const reason = f.error_reason || 'unknown';
      failuresByReason.set(reason, (failuresByReason.get(reason) || 0) + 1);
    }
    const failureReasonBreakdown = Array.from(failuresByReason.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Top failure reasons
    const failureStepBreakdown = Array.from(failuresByStep.entries())
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);

    // Daily failure chart
    const dailyFailures = Array.from(failuresByDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Recent trade failures (last 50)
    const recentFailures = failures.slice(0, 50).map((f) => ({
      userAddress: f.user_address,
      side: f.side,
      conditionId: f.condition_id,
      tokenId: f.token_id,
      amount: f.amount,
      errorReason: f.error_reason,
      errorStep: f.error_step,
      createdAt: f.created_at,
    }));

    // Recent bridges (last 50)
    const recentBridges = bridgeRows.slice(0, 50).map((b) => ({
      userAddress: b.user_address,
      amount: b.amount,
      sourceChain: b.source_chain,
      destChain: b.dest_chain,
      txHash: b.tx_hash,
      status: b.status,
      errorMessage: b.error_message,
      createdAt: b.created_at,
    }));

    // Bridge amount by status
    const bridgeAmountByStatus: Record<string, number> = {};
    for (const b of bridgeRows) {
      const status = b.status || 'unknown';
      bridgeAmountByStatus[status] = (bridgeAmountByStatus[status] || 0) + (Number(b.amount) || 0);
    }

    // Unique users affected by failures
    const failedUsers = new Set(failures.map((f) => f.user_address));

    // Most recent failure/bridge timestamps
    const lastFailure = failures.length > 0 ? failures[0].created_at : null;
    const lastBridge = bridgeRows.length > 0 ? bridgeRows[0].created_at : null;

    return NextResponse.json({
      tradeFailures: {
        total: failures.length,
        failures24h,
        failures7d,
        bySide: failuresBySide,
        byStep: failureStepBreakdown,
        byReason: failureReasonBreakdown,
        uniqueUsersAffected: failedUsers.size,
        lastFailure,
      },
      bridges: {
        total: bridgeRows.length,
        bridges24h,
        initiated: bridgesInitiated,
        arrived: bridgesArrived,
        timeout: bridgesTimeout,
        failed: bridgesFailed,
        pending: bridgesPending,
        successRate: bridgeSuccessRate,
        totalAmount: Math.round(totalBridgeAmount * 100) / 100,
        amountByStatus: bridgeAmountByStatus,
        lastBridge,
      },
      dailyFailures,
      recentFailures,
      recentBridges,
    });
  } catch (err: any) {
    console.error('Admin activity overview error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity data' }, { status: 500 });
  }
}
