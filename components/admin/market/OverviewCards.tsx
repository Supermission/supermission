'use client';

interface OverviewData {
  totalTraders: number;
  totalTrades: number;
  totalVolume: number;
  tradingVolume: number;
  buyVolume: number;
  sellVolume: number;
  redeemVolume: number;
  marketsTraded: number;
  buys: number;
  sells: number;
  redeems: number;
  tradingVolume24h: number;
  tradingVolume7d: number;
  trades24h: number;
  traders24h: number;
  platformPnl: {
    realizedPnl: number;
    unrealizedPnl: number;
    netPnl: number;
    totalInvested: number;
  };
  marketStatus: {
    total: number;
    active: number;
    closed: number;
    resolved: number;
  };
}

function formatUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-shadow">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${accent || 'text-[#1a1a1a]'}`}>{value}</p>
      {sub && (
        <p className="text-[11px] font-mono text-gray-400 mt-1">{sub}</p>
      )}
    </div>
  );
}

export function OverviewCards({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-4 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-16 mb-3" />
            <div className="h-7 bg-gray-100 rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  const pnl = data.platformPnl;
  const pnlAccent = pnl.netPnl > 0 ? 'text-emerald-600' : pnl.netPnl < 0 ? 'text-red-500' : 'text-[#1a1a1a]';
  const pnlPrefix = pnl.netPnl > 0 ? '+' : '';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        label="Total Traders"
        value={data.totalTraders.toLocaleString()}
        sub={`${data.traders24h} active 24h`}
      />
      <Card
        label="Total Trades"
        value={data.totalTrades.toLocaleString()}
        sub={`${data.buys} buys / ${data.sells} sells / ${data.redeems} redeems`}
      />
      <Card
        label="Trading Volume"
        value={formatUsd(data.tradingVolume)}
        sub={`${formatUsd(data.tradingVolume24h)} 24h / ${formatUsd(data.tradingVolume7d)} 7d`}
      />
      <Card
        label="Buy / Sell Volume"
        value={`${formatUsd(data.buyVolume)} / ${formatUsd(data.sellVolume)}`}
        sub={`${data.trades24h} trades in 24h`}
      />
      <Card
        label="Redeemed"
        value={formatUsd(data.redeemVolume)}
        sub={`${data.redeems} redemptions`}
      />
      <Card
        label="Users Net P&L"
        value={`${pnlPrefix}${formatUsd(pnl.netPnl)}`}
        sub={`Realized ${formatUsd(pnl.realizedPnl)} / Unrealized ${formatUsd(pnl.unrealizedPnl)}`}
        accent={pnlAccent}
      />
      <Card
        label="Active Markets"
        value={data.marketStatus?.active?.toLocaleString() || '0'}
        sub={`${data.marketStatus?.closed || 0} closed / ${data.marketStatus?.resolved || 0} resolved`}
      />
      <Card
        label="Markets Traded"
        value={data.marketsTraded.toLocaleString()}
        sub={`${data.marketStatus?.total || 0} total in catalog`}
      />
    </div>
  );
}
