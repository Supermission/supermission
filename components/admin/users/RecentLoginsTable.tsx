'use client';

interface LoginRow {
  email: string;
  walletCount: number;
  waitlistStatus: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : status === 'pending'
        ? 'bg-amber-50 text-amber-700 border border-amber-200'
        : 'bg-gray-50 text-gray-500 border border-gray-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status || 'unknown'}
    </span>
  );
}

export function RecentLoginsTable({ logins, loading }: { logins: LoginRow[]; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['Email', 'Status', 'Wallets', 'IP', 'Browser', 'When'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                  ))}
                </tr>
              ))
            ) : logins.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No login events recorded yet</td>
              </tr>
            ) : (
              logins.map((l, i) => (
                <tr key={i} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-700">{l.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={l.waitlistStatus} /></td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">{l.walletCount}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{l.ipAddress || '-'}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-400 max-w-[200px] truncate">{l.userAgent ? l.userAgent.slice(0, 60) : '-'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{timeAgo(l.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
