'use client';

interface StepEntry {
  step: string;
  count: number;
}

const STEP_COLORS: Record<string, string> = {
  balance_check: 'bg-blue-400',
  compliance: 'bg-purple-400',
  bridge: 'bg-cyan-400',
  order_submit: 'bg-amber-400',
  approval: 'bg-rose-400',
  checking_balance: 'bg-blue-400',
  approving: 'bg-rose-400',
  submitting: 'bg-amber-400',
  bridging: 'bg-cyan-400',
  unknown: 'bg-gray-300',
};

export function FailureBreakdown({ data, loading }: { data: StepEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Failures by Step
      </p>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">
          No failure data
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => {
            const pct = (d.count / total) * 100;
            const color = STEP_COLORS[d.step] || STEP_COLORS.unknown;
            return (
              <div key={d.step}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono">{d.step}</span>
                  <span className="text-gray-400 font-mono tabular-nums">{d.count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
