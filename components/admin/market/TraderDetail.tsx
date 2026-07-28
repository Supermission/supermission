'use client';

import { useEffect, useState } from 'react';

interface Position {
  conditionId: string;
  question: string;
  outcome: string;
  buyShares: number;
  buyCost: number;
  sellShares: number;
  sellRevenue: number;
  openShares: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  currentPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  isClosed: boolean;
  isResolved: boolean;
  resolvedWinner: string | null;
  isWinner: boolean;
  isLoser: boolean;
}

interface Trade {
  id: string;
  condition_id: string;
  side: string;
  outcome: string;
  amount: number;
  price: number;
  shares: number;
  created_at: string;
  marketQuestion: string | null;
  source: 'internal' | 'polymarket';
  transactionHash?: string;
}

interface Analytics {
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  netPnl: number;
  totalInvested: number;
  roi: number;
  wins: number;
  losses: number;
  openPositions: number;
  resolvedPositions: number;
}

interface TraderData {
  address: string;
  polyProfile: { username?: string; volume?: number; positions?: number } | null;
  internalTrades: Trade[];
  externalTrades: Trade[];
  positions: Position[];
  totalTrades: number;
  totalVolume: number;
  analytics: Analytics;
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function PnlBadge({ value, large }: { value: number; large?: boolean }) {
  if (value === 0) return <span className="text-gray-300">$0.00</span>;
  const color = value > 0 ? 'text-emerald-600' : 'text-red-500';
  const prefix = value > 0 ? '+' : '';
  return <span className={`font-semibold ${color} ${large ? 'text-lg' : ''}`}>{prefix}{formatUsd(value)}</span>;
}

export function TraderDetail({ address, onClose }: { address: string; onClose: () => void }) {
  const [data, setData] = useState<TraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'positions' | 'trades'>('positions');

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/admin/market/traders/${address}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [address]);

