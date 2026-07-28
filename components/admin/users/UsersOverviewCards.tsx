'use client';

interface OverviewData {
  totalUsers: number;
  totalWallets: number;
  logins24h: number;
  logins7d: number;
  totalLogins: number;
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-[#1a1a1a] tabular-nums">{value}</p>
      {sub && <p className="text-[11px] font-mono text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function UsersOverviewCards({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-16 mb-3" />
            <div className="h-7 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card label="Total Users" value={data.totalUsers.toLocaleString()} sub={`${data.totalWallets} wallets mapped`} />
      <Card label="Logins Today" value={data.logins24h.toLocaleString()} />
      <Card label="Logins (7d)" value={data.logins7d.toLocaleString()} />
      <Card label="Total Sessions" value={data.totalLogins.toLocaleString()} />
      <Card label="Wallets Mapped" value={data.totalWallets.toLocaleString()} />
    </div>
  );
}
