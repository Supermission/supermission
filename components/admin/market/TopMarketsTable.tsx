'use client';

interface TopMarket {
  conditionId: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  isActive: boolean;
  isClosed: boolean;
  isResolved: boolean;
  platformVolume: number;
  platformTrades: number;
  platformTraders: number;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function TopMarketsTable({ markets, loading }: { markets: TopMarket[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 rounded mb-2" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-6 py-12 text-center text-sm text-gray-400">
        No market data
      </div>
    );
  }

  const maxVolume = Math.max(...markets.map((m) => m.platformVolume), 1);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Market</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Prices</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Volume</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Trades</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Traders</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m, i) => (
              <tr key={m.conditionId} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                <td className="px-4 py-3 text-[12px] font-bold text-gray-300">{i + 1}</td>
                <td className="px-4 py-3 max-w-[280px]">
                  <p className="text-[12px] text-[#1a1a1a] font-medium truncate" title={m.question}>
                    {m.question || m.conditionId.slice(0, 16) + '...'}
                  </p>
                  {/* Volume bar */}
                  <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1a1a1a] rounded-full transition-all"
                      style={{ width: `${(m.platformVolume / maxVolume) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  {m.isResolved ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-50 text-purple-600">Resolved</span>
                  ) : m.isClosed ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">Closed</span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-600">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {m.outcomes.map((o, idx) => (
                      <span key={idx} className="text-[11px] font-mono">
                        <span className="text-gray-400">{o}:</span>{' '}
                        <span className={m.outcomePrices[idx] >= 0.5 ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                          {((m.outcomePrices[idx] || 0) * 100).toFixed(0)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-[#1a1a1a] font-medium tabular-nums">
                  {formatUsd(m.platformVolume)}
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                  {m.platformTrades}
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                  {m.platformTraders}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