  const allTrades = data ? [...data.internalTrades, ...data.externalTrades].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white border border-[#e5e7eb] rounded-[16px] w-full max-w-5xl max-h-[80vh] overflow-hidden flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-sm font-bold text-[#1a1a1a] font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </h2>
            {data?.polyProfile?.username && (
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                @{data.polyProfile.username}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-[#1a1a1a] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#1a1a1a] rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : data ? (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-[#e5e7eb] border-b border-[#e5e7eb]">
              {[
                { label: 'Total Trades', value: data.totalTrades.toString() },
                { label: 'Volume', value: formatUsd(data.totalVolume) },
                { label: 'Invested', value: formatUsd(data.analytics.totalInvested) },
                { label: 'Net P&L', value: data.analytics.netPnl, isPnl: true },
                { label: 'ROI', value: `${data.analytics.roi > 0 ? '+' : ''}${data.analytics.roi.toFixed(1)}%`, isRoi: true, roiVal: data.analytics.roi },
                { label: 'W / L', value: `${data.analytics.wins} / ${data.analytics.losses}` },
                { label: 'Realized', value: data.analytics.totalRealizedPnl, isPnl: true },
                { label: 'Unrealized', value: data.analytics.totalUnrealizedPnl, isPnl: true },
              ].map((stat) => (
                <div key={stat.label} className="bg-white px-4 py-3">
                  <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{stat.label}</p>
                  {stat.isPnl ? (
                    <p className="text-[14px] font-bold tabular-nums">
                      <PnlBadge value={stat.value as number} />
                    </p>
                  ) : (
                    <p className={`text-[14px] font-bold tabular-nums ${
                      (stat as any).isRoi
                        ? (stat as any).roiVal > 0 ? 'text-emerald-600' : (stat as any).roiVal < 0 ? 'text-red-500' : 'text-[#1a1a1a]'
                        : 'text-[#1a1a1a]'
                    }`}>{stat.value}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-4 pt-3 bg-[#f8fafc]">
              {(['positions', 'trades'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-[8px] transition-colors ${
                    tab === t
                      ? 'bg-white text-[#1a1a1a] shadow-sm border border-[#e5e7eb]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {t === 'positions' ? `Positions (${data.positions.length})` : `All Trades (${allTrades.length})`}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 bg-[#f8fafc]">
              {tab === 'positions' ? (
                <div className="space-y-2">
                  {data.positions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No positions</p>
                  ) : (
                    data.positions.map((pos, i) => (
                      <div key={i} className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <p className="text-[12px] font-semibold text-[#1a1a1a] flex-1 line-clamp-2">
                            {pos.question}
                          </p>
                          <span className={`shrink-0 text-[9px] font-bold px-2.5 py-1 rounded-full ${
                            pos.isResolved
                              ? pos.isWinner
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                : pos.isLoser
                                  ? 'bg-red-50 text-red-500 border border-red-200'
                                  : 'bg-gray-50 text-gray-400 border border-gray-200'
                              : pos.isClosed
                                ? 'bg-gray-50 text-gray-400 border border-gray-200'
                                : pos.openShares > 0
                                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                                  : 'bg-gray-50 text-gray-400 border border-gray-200'
                          }`}>
                            {pos.isResolved
                              ? pos.isWinner ? 'WON' : pos.isLoser ? 'LOST' : 'RESOLVED'
                              : pos.isClosed ? 'CLOSED'
                              : pos.openShares > 0 ? 'OPEN' : 'CLOSED'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 text-[11px]">
                          <div>
                            <span className="text-gray-400 block mb-0.5">Outcome</span>
                            <p className="text-[#1a1a1a] font-medium">{pos.outcome}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">Shares</span>
                            <p className="text-[#1a1a1a] font-mono tabular-nums">{pos.openShares > 0 ? pos.openShares : pos.buyShares}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">Avg Buy</span>
                            <p className="text-[#1a1a1a] font-mono tabular-nums">{(pos.avgBuyPrice * 100).toFixed(1)}&cent;</p>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">{pos.isClosed ? 'Resolution' : 'Current'}</span>
                            <p className="text-[#1a1a1a] font-mono tabular-nums">{(pos.currentPrice * 100).toFixed(1)}&cent;</p>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">Cost</span>
                            <p className="text-[#1a1a1a] font-mono tabular-nums">{formatUsd(pos.buyCost)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">P&L</span>
                            <PnlBadge value={pos.realizedPnl + pos.unrealizedPnl} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                          {['Date', 'Market', 'Side', 'Outcome', 'Price', 'Shares', 'Amount', 'Source'].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allTrades.map((t, i) => (
                          <tr key={`${t.id}-${i}`} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc]">
                            <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400 whitespace-nowrap">
                              {formatDate(t.created_at)}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-gray-600 max-w-[200px] truncate" title={t.marketQuestion || t.condition_id}>
                              {(t.marketQuestion || t.condition_id).slice(0, 40)}{(t.marketQuestion || t.condition_id).length > 40 ? '...' : ''}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                t.side === 'BUY' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                  : t.side === 'REDEEM' ? 'text-purple-700 bg-purple-50 border border-purple-200'
                                  : 'text-red-600 bg-red-50 border border-red-200'
                              }`}>
                                {t.side}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] font-mono text-gray-500">{t.outcome || '--'}</td>
                            <td className="px-3 py-2.5 text-[11px] font-mono text-gray-600 tabular-nums">
                              {(Number(t.price) || 0) > 0 ? `${((Number(t.price) || 0) * 100).toFixed(1)}\u00A2` : '--'}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] font-mono text-gray-500 tabular-nums">
                              {(Number(t.shares) || 0) > 0 ? (Number(t.shares) || 0).toFixed(2) : '--'}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] font-mono text-[#1a1a1a] font-medium tabular-nums">
                              {formatUsd(Number(t.amount) || 0)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                                t.source === 'internal' ? 'text-blue-700 bg-blue-50 border border-blue-200' : 'text-purple-700 bg-purple-50 border border-purple-200'
                              }`}>
                                {t.source === 'internal' ? 'Platform' : 'Polymarket'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
