'use client';

interface PaymentData {
  completed: number;
  failed: number;
  pending: number;
}

export function PaymentStats({
  data,
  successRate,
  loading,
}: {
  data: PaymentData | null;
  successRate: number;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-5 h-[280px] animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-3 bg-gray-100 rounded w-32 mb-4" />
        <div className="h-full bg-gray-50 rounded" />
      </div>
    );
  }

  const total = data.completed + data.failed + data.pending;
  const completedPct = total > 0 ? (data.completed / total) * 100 : 0;
  const failedPct = total > 0 ? (data.failed / total) * 100 : 0;
  const pendingPct = total > 0 ? (data.pending / total) * 100 : 0;

  const items = [
    { label: 'Completed', count: data.completed, pct: completedPct, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
    { label: 'Failed', count: data.failed, pct: failedPct, color: 'bg-red-500', textColor: 'text-red-500' },
    { label: 'Pending', count: data.pending, pct: pendingPct, color: 'bg-amber-500', textColor: 'text-amber-600' },
  ];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-5 h-[280px] flex flex-col shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Payment Success Rate
      </p>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-5xl font-bold text-[#1a1a1a] tabular-nums">{successRate}%</p>
          <p className="text-[11px] font-mono text-gray-400 mt-1">{total} total payments</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
          {items.map((item) =>
            item.pct > 0 ? (
              <div key={item.label} className={`${item.color} transition-all`} style={{ width: `${item.pct}%` }} />
            ) : null
          )}
        </div>

        <div className="flex items-center gap-4 mt-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.color}`} />
              <span className="text-[10px] text-gray-400">{item.label}</span>
              <span className={`text-[10px] font-bold ${item.textColor} tabular-nums`}>{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
