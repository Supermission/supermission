'use client';

import { useEffect, useState } from 'react';

interface PerpsData {
  sessions: {
    total: number;
    sessions24h: number;
    sessions7d: number;
    uniqueUsers: number;
    avgMessagesPerSession: number;
  };
  trades: {
    totalTrades: number;
    trades24h: number;
    trades7d: number;
    totalVolume: number;
    volume24h: number;
    byCoin: Array<{ coin: string; trades: number; volume: number; avgLeverage: number }>;
    bySide: { buy: number; sell: number };
    byOrderType: Record<string, number>;
    avgLeverage: number;
    totalPnl: number;
    profitableTrades: number;
    winRate: number;
  };
  users: {
    totalTraders: number;
    activeTraders24h: number;
    riskDistribution: Record<string, number>;
    topTraders: Array<{
      userId: string;
      walletAddress: string;
      email: string | null;
      trades: number;
      volume: number;
      pnl: number;
    }>;
  };
  recentTrades: Array<{
    coin: string;
    side: string;
    size: number;
    price: number;
    leverage: number;
    pnl: number | null;
    status: string;
    orderType: string;
    agentReasoning: string | null;
    createdAt: string;
  }>;
  dailyVolume: Array<{ date: string; volume: number; trades: number; pnl: number }>;
}

function fmt$(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPnl(v: number): string {
  const prefix = v >= 0 ? '+' : '';
  return `${prefix}${fmt$(v)}`;
}

function truncAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '--';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ---------- Skeleton Card ---------- */
function SkeletonCard() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] animate-pulse">
      <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
      <div className="h-7 bg-gray-50 rounded w-24" />
    </div>
  );
}

