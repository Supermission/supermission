'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTradeHistory, type EnrichedTrade } from '@/lib/hooks/use-trade-history';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import { PnLShareButton } from '@/components/share/pnl-share-button';
import { tradeToShareData } from '@/lib/share/pnl-share';
import { toast } from 'sonner';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

const abbreviateOutcome = (label: string): string => {
  if (label.length <= 5) return label;
  const words = label.trim().split(/\s+/);
  if (words.length < 2) return label;
  return words.map(w => w[0]).join('').toUpperCase();
};

interface TradeHistoryViewProps {
  userAddress: string;
}

type SortKey = 'created_at' | 'price' | 'amount' | 'shares';
type SortDir = 'asc' | 'desc';

function formatDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className || ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 2V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12C3 7.02944 7.02944 3 12 3C15.3611 3 18.2625 4.94853 19.6167 7.7735" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 22V16H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12C21 16.9706 16.9706 21 12 21C8.63893 21 5.73754 19.0515 4.38327 16.2265" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TradeHistoryView({ userAddress }: TradeHistoryViewProps) {
  const {
    trades,
    loading,
    error,
    refresh,
    stats,
    page,
    setPage,
    total,
    filters,
    setFilters,
  } = useTradeHistory(userAddress);

  // Get unique condition IDs from BUY trades to fetch live prices
  const buyConditionIds = useMemo(
    () => [...new Set(trades.filter(t => t.side === 'BUY').map(t => t.condition_id).filter(Boolean))],
    [trades],
  );
  const { prices: livePrices } = useSSEPrices(buyConditionIds.length > 0 ? buyConditionIds : []);

  // Get live current price for a trade
  const getLivePrice = useCallback((trade: EnrichedTrade): number | null => {
    if (trade.side !== 'BUY') return null;
    const live = livePrices[trade.condition_id];
    if (!live) return null;
    // For multi-outcome markets, each outcome is its own condition_id where
    // the user holds the YES token. Only binary YES/NO markets need the no price.
    return trade.outcome?.toUpperCase() === 'NO' ? live.no : live.yes;
  }, [livePrices]);

  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('trade-completed', handler);
    return () => window.removeEventListener('trade-completed', handler);
  }, [refresh]);

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh, isRefreshing]);

  const handleSideFilter = useCallback(
    (side: 'ALL' | 'BUY' | 'SELL') => {
      setSideFilter(side);
      setPage(0);
      setFilters({ ...filters, side: side === 'ALL' ? undefined : side });
    },
    [filters, setFilters, setPage]
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey]
  );

  const sortedTrades = useMemo(() => {
    const sorted = [...trades];
    sorted.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortKey) {
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'price':
          aVal = a.price; bVal = b.price; break;
        case 'amount':
          aVal = a.amount; bVal = b.amount; break;
        case 'shares':
          aVal = a.shares; bVal = b.shares; break;
        default: return 0;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [trades, sortKey, sortDir]);

  const handleExportCsv = useCallback(() => {
    if (trades.length === 0) { toast.error('No trades to export'); return; }
    const headers = ['Date', 'Market', 'Side', 'Outcome', 'Price', 'Shares', 'Amount', 'Tx Hash'];
    const rows = trades.map((t) => [
      t.created_at,
      (t.marketQuestion || t.condition_id).replace(/,/g, ';'),
      t.side, t.outcome,
      t.price.toFixed(4), t.shares.toFixed(4), t.amount.toFixed(2),
      t.transactionHash,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trade_history_${userAddress.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Trade history exported');
  }, [trades, userAddress]);

  // Loading
  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="flex items-center gap-2 text-[11px] font-mono font-bold text-[#9ca3af]">
          <SpinnerIcon className="text-[#9ca3af]" />
          Loading trade history...
        </span>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm font-bold text-rose-500">{error}</p>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold border border-[#e5e7eb] text-[#6b7280] hover:border-[#9ca3af] hover:text-[#111] transition-colors rounded-[10px]"
          style={{ fontFamily: FONT }}
        >
          <RefreshIcon /> Retry
        </button>
      </motion.div>
    );
  }

  // Empty
  if (!loading && trades.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-[#f8fafc] rounded-2xl flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
              <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <p className="text-sm font-bold text-black/55 mb-1">No trades found</p>
          <p className="text-[11px] text-[#9ca3af]">Trade history will appear here after your first trade</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ── Summary Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-[16px] bg-white border border-[#e5e7eb] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f1f3f4]">
          <span className="text-[13px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
            Trade History
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors"
          >
            {isRefreshing ? <SpinnerIcon className="text-[#9ca3af]" /> : <RefreshIcon className="text-[#b0b4ba]" />}
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 divide-x divide-[#f1f3f4]">
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">TRADES</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-[#111] tabular-nums block" style={{ fontFamily: FONT }}>
              {stats.totalTrades}
            </span>
          </div>
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">VOLUME</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-[#111] tabular-nums block" style={{ fontFamily: FONT }}>
              {formatUsd(stats.totalVolume)}
            </span>
          </div>
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">BUYS</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-emerald-600 tabular-nums block" style={{ fontFamily: FONT }}>
              {stats.buys}
            </span>
          </div>
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wider block mb-1">SELLS</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-rose-500 tabular-nums block" style={{ fontFamily: FONT }}>
              {stats.sells}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Toolbar ── */}
      <div
        className="bg-white rounded-[16px] border border-[#e5e7eb] px-4 py-3 flex items-center gap-3 flex-wrap"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        {/* Side filter */}
        <div className="flex items-center">
          {(['ALL', 'BUY', 'SELL'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleSideFilter(s)}
              className={`px-3 py-2 text-[11px] font-bold border border-[#e5e7eb] -ml-px first:ml-0 first:rounded-l-[10px] last:rounded-r-[10px] transition-all duration-150 ${
                sideFilter === s
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] z-10 relative'
                  : 'bg-white text-[#9ca3af] hover:text-[#6b7280] hover:border-black/[0.2]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Export */}
        <button
          onClick={handleExportCsv}
          disabled={trades.length === 0}
          className="trade-history-export-btn px-3 py-2 text-[11px] font-bold border rounded-[10px] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          EXPORT CSV
        </button>

        {/* Count */}
        <span className="text-[11px] font-bold text-[#9ca3af] tabular-nums">
          {total} trade{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Trade Table ── */}
      <div
        className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
      >
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="trade-history-thead-row">
                {([
                  { key: 'created_at' as SortKey, label: 'DATE' },
                  { key: null, label: 'MARKET' },
                  { key: null, label: 'SIDE' },
                  { key: null, label: 'OUTCOME' },
                  { key: 'price' as SortKey, label: 'PRICE' },
                  { key: 'shares' as SortKey, label: 'SHARES' },
                  { key: 'amount' as SortKey, label: 'AMOUNT' },
                  { key: null, label: 'TX' },
                ] as const).map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={key ? () => handleSort(key) : undefined}
                    className={`px-4 py-3 text-left text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider ${
                      key ? 'cursor-pointer hover:text-[#6b7280] select-none' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {label}
                      {key && sortKey === key && (
                        <span className="text-[#6b7280]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((trade, i) => (
                <tr
                  key={trade.id}
                  className={`trade-history-body-row last:border-b-0 hover:bg-[#fafbfc] transition-colors ${
                    i % 2 === 0 ? '' : 'bg-[#fafbfc]/50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111] block" style={{ fontFamily: FONT }}>
                      {formatDate(trade.created_at)}
                    </span>
                    <span className="text-[10px] text-[#9ca3af]">
                      {formatTime(trade.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <span
                      className="text-[12px] font-semibold text-[#111] line-clamp-1"
                      style={{ fontFamily: FONT }}
                      title={trade.marketQuestion || trade.condition_id}
                    >
                      {trade.marketQuestion || `${trade.condition_id.slice(0, 10)}...`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      trade.side === 'BUY'
                        ? 'bg-emerald-50 text-emerald-700'
                        : trade.side === 'SELL'
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#6b7280]" style={{ fontFamily: FONT }} title={trade.outcome || ''}>
                    {trade.outcome ? abbreviateOutcome(trade.outcome) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                      {(trade.price * 100).toFixed(1)}¢
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#6b7280] tabular-nums" style={{ fontFamily: FONT }}>
                    {trade.shares.toFixed(1)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                      ${trade.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {trade.transactionHash ? (
                        <a
                          href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#9ca3af] hover:text-[#111] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {trade.transactionHash.slice(0, 6)}...
                        </a>
                      ) : (
                        <span className="text-[11px] text-[#d1d5db]">--</span>
                      )}
                      {trade.marketQuestion && trade.side === 'BUY' && (
                        <PnLShareButton shareData={tradeToShareData(trade, getLivePrice(trade) ?? trade.price)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden trade-history-mobile-rows">
          {sortedTrades.map((trade) => (
            <div key={trade.id} className="px-4 py-3">
              {/* Top row: market + side badge */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <span
                  className="text-[13px] font-semibold text-[#111] line-clamp-2 flex-1"
                  style={{ fontFamily: FONT }}
                >
                  {trade.marketQuestion || `${trade.condition_id.slice(0, 12)}...`}
                </span>
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  trade.side === 'BUY'
                    ? 'bg-emerald-50 text-emerald-700'
                    : trade.side === 'SELL'
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {trade.side}
                </span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">DATE</span>
                  <span className="text-[11px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
                    {formatDate(trade.created_at)}
                  </span>
                  <span className="text-[10px] text-[#9ca3af]">
                    {formatTime(trade.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">PRICE</span>
                  <span className="text-[11px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                    {(trade.price * 100).toFixed(1)}¢
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">SHARES</span>
                  <span className="text-[11px] text-[#6b7280] tabular-nums" style={{ fontFamily: FONT }}>
                    {trade.shares.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">AMOUNT</span>
                  <span className="text-[11px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                    ${trade.amount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Outcome + Tx + Share */}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-[#9ca3af]" style={{ fontFamily: FONT }} title={trade.outcome || ''}>
                  {trade.outcome ? abbreviateOutcome(trade.outcome) : ''}
                </span>
                <div className="flex items-center gap-2">
                  {trade.transactionHash && (
                    <a
                      href={`https://polygonscan.com/tx/${trade.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#9ca3af] hover:text-[#111] transition-colors"
                    >
                      {trade.transactionHash.slice(0, 6)}...
                    </a>
                  )}
                  {trade.marketQuestion && trade.side === 'BUY' && (
                    <PnLShareButton shareData={tradeToShareData(trade, getLivePrice(trade) ?? trade.price)} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#f1f3f4]">
            <span className="text-[11px] font-bold text-[#9ca3af] tabular-nums" style={{ fontFamily: FONT }}>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-[11px] font-bold border border-[#e5e7eb] text-[#9ca3af] hover:text-[#111] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-[8px]"
              >
                PREV
              </button>
              {/* Page numbers — desktop only */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const pageNum = startPage + i;
                  if (pageNum >= totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-[11px] font-bold transition-colors rounded-[8px] tabular-nums ${
                        pageNum === page
                          ? 'bg-[#1a1a1a] text-white'
                          : 'border border-[#e5e7eb] text-[#9ca3af] hover:text-[#6b7280]'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-[11px] font-bold border border-[#e5e7eb] text-[#9ca3af] hover:text-[#111] disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-[8px]"
              >
                NEXT
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
