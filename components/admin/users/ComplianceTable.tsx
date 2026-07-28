'use client';

interface ScreeningRow {
  address: string;
  chain: string;
  riskLevel: string | null;
  riskScore: number | null;
  flags: string[] | null;
  isBlocked: boolean;
  result: string;
  errorMessage: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function ResultBadge({ result, isBlocked }: { result: string; isBlocked: boolean }) {
  if (isBlocked) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">BLOCKED</span>;
  const cls =
    result === 'pass' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : result === 'fail' ? 'bg-red-50 text-red-600 border border-red-200'
        : result === 'error' ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-gray-50 text-gray-500 border border-gray-200';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{result}</span>;
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-[11px] text-gray-300">-</span>;
  const cls =
    level === 'SEVERE' ? 'text-red-600 font-bold'
      : level === 'HIGH' ? 'text-orange-600 font-bold'
        : level === 'MEDIUM' ? 'text-amber-600 font-semibold'
          : 'text-emerald-600';
  return <span className={`text-[11px] font-mono ${cls}`}>{level}</span>;
}

export function ComplianceTable({ screenings, loading }: { screenings: ScreeningRow[]; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['Address', 'Chain', 'Result', 'Risk', 'Score', 'Flags', 'When'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : screenings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No compliance screenings recorded yet</td>
              </tr>
            ) : (
              screenings.map((s, i) => (
                <tr key={i} className={`border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors ${s.isBlocked ? 'bg-red-50/50' : ''}`}>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-600">{s.address.slice(0, 6)}...{s.address.slice(-4)}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-500">{s.chain}</td>
                  <td className="px-4 py-3"><ResultBadge result={s.result} isBlocked={s.isBlocked} /></td>
                  <td className="px-4 py-3"><RiskBadge level={s.riskLevel} /></td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">{s.riskScore != null ? s.riskScore : '-'}</td>
                  <td className="px-4 py-3 text-[10px] text-gray-400 max-w-[200px] truncate">{s.flags && s.flags.length > 0 ? s.flags.join(', ') : s.errorMessage || '-'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{timeAgo(s.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
