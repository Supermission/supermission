'use client';

interface FailureDay {
  date: string;
  count: number;
}

export function FailureChart({ data, loading }: { data: FailureDay[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="h-40 bg-gray-50 rounded" />
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Daily Trade Failures (30d)
      </p>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No failure data yet
        </div>
      ) : (
        <div className="flex items-end gap-[3px] h-40">
          {data.map((d) => {
            const height = (d.count / maxCount) * 100;
            return (
              <div key={d.date} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                <div
                  className="w-full bg-red-200 hover:bg-red-400 rounded-t transition-colors min-h-[2px]"
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#1a1a1a] text-[10px] font-mono text-white px-2 py-1 rounded-[6px] whitespace-nowrap z-10 shadow-lg">
                  {d.date.slice(5)}: {d.count} failures
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
