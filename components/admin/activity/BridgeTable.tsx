'use client';

interface BridgeRow {
  userAddress: string;
  amount: string;
  sourceChain: string;
  destChain: string;
  txHash: string | null;
  status: string;
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

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'arrived' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : status === 'tx_sent' ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : status === 'initiated' ? 'bg-gray-50 text-gray-500 border border-gray-200'
          : status === 'timeout' ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : status === 'failed' ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-gray-50 text-gray-500 border border-gray-200';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

export function BridgeTable({ bridges, loading }: { bridges: BridgeRow[]; loading: boolean }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['User', 'Amount', 'Route', 'Status', 'Tx Hash', 'Error', 'When'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : bridges.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No bridge transactions recorded yet</td>
              </tr>
            ) : (
              bridges.map((b, i) => (
                <tr key={i} className={`border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors ${b.status === 'failed' || b.status === 'timeout' ? 'bg-red-50/50' : ''}`}>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-600">
                    {b.userAddress ? `${b.userAddress.slice(0, 6)}...${b.userAddress.slice(-4)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-gray-600 tabular-nums">
                    ${parseFloat(b.amount || '0').toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-500">
                    {b.sourceChain} → {b.destChain}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-[10px] font-mono text-gray-400">
                    {b.txHash ? `${b.txHash.slice(0, 10)}...` : '-'}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-red-500 max-w-[200px] truncate">
                    {b.errorMessage || '-'}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{timeAgo(b.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
