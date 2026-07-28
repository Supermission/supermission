'use client';

interface AgentRow {
  agentId: string;
  agentName: string;
  revenue: number;
  requests: number;
  uniqueUsers: number;
  avgPayment: number;
}

function formatUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(4)}`;
}

const AGENT_COLORS = [
  'bg-blue-50 text-blue-700 border border-blue-200',
  'bg-purple-50 text-purple-700 border border-purple-200',
  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'bg-amber-50 text-amber-700 border border-amber-200',
  'bg-rose-50 text-rose-700 border border-rose-200',
  'bg-cyan-50 text-cyan-700 border border-cyan-200',
];

// Largest-remainder: percentages rounded to 1dp sum to exactly 100.0.
// Plain toFixed(1) causes "33.3 + 33.3 + 33.3 = 99.9" which looks broken.
function allocateShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const scaled = values.map((v) => (v / total) * 1000); // tenths of a percent
  const floors = scaled.map(Math.floor);
  let remainder = 1000 - floors.reduce((s, v) => s + v, 0);
  const order = scaled
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < order.length; k++) floors[order[k].i]++;
  return floors.map((f) => f / 10);
}

export function AgentRevenueTable({ agents, loading }: { agents: AgentRow[]; loading: boolean }) {
  const shares = allocateShares(agents.map((a) => a.revenue));

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              {['Agent', 'Revenue', 'Share', 'Requests', 'Unique Users', 'Avg Payment'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No agent revenue data yet</td>
              </tr>
            ) : (
              agents.map((agent, i) => {
                const share = shares[i] ?? 0;
                return (
                  <tr key={agent.agentId} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${AGENT_COLORS[i % AGENT_COLORS.length]}`}>
                        {agent.agentName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-mono font-bold text-[#1a1a1a] tabular-nums">
                      {formatUsd(agent.revenue)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-400 rounded-full" style={{ width: `${Math.min(share, 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-mono text-gray-500 tabular-nums">{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-600 tabular-nums">{agent.requests.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">{agent.uniqueUsers}</td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-400 tabular-nums">{formatUsd(agent.avgPayment)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
