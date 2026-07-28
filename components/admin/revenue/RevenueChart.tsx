'use client';

interface DailyData {
  date: string;
  revenue: number;
}

function formatUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function RevenueChart({ data, loading }: { data: DailyData[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-5 h-[280px] animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-3 bg-gray-100 rounded w-32 mb-4" />
        <div className="h-full bg-gray-50 rounded" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-5 h-[280px] flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <p className="text-sm text-gray-400">No revenue data yet</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 0.01);
  const totalPeriod = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Daily Revenue (Last 30 Days)
        </p>
        <p className="text-[12px] font-mono text-gray-500">
          Total: <span className="text-[#1a1a1a] font-bold">{formatUsd(totalPeriod)}</span>
        </p>
      </div>

      <div className="flex items-end gap-[2px] h-[180px]">
        {data.map((d) => {
          const height = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0;
          const dateLabel = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <div key={d.date} className="flex-1 group relative" title={`${dateLabel}: ${formatUsd(d.revenue)}`}>
              <div className="w-full flex flex-col items-center justify-end h-[180px]">
                <div
                  className="w-full bg-emerald-200 hover:bg-emerald-400 rounded-t-sm transition-colors min-h-[2px]"
                  style={{ height: `${Math.max(height, 1)}%` }}
                />
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-[#1a1a1a] rounded-[8px] px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="text-[9px] font-mono text-white/60">{dateLabel}</p>
                  <p className="text-[11px] font-mono font-bold text-emerald-400">{formatUsd(d.revenue)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-[2px] mt-2">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {i % 7 === 0 && (
              <span className="text-[8px] font-mono text-gray-300">
                {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
