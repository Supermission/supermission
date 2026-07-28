'use client';

interface FunnelData {
  total: number;
  approved: number;
  pending: number;
  approvalRate: number;
}

export function WaitlistFunnel({ data, loading }: { data: FunnelData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          <div className="h-8 bg-gray-100 rounded" />
          <div className="h-8 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Waitlist Funnel
      </p>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-gray-500">Total Signups</span>
            <span className="font-mono text-[#1a1a1a] font-medium">{data.total}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full bg-gray-300 rounded-full" style={{ width: '100%' }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-emerald-600">Approved</span>
            <span className="font-mono text-emerald-600 font-medium">{data.approved}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${data.total > 0 ? (data.approved / data.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[12px] mb-1">
            <span className="text-amber-600">Pending</span>
            <span className="font-mono text-amber-600 font-medium">{data.pending}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${data.total > 0 ? (data.pending / data.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-[#e5e7eb]">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-gray-400">Approval Rate</span>
            <span className="text-lg font-bold text-[#1a1a1a] tabular-nums">{data.approvalRate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
