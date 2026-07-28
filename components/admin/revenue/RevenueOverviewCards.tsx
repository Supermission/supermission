'use client';

import type { ReactNode } from 'react';

interface OverviewData {
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
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n < 1 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: ReactNode; accent?: string }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${accent || 'text-[#1a1a1a]'}`}>{value}</p>
      {sub && <p className="text-[11px] font-mono text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function RevenueOverviewCards({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-16 mb-3" />
            <div className="h-7 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  const growthSub = data.growthRate7d != null && data.growthRate7d !== 0
    ? <span className={data.growthRate7d > 0 ? 'text-green-600' : 'text-red-500'}>
        {data.growthRate7d > 0 ? '▲' : '▼'} {Math.abs(data.growthRate7d)}% vs prev 7d
      </span>
    : `${formatUsd(data.revenue30d)} in 30d`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <Card label="Total Revenue" value={formatUsd(data.totalRevenue)} sub={`${formatUsd(data.revenue24h)} in 24h`} />
      <Card label="7-Day Revenue" value={formatUsd(data.revenue7d)} sub={growthSub} />
      <Card label="Total Requests" value={data.totalRequests.toLocaleString()} sub={`${data.requests24h} in 24h`} />
      <Card label="Unique Users" value={data.uniqueUsers.toLocaleString()} />
      <Card label="ARPU" value={formatUsd(data.arpu)} sub="avg revenue per user" />
      <Card label="Success Rate" value={`${data.successRate}%`} />
    </div>
  );
}
