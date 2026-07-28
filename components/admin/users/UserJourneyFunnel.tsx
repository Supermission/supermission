'use client';

interface JourneyData {
  waitlisted: number;
  approved: number;
  loggedIn: number;
  traded: number;
  activeTraders: number;
  totalTraders: number;
}

function FunnelStep({
  label,
  count,
  percentage,
  barWidth,
  isLast,
}: {
  label: string;
  count: number;
  percentage: number | null;
  barWidth: number;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-semibold text-[#1a1a1a]">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-[#1a1a1a] tabular-nums">{count.toLocaleString()}</span>
            {percentage !== null && (
              <span className="text-[10px] font-mono text-gray-400">{percentage}%</span>
            )}
          </div>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1a1a1a] rounded-full transition-all duration-500"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>
      {!isLast && (
        <div className="w-4 flex items-center justify-center text-gray-300">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function UserJourneyFunnel({ data, loading }: { data: JourneyData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const max = Math.max(data.waitlisted, 1);
  const steps = [
    { label: 'Waitlisted', count: data.waitlisted, pct: null },
    { label: 'Approved', count: data.approved, pct: data.waitlisted > 0 ? Math.round((data.approved / data.waitlisted) * 100) : 0 },
    { label: 'Logged In', count: data.loggedIn, pct: data.approved > 0 ? Math.round((data.loggedIn / data.approved) * 100) : 0 },
    { label: 'Made a Trade', count: data.traded, pct: data.loggedIn > 0 ? Math.round((data.traded / data.loggedIn) * 100) : 0 },
    { label: 'Active (7d)', count: data.activeTraders, pct: data.traded > 0 ? Math.round((data.activeTraders / data.traded) * 100) : 0 },
  ];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        User Journey Funnel
      </p>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <FunnelStep
            key={step.label}
            label={step.label}
            count={step.count}
            percentage={step.pct}
            barWidth={Math.max((step.count / max) * 100, 2)}
            isLast={i === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
