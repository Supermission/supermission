// components/dashboard/activity/TradeStatsStrip.tsx
'use client';

import type { TradeActivityStats } from '@/lib/types/trading-activity';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface TradeStatsStripProps {
  stats: TradeActivityStats;
}

export function TradeStatsStrip({ stats }: TradeStatsStripProps) {
  const items = [
    { label: 'Trades', value: String(stats.totalTrades) },
    { label: 'Volume', value: `$${stats.totalVolume >= 1000 ? `${(stats.totalVolume / 1000).toFixed(1)}K` : stats.totalVolume.toFixed(0)}` },
    { label: 'Win Rate', value: `${stats.winRate.toFixed(0)}%`, color: stats.winRate >= 50 ? 'text-emerald-600' : 'text-rose-500' },
    { label: 'Total P&L', value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`, color: stats.totalPnl >= 0 ? 'text-emerald-600' : 'text-rose-500' },
    { label: 'Best', value: `+$${stats.bestTrade.toFixed(2)}`, color: 'text-emerald-600' },
    { label: 'Worst', value: `${stats.worstTrade >= 0 ? '+' : ''}$${stats.worstTrade.toFixed(2)}`, color: 'text-rose-500' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-[#fafbfc] border border-[#e5e7eb] rounded-[10px] px-3 py-2.5 text-center">
          <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-0.5" style={{ fontFamily: FONT }}>
            {item.label}
          </span>
          <span className={`text-[14px] font-bold tabular-nums block ${item.color || 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
