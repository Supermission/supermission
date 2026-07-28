'use client';

import { useCallback } from 'react';

export interface TraderRow {
  address: string;
  email?: string | null;
  totalTrades: number;
  totalVolume: number;
  tradingVolume?: number;
  buys: number;
  sells: number;
  redeems?: number;
  totalRedeemed?: number;
  marketsTraded: number;
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
  roi: number;
  wins: number;
  losses: number;
  firstTrade: string;
  lastTrade: string;
}

interface TradersTableProps {
  traders: TraderRow[];
  total: number;
  page: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onSort: (key: string) => void;
  sortBy: string;
  sortDir: string;
  search: string;
  onSearchChange: (q: string) => void;
  onSelectTrader: (address: string) => void;
}

function formatUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function PnlCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-300">$0.00</span>;
  const color = value > 0 ? 'text-emerald-600' : 'text-red-500';
  const prefix = value > 0 ? '+' : '';
  return <span className={`font-medium ${color}`}>{prefix}{formatUsd(value)}</span>;
}

const COLUMNS = [
  { key: 'address', label: 'Trader', sortable: false },
  { key: 'totalTrades', label: 'Trades', sortable: true },
  { key: 'tradingVolume', label: 'Volume', sortable: true },
  { key: 'netPnl', label: 'Net P&L', sortable: true },
  { key: 'roi', label: 'ROI', sortable: true },
  { key: 'wins', label: 'W/L', sortable: true },
  { key: 'realizedPnl', label: 'Realized', sortable: true },
  { key: 'unrealizedPnl', label: 'Unrealized', sortable: true },
  { key: 'totalRedeemed', label: 'Redeemed', sortable: true },
  { key: 'marketsTraded', label: 'Markets', sortable: true },
  { key: 'lastTrade', label: 'Last Trade', sortable: true },
];

const PAGE_SIZE = 50;

export function TradersTable({
  traders,
  total,
  page,
  loading,
  onPageChange,
  onSort,
  sortBy,
  sortDir,
  search,
  onSearchChange,
  onSelectTrader,
}: TradersTableProps) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleExportCsv = useCallback(() => {
    if (traders.length === 0) return;
    const headers = ['Address', 'Email', 'Trades', 'Buys', 'Sells', 'Redeems', 'Trading Volume', 'Redeemed', 'Net P&L', 'ROI %', 'Wins', 'Losses', 'Realized P&L', 'Unrealized P&L', 'Markets', 'First Trade', 'Last Trade'];
    const rows = traders.map((t) => [
      t.address, t.email || '', t.totalTrades, t.buys, t.sells, t.redeems || 0,
      (t.tradingVolume ?? t.totalVolume).toFixed(2), (t.totalRedeemed || 0).toFixed(2),
      t.netPnl.toFixed(2), t.roi.toFixed(2),
      t.wins, t.losses, t.realizedPnl.toFixed(2), t.unrealizedPnl.toFixed(2),
      t.marketsTraded, t.firstTrade, t.lastTrade,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin_traders_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [traders]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search by address or email..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white border border-[#e5e7eb] rounded-[8px] pl-9 pr-3 py-2 text-[12px] font-mono text-[#1a1a1a] placeholder:text-gray-300 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-colors outline-none"
          />
        </div>

        <button
          onClick={handleExportCsv}
          disabled={traders.length === 0}
          className="px-3 py-2 text-[11px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] hover:border-gray-300 rounded-[8px] transition-colors disabled:opacity-30"
        >
          Export CSV
        </button>

        <span className="text-[11px] font-mono text-gray-400">
          {total} trader{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => onSort(col.key) : undefined}
                    className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                      col.sortable
                        ? 'cursor-pointer hover:text-[#1a1a1a] select-none'
                        : ''
                    } ${sortBy === col.key ? 'text-[#1a1a1a]' : 'text-gray-400'}`}
                  >
                    {col.label}
                    {col.sortable && sortBy === col.key && (
                      <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && traders.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e5e7eb]">
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : traders.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-gray-400">
                    No traders found
                  </td>
                </tr>
              ) : (
                traders.map((t) => (
                  <tr
                    key={t.address}
                    onClick={() => onSelectTrader(t.address)}
                    className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={`https://polymarket.com/profile/${t.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[12px] font-mono text-gray-600 hover:text-blue-600 hover:underline transition-colors break-all"
                        title="View on Polymarket"
                      >
                        {t.address}
                      </a>
                      {t.email && (
                        <p className="text-[10px] text-gray-400 truncate max-w-[200px]" title={t.email}>
                          {t.email}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                      <span>{t.totalTrades}</span>
                      <span className="text-[10px] text-gray-300 ml-1">
                        ({t.buys}b/{t.sells}s{(t.redeems || 0) > 0 ? `/${t.redeems}r` : ''})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-[#1a1a1a] font-medium tabular-nums">
                      {formatUsd(t.tradingVolume ?? t.totalVolume)}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      <PnlCell value={t.netPnl} />
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      <span className={t.roi > 0 ? 'text-emerald-600 font-medium' : t.roi < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                        {t.roi > 0 ? '+' : ''}{t.roi.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      <span className="text-emerald-600">{t.wins}</span>
                      <span className="text-gray-300 mx-0.5">/</span>
                      <span className="text-red-500">{t.losses}</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      <PnlCell value={t.realizedPnl} />
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      <PnlCell value={t.unrealizedPnl} />
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono tabular-nums">
                      {(t.totalRedeemed || 0) > 0 ? (
                        <span className="text-purple-600">{formatUsd(t.totalRedeemed!)}</span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-400 tabular-nums">
                      {t.marketsTraded}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-gray-400 whitespace-nowrap">
                      {formatDate(t.lastTrade)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb] bg-[#f8fafc]">
            <span className="text-[11px] font-mono text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] rounded-md disabled:opacity-25 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] rounded-md disabled:opacity-25 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
