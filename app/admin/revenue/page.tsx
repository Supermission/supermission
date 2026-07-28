'use client';

import { useEffect, useState } from 'react';
import { RevenueOverviewCards } from '@/components/admin/revenue/RevenueOverviewCards';
import { AgentRevenueTable } from '@/components/admin/revenue/AgentRevenueTable';
import { TopUsersTable } from '@/components/admin/revenue/TopUsersTable';
import { RevenueChart } from '@/components/admin/revenue/RevenueChart';
import { PaymentStats } from '@/components/admin/revenue/PaymentStats';

interface RevenueData {
  overview: {
    totalRevenue: number;
    revenue24h: number;
    revenue7d: number;
    revenue30d: number;
    totalRequests: number;
    requests24h: number;
    uniqueUsers: number;
    successRate: number;
    growthRate7d: number | null;
    arpu: number;
    paymentStats: { completed: number; failed: number; pending: number };
    failureBreakdown: Record<string, number>;
  };
  agents: Array<{
    agentId: string;
    agentName: string;
    revenue: number;
    requests: number;
    uniqueUsers: number;
    avgPayment: number;
  }>;
  topUsers: Array<{
    address: string;
    email: string | null;
    totalSpent: number;
    requests: number;
    lastUsed: string;
  }>;
  dailyRevenue: Array<{ date: string; revenue: number }>;
}

function PaymentFailureBreakdown({ data, loading }: { data: Record<string, number> | null; loading: boolean }) {
  if (loading || !data) return null;

  const entries = Object.entries(data).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  const total = entries.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Payment Failure Breakdown
      </p>
      <div className="space-y-2">
        {entries.map(([status, count]) => (
          <div key={status} className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                status === 'failed' ? 'bg-red-50 text-red-500' :
                status === 'expired' ? 'bg-amber-50 text-amber-600' :
                'bg-gray-100 text-gray-500'
              }`}>{status}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    status === 'failed' ? 'bg-red-300' : status === 'expired' ? 'bg-amber-300' : 'bg-gray-300'
                  }`}
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] font-mono text-gray-500 tabular-nums ml-3">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/revenue/overview')
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
        <h1 className="text-xl font-bold text-[#1a1a1a]">Revenue Dashboard</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Platform earnings from x402 agent payments, per-agent breakdown, growth metrics, and user spending
        </p>
      </div>

      <RevenueOverviewCards data={data?.overview ?? null} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RevenueChart data={data?.dailyRevenue ?? []} loading={loading} />
        </div>
        <div className="space-y-4">
          <PaymentStats data={data?.overview?.paymentStats ?? null} successRate={data?.overview?.successRate ?? 0} loading={loading} />
          <PaymentFailureBreakdown data={data?.overview?.failureBreakdown ?? null} loading={loading} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Revenue by Agent</h2>
        <AgentRevenueTable agents={data?.agents ?? []} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Top Paying Users</h2>
        <TopUsersTable users={data?.topUsers ?? []} loading={loading} />
      </div>
    </div>
  );
}
