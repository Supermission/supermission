'use client';

import { useEffect, useState } from 'react';
import { ActivityOverviewCards } from '@/components/admin/activity/ActivityOverviewCards';
import { FailureChart } from '@/components/admin/activity/FailureChart';
import { FailureBreakdown } from '@/components/admin/activity/FailureBreakdown';
import { TradeFailuresTable } from '@/components/admin/activity/TradeFailuresTable';
import { BridgeTable } from '@/components/admin/activity/BridgeTable';

interface ActivityData {
  tradeFailures: {
    total: number;
    failures24h: number;
    failures7d: number;
    bySide: { BUY: number; SELL: number };
    byStep: Array<{ step: string; count: number }>;
    byReason: Array<{ reason: string; count: number }>;
    uniqueUsersAffected: number;
    lastFailure: string | null;
  };
  bridges: {
    total: number;
    bridges24h: number;
    arrived: number;
    timeout: number;
    failed: number;
    pending: number;
    successRate: number;
    totalAmount: number;
    amountByStatus: Record<string, number>;
    lastBridge: string | null;
  };
  dailyFailures: Array<{ date: string; count: number }>;
  recentFailures: Array<{
    userAddress: string;
    side: string;
    conditionId: string | null;
    tokenId: string | null;
    amount: number | null;
    errorReason: string;
    errorStep: string | null;
    createdAt: string;
  }>;
  recentBridges: Array<{
    userAddress: string;
    amount: string;
    sourceChain: string;
    destChain: string;
    txHash: string | null;
    status: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
}

function ErrorReasonBreakdown({ data, loading }: { data: Array<{ reason: string; count: number }>; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const topReasons = data.slice(0, 8);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Top Error Reasons
      </p>

      {topReasons.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No error data
        </div>
      ) : (
        <div className="space-y-3">
          {topReasons.map((d) => {
            const pct = (d.count / total) * 100;
            return (
              <div key={d.reason}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono truncate max-w-[200px]" title={d.reason}>{d.reason}</span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">{d.count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div className="h-full rounded-full bg-red-300" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/activity/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Activity & Debugging</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Trade failures, bridge transactions, error patterns, and operational health
        </p>
      </div>

      <ActivityOverviewCards
        failures={data?.tradeFailures ?? null}
        bridges={data?.bridges ?? null}
        loading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <FailureChart data={data?.dailyFailures ?? []} loading={loading} />
        </div>
        <div>
          <FailureBreakdown data={data?.tradeFailures?.byStep ?? []} loading={loading} />
        </div>
        <div>
          <ErrorReasonBreakdown data={data?.tradeFailures?.byReason ?? []} loading={loading} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Trade Failures</h2>
        <TradeFailuresTable failures={data?.recentFailures ?? []} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">
          Bridge Transactions
          {data?.bridges && data.bridges.pending > 0 && (
            <span className="ml-2 text-[11px] font-mono text-amber-600">
              {data.bridges.pending} pending
            </span>
          )}
        </h2>
        <BridgeTable bridges={data?.recentBridges ?? []} loading={loading} />
      </div>
    </div>
  );
}