/* ---------- Overview Cards ---------- */
function OverviewCards({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Total Trades', value: data.trades.totalTrades.toLocaleString() },
    { label: 'Trades 24h', value: data.trades.trades24h.toLocaleString() },
    { label: 'Total Volume', value: fmt$(data.trades.totalVolume) },
    { label: 'Volume 24h', value: fmt$(data.trades.volume24h) },
    { label: 'Avg Leverage', value: `${data.trades.avgLeverage}x` },
    {
      label: 'Total P&L',
      value: fmtPnl(data.trades.totalPnl),
      color: data.trades.totalPnl >= 0 ? 'text-emerald-600' : 'text-red-500',
    },
    { label: 'Win Rate', value: `${data.trades.winRate}%` },
    { label: 'Active Traders 24h', value: data.users.activeTraders24h.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {c.label}
          </p>
          <p className={`text-2xl font-bold ${c.color ?? 'text-[#1a1a1a]'}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Volume by Coin ---------- */
function VolumeByCoin({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const coins = data.trades.byCoin.slice(0, 10);
  const maxVol = coins.length > 0 ? coins[0].volume : 1;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Volume by Coin
      </p>
      {coins.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No trade data</div>
      ) : (
        <div className="space-y-3">
          {coins.map((c) => {
            const pct = (c.volume / maxVol) * 100;
            return (
              <div key={c.coin}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-mono">{c.coin}</span>
                  <span className="text-gray-400 font-mono tabular-nums ml-2">
                    {fmt$(c.volume)} ({c.trades})
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full">
                  <div className="h-full rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Trades by Side ---------- */
function TradesBySide({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const { buy, sell } = data.trades.bySide;
  const total = buy + sell || 1;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Trades by Side
      </p>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-emerald-600 font-mono">BUY</span>
            <span className="text-gray-400 font-mono tabular-nums">{buy} ({((buy / total) * 100).toFixed(0)}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(buy / total) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-red-500 font-mono">SELL</span>
            <span className="text-gray-400 font-mono tabular-nums">{sell} ({((sell / total) * 100).toFixed(0)}%)</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full">
            <div className="h-full rounded-full bg-red-400" style={{ width: `${(sell / total) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Risk Distribution ---------- */
function RiskDistribution({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const dist = data.users.riskDistribution;
  const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
  const levels = [
    { key: 'conservative', label: 'Conservative', color: 'bg-blue-400' },
    { key: 'moderate', label: 'Moderate', color: 'bg-amber-400' },
    { key: 'aggressive', label: 'Aggressive', color: 'bg-red-400' },
  ];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 h-full shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Risk Distribution
      </p>
      <div className="space-y-3">
        {levels.map((l) => {
          const count = dist[l.key] || 0;
          const pct = (count / total) * 100;
          return (
            <div key={l.key}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-gray-600 font-mono">{l.label}</span>
                <span className="text-gray-400 font-mono tabular-nums">{count} ({pct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full">
                <div className={`h-full rounded-full ${l.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Daily Volume Chart ---------- */
function DailyVolumeChart({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
        <div className="h-40 bg-gray-50 rounded" />
      </div>
    );
  }

  const days = data.dailyVolume;
  const maxVol = Math.max(...days.map((d) => d.volume), 1);

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Daily Volume (last 30d)
      </p>
      {days.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[13px] text-gray-300">No volume data</div>
      ) : (
        <div className="flex items-end gap-[3px] h-40">
          {days.map((d) => {
            const hPct = (d.volume / maxVol) * 100;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                <div
                  className="w-full bg-blue-400 rounded-t-sm min-h-[2px] transition-colors hover:bg-blue-500"
                  style={{ height: `${hPct}%` }}
                />
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                  {d.date}: {fmt$(d.volume)} / {d.trades} trades / PnL {fmtPnl(d.pnl)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {days.length > 0 && (
        <div className="flex justify-between text-[9px] text-gray-300 mt-1">
          <span>{days[0].date}</span>
          <span>{days[days.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Top Traders Table ---------- */
function TopTradersTable({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const traders = data.users.topTraders;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <th className="pb-3 pr-4">Wallet</th>
            <th className="pb-3 pr-4">Email</th>
            <th className="pb-3 pr-4 text-right">Trades</th>
            <th className="pb-3 pr-4 text-right">Volume</th>
            <th className="pb-3 text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {traders.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-[13px] text-gray-300">
                No trader data
              </td>
            </tr>
          ) : (
            traders.map((t, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 pr-4 font-mono text-gray-600">{truncAddr(t.walletAddress)}</td>
                <td className="py-2 pr-4 text-gray-500">{t.email || '--'}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{t.trades}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{fmt$(t.volume)}</td>
                <td className={`py-2 text-right tabular-nums font-medium ${t.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {fmtPnl(t.pnl)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Recent Trades Table ---------- */
function RecentTradesTable({ data, loading }: { data: PerpsData | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 animate-pulse shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const trades = data.recentTrades;

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] px-5 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            <th className="pb-3 pr-3">Coin</th>
            <th className="pb-3 pr-3">Side</th>
            <th className="pb-3 pr-3 text-right">Size</th>
            <th className="pb-3 pr-3 text-right">Price</th>
            <th className="pb-3 pr-3 text-right">Leverage</th>
            <th className="pb-3 pr-3 text-right">P&L</th>
            <th className="pb-3 pr-3">Status</th>
            <th className="pb-3 pr-3">Order Type</th>
            <th className="pb-3 pr-3">Agent Reasoning</th>
            <th className="pb-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {trades.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-8 text-center text-[13px] text-gray-300">
                No recent trades
              </td>
            </tr>
          ) : (
            trades.map((t, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 pr-3 font-mono text-gray-600">{t.coin}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      t.side === 'buy'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-red-50 text-red-500'
                    }`}
                  >
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{t.size}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{fmt$(t.price)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{t.leverage.toFixed(2)}x</td>
                <td
                  className={`py-2 pr-3 text-right tabular-nums font-medium ${
                    t.pnl === null
                      ? 'text-gray-400'
                      : t.pnl >= 0
                        ? 'text-emerald-600'
                        : 'text-red-500'
                  }`}
                >
                  {t.pnl === null ? '--' : fmtPnl(t.pnl)}
                </td>
                <td className="py-2 pr-3 text-gray-500">{t.status}</td>
                <td className="py-2 pr-3 text-gray-500">{t.orderType}</td>
                <td className="py-2 pr-3 text-gray-500 max-w-[200px] truncate" title={t.agentReasoning || ''}>
                  {t.agentReasoning || '--'}
                </td>
                <td className="py-2 text-gray-400 whitespace-nowrap">{fmtDate(t.createdAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Page ---------- */
export default function AdminPerpsPage() {
  const [data, setData] = useState<PerpsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/perps/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setData(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-bold text-[#1a1a1a]">Perps Trading (Hyperion)</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          Trading volume, positions, P&L, and user activity across Hyperion perps
        </p>
      </div>

      <OverviewCards data={data} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <VolumeByCoin data={data} loading={loading} />
        </div>
        <div>
          <TradesBySide data={data} loading={loading} />
        </div>
        <div>
          <RiskDistribution data={data} loading={loading} />
        </div>
      </div>

      <DailyVolumeChart data={data} loading={loading} />

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Top Traders</h2>
        <TopTradersTable data={data} loading={loading} />
      </div>

      <div>
        <h2 className="text-sm font-bold text-gray-600 mb-3">Recent Trades</h2>
        <RecentTradesTable data={data} loading={loading} />
      </div>
    </div>
  );
}
