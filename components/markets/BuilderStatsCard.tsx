'use client';

import { useState, useEffect } from 'react';

interface BuilderTrade {
  id: string;
  market: string;
  side: string;
  size: string;
  price: string;
  timestamp: string;
}

interface BuilderStats {
  trades: BuilderTrade[];
  totalVolume: number;
  tradeCount: number;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function BuilderStatsCard() {
  const [stats, setStats] = useState<BuilderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/markets/builder-stats');
        if (!res.ok) {
          setUnavailable(true);
          return;
        }
        const data: BuilderStats = await res.json();
        // If no trades returned and tradeCount is 0, the builder key may not be configured
        if (data.tradeCount === 0 && data.trades.length === 0) {
          setUnavailable(true);
          return;
        }
        setStats(data);
      } catch {
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4">
        <div className="mb-3 h-5 w-40 animate-pulse rounded bg-[#f0f0f0]" />
        <div className="space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-[#f0f0f0]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[#f0f0f0]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[#f0f0f0]" />
        </div>
      </div>
    );
  }

  // Unavailable state
  if (unavailable || !stats) {
    return (
      <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-2 w-2 rounded-full bg-[#d1d5db]" />
          <span className="text-sm font-medium text-[#6b7280]">
            Supermission Builder Stats
          </span>
        </div>
        <p className="text-xs text-[#9ca3af]">Builder stats unavailable</p>
      </div>
    );
  }

  const recentTrades = stats.trades.slice(0, 5);

  return (
    <div className="rounded-[12px] border border-[#e5e7eb] bg-white p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-violet-500" />
        <span className="text-sm font-medium text-[#3a3a3a]">
          Supermission Builder Stats
        </span>
      </div>

      {/* Summary row */}
      <div className="flex gap-6 mb-4">
        <div>
          <p className="text-xs text-[#6b7280]">
            Total Trades
          </p>
          <p className="text-lg font-mono font-semibold text-[#3a3a3a]">
            {stats.tradeCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#6b7280]">
            Total Volume
          </p>
          <p className="text-lg font-mono font-semibold text-[#3a3a3a]">
            {formatUsd(stats.totalVolume)}
          </p>
        </div>
      </div>

      {/* Recent trades */}
      {recentTrades.length > 0 && (
        <div>
          <p className="text-xs text-[#6b7280] mb-2">
            Recent Trades
          </p>
          <div className="space-y-1.5">
            {recentTrades.map((trade) => (
              <div
                key={trade.id}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded font-medium ${
                      trade.side === 'BUY'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {trade.side}
                  </span>
                  <span className="text-[#6b7280] truncate max-w-[180px]">
                    {trade.market.slice(0, 10)}...
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-[#3a3a3a]">
                    {formatUsd(
                      parseFloat(trade.size) * parseFloat(trade.price)
                    )}
                  </span>
                  <span className="text-[#9ca3af] w-14 text-right">
                    {timeAgo(trade.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
