'use client';

interface FailureData {
  total: number;
  failures24h: number;
  failures7d: number;
  bySide: { BUY: number; SELL: number };
  uniqueUsersAffected: number;
  lastFailure: string | null;
}

interface BridgeData {
  total: number;
  bridges24h: number;
  arrived: number;
  timeout: number;
  failed: number;
  pending: number;
  successRate: number;
  totalAmount: number;
  lastBridge: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Card({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`bg-white border rounded-[16px] px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] ${warn ? 'border-amber-300' : 'border-[#e5e7eb]'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-amber-600' : 'text-[#1a1a1a]'}`}>{value}</p>
      {sub && <p className="text-[11px] font-mono text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function ActivityOverviewCards({
  failures,
  bridges,
  loading,
}: {
  failures: FailureData | null;
  bridges: BridgeData | null;
  loading: boolean;
}) {
  if (loading || !failures || !bridges) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-16 mb-3" />
            <div className="h-7 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
      <Card label="Trade Failures" value={failures.total.toLocaleString()} sub={`${failures.failures24h} in 24h`} warn={failures.failures24h > 10} />
      <Card label="Failures (7d)" value={failures.failures7d.toLocaleString()} sub={`BUY: ${failures.bySide.BUY} / SELL: ${failures.bySide.SELL}`} />
      <Card label="Users Affected" value={(failures.uniqueUsersAffected || 0).toLocaleString()} sub={`last: ${timeAgo(failures.lastFailure)}`} />
      <Card label="Bridges Total" value={bridges.total.toLocaleString()} sub={`$${bridges.totalAmount.toLocaleString()} bridged`} />
      <Card label="Bridge Success" value={`${bridges.successRate}%`} sub={`${bridges.arrived} arrived`} />
      <Card label="Bridge Issues" value={(bridges.timeout + bridges.failed).toLocaleString()} sub={`${bridges.timeout} timeout / ${bridges.failed} failed`} warn={bridges.timeout + bridges.failed > 5} />
      <Card label="Bridges Pending" value={bridges.pending.toLocaleString()} sub={`${bridges.bridges24h} in 24h`} warn={bridges.pending > 3} />
    </div>
  );
}
