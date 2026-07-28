'use client';

interface UserRow {
  address: string;
  email: string | null;
  totalSpent: number;
  requests: number;
  lastUsed: string;
}

function formatUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function TopUsersTable({ users, loading }: { users: UserRow[]; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['#', 'User', 'Email', 'Total Spent', 'Requests', 'Last Active'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No paying users yet</td>
              </tr>
            ) : (
              users.map((user, i) => (
                <tr key={user.address} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-300 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-600">{user.address.slice(0, 6)}...{user.address.slice(-4)}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">
                    {user.email || <span className="text-gray-300 italic">unknown</span>}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono font-bold text-emerald-600 tabular-nums">{formatUsd(user.totalSpent)}</td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">{user.requests}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400 whitespace-nowrap">{formatDate(user.lastUsed)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
