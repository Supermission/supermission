'use client';

interface FailureRow {
  userAddress: string;
  side: string;
  conditionId: string | null;
  tokenId: string | null;
  amount: number | null;
  errorReason: string;
  errorStep: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function SideBadge({ side }: { side: string }) {
  const cls = side === 'BUY' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{side}</span>;
}

function StepBadge({ step }: { step: string | null }) {
  if (!step) return <span className="text-[11px] text-gray-300">-</span>;
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
      {step}
    </span>
  );
}

export function TradeFailuresTable({ failures, loading }: { failures: FailureRow[]; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['User', 'Side', 'Step', 'Amount', 'Error', 'When'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : failures.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No trade failures recorded yet</td>
              </tr>
            ) : (
              failures.map((f, i) => (
                <tr key={i} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-600">
                    {f.userAddress ? `${f.userAddress.slice(0, 6)}...${f.userAddress.slice(-4)}` : '-'}
                  </td>
                  <td className="px-4 py-3"><SideBadge side={f.side} /></td>
                  <td className="px-4 py-3"><StepBadge step={f.errorStep} /></td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                    {f.amount != null ? `$${Number(f.amount).toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-red-500 max-w-[300px] truncate" title={f.errorReason}>
                    {f.errorReason}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{timeAgo(f.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
