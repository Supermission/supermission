'use client';

interface VolumeDay {
  date: string;
  volume: number;
  trades: number;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function VolumeChart({ data, loading }: { data: VolumeDay[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="h-40 bg-gray-50 rounded" />
      </div>
    );
  }

  const maxVolume = Math.max(...data.map((d) => d.volume), 1);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Daily Volume (30d)
      </p>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No volume data yet
        </div>
      ) : (
        <div className="flex items-end gap-[3px] h-40">
          {data.map((d) => {
            const height = (d.volume / maxVolume) * 100;
            return (
              <div key={d.date} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                <div
                  className="w-full bg-emerald-200 hover:bg-emerald-400 rounded-t transition-colors min-h-[2px]"
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#1a1a1a] text-[10px] font-mono text-white px-2 py-1 rounded-[6px] whitespace-nowrap z-10 shadow-lg">
                  {d.date.slice(5)}: {formatUsd(d.volume)} ({d.trades} trades)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
