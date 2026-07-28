'use client';

import { useState, useMemo } from 'react';

interface RecentTrade {
  userAddress: string;
  email: string | null;
  conditionId: string;
  question: string | null;
  side: string;
  outcome: string;
  amount: number;
  price: number;
  shares: number;
  orderId: string | null;
  createdAt: string;
}

function formatUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SideBadge({ side }: { side: string }) {
  const styles: Record<string, string> = {
    BUY: 'bg-emerald-50 text-emerald-600',
    SELL: 'bg-red-50 text-red-500',
    REDEEM: 'bg-purple-50 text-purple-600',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${styles[side] || 'bg-gray-50 text-gray-500'}`}>
      {side}
    </span>
  );
}

const PAGE_SIZE = 20;

export function RecentTradesTable({ trades, loading }: { trades: RecentTrade[]; loading: boolean }) {
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'REDEEM'>('ALL');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (sideFilter === 'ALL') return trades;
    return trades.filter((t) => t.side === sideFilter);
  }, [trades, sideFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 rounded mb-2" />
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-6 py-12 text-center text-sm text-gray-400">
        No recent trades
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter toolbar */}
      <div className="flex items-center gap-2">
        {(['ALL', 'BUY', 'SELL', 'REDEEM'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setSideFilter(s); setPage(0); }}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-[6px] transition-colors ${
              sideFilter === s
                ? 'bg-[#1a1a1a] text-white'
                : 'bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a]'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="text-[11px] font-mono text-gray-400 ml-2">
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Trader</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Market</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Side</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Outcome</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Shares</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Order ID</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((t, i) => (
                <tr key={i} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-2.5 text-[11px] font-mono text-gray-400 whitespace-nowrap">
                    {timeAgo(t.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-[12px] font-mono text-gray-600">
                      {t.userAddress.slice(0, 6)}...{t.userAddress.slice(-4)}
                    </p>
                    {t.email && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[120px]" title={t.email}>
                        {t.email}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <p className="text-[11px] text-[#1a1a1a] truncate" title={t.question || t.conditionId}>
                      {t.question || t.conditionId.slice(0, 16) + '...'}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <SideBadge side={t.side} />
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-mono text-gray-500">
                    {t.outcome}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-[#1a1a1a] font-medium tabular-nums">
                    {formatUsd(t.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-gray-500 tabular-nums">
                    {t.price > 0 ? `${(t.price * 100).toFixed(1)}%` : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] font-mono text-gray-500 tabular-nums">
                    {t.shares > 0 ? t.shares.toFixed(2) : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-[10px] font-mono text-gray-300">
                    {t.orderId ? (
                      <span title={t.orderId} className="cursor-help">
                        {t.orderId.slice(0, 8)}...
                      </span>
                    ) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb] bg-[#f8fafc]">
            <span className="text-[11px] font-mono text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] rounded-md disabled:opacity-25 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] rounded-md disabled:opacity-25 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
