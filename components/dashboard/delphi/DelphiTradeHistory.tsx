'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDelphiActivity, resolveSymbol, type DefiActivity } from '@/lib/hooks/use-delphi-activity';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

const EXPLORER_URLS: Record<number, string> = {
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
};

function explorerTxUrl(chainId: number, hash: string): string {
  const base = EXPLORER_URLS[chainId] || 'https://basescan.org';
  return `${base}/tx/${hash}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatUsd(n: number | null): string {
  if (n == null) return '--';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function chainLabel(chainId: number): string {
  switch (chainId) {
    case 8453: return 'Base';
    case 1: return 'Ethereum';
    case 137: return 'Polygon';
    default: return `Chain ${chainId}`;
  }
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

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-rose-50 text-rose-600',
};

const TYPE_LABELS: Record<string, string> = {
  swap: 'Swap',
  cross_chain_swap: 'Bridge',
  lp_add: 'Add LP',
  lp_remove: 'Remove LP',
  hook_deploy: 'Deploy',
  pool_create: 'Pool Create',
};

interface DelphiTradeHistoryProps {
  userAddress: string;
}

export function DelphiTradeHistory({ userAddress }: DelphiTradeHistoryProps) {
  const {
    activities,
    total,
    loading,
    error,
    page,
    setPage,
    refresh,
  } = useDelphiActivity(userAddress);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }, [refresh, isRefreshing]);

  // Summary stats
  const stats = useMemo(() => {
    // These are for current page — total count comes from API
    const totalVolume = activities.reduce((s, a) => s + (a.amount_usd ?? 0), 0);
    const confirmed = activities.filter(a => a.status === 'confirmed').length;
    const failed = activities.filter(a => a.status === 'failed').length;
    return { totalVolume, confirmed, failed };
  }, [activities]);

  // Loading
  if (loading && activities.length === 0) {
    return (
      <div className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-center py-12">
          <span className="flex items-center gap-2 text-[11px] font-mono font-bold text-[#9ca3af]">
            <SpinnerIcon className="text-[#9ca3af]" />
            Loading Delphi activity...
          </span>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
      >
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-sm font-bold text-rose-500">{error}</p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-semibold border border-[#e5e7eb] text-[#6b7280] hover:border-[#9ca3af] hover:text-[#111] transition-colors rounded-[10px]"
            style={{ fontFamily: FONT }}
          >
            <RefreshIcon /> Retry
          </button>
        </div>
      </motion.div>
    );
  }

  // Empty
  if (!loading && activities.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="border border-[#e5e7eb] rounded-[16px] bg-white p-6 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
      >
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f1f3f4] -mx-6 -mt-6 mb-6">
          <span className="text-[13px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
            Delphi Trade History
          </span>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-[#f8fafc] rounded-2xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
                <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <p className="text-sm font-bold text-black/55 mb-1">No Delphi trades yet</p>
            <p className="text-[11px] text-[#9ca3af]">Swaps executed through Delphi will appear here</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-[16px] bg-white border border-[#e5e7eb] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
      >
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f1f3f4]">
          <span className="text-[13px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
            Delphi Trade History
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-[#b0b4ba] hover:text-[#6b7280] transition-colors"
          >
            {isRefreshing ? <SpinnerIcon className="text-[#9ca3af]" /> : <RefreshIcon className="text-[#b0b4ba]" />}
          </button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[#f1f3f4]">
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">TOTAL</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-[#111] tabular-nums block" style={{ fontFamily: FONT }}>
              {total}
            </span>
          </div>
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider block mb-1">VOLUME</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-[#111] tabular-nums block" style={{ fontFamily: FONT }}>
              {formatUsd(stats.totalVolume)}
            </span>
          </div>
          <div className="px-3 py-3 sm:px-4 text-center">
            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">CONFIRMED</span>
            <span className="text-[16px] sm:text-[18px] font-bold text-emerald-600 tabular-nums block" style={{ fontFamily: FONT }}>
              {stats.confirmed}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Trade Table */}
      <div
        className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
      >
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f1f3f4]">
                {['DATE', 'TYPE', 'PAIR', 'AMOUNT', 'CHAIN', 'STATUS', 'TX'].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activities.map((a, i) => (
                <tr
                  key={a.id}
                  className={`border-b border-[#f8f9fa] last:border-b-0 hover:bg-[#fafbfc] transition-colors ${
                    i % 2 === 0 ? '' : 'bg-[#fafbfc]/50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111] block" style={{ fontFamily: FONT }}>
                      {formatDate(a.created_at)}
                    </span>
                    <span className="text-[10px] text-[#9ca3af]">
                      {formatTime(a.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-violet-50 text-violet-700">
                      {TYPE_LABELS[a.activity_type] || a.activity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
                      {resolveSymbol(a.token_in)} → {resolveSymbol(a.token_out)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[12px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                      {formatUsd(a.amount_usd)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#6b7280]" style={{ fontFamily: FONT }}>
                    {chainLabel(a.chain_id)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      STATUS_STYLES[a.status] || 'bg-gray-50 text-gray-600'
                    }`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.tx_hash ? (
                      <a
                        href={explorerTxUrl(a.chain_id, a.tx_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#9ca3af] hover:text-[#111] transition-colors"
                      >
                        {a.tx_hash.slice(0, 6)}...
                      </a>
                    ) : (
                      <span className="text-[11px] text-[#d1d5db]">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-[#f1f3f4]">
          {activities.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[13px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
                  {resolveSymbol(a.token_in)} → {resolveSymbol(a.token_out)}
                </span>
                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  STATUS_STYLES[a.status] || 'bg-gray-50 text-gray-600'
                }`}>
                  {a.status}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">DATE</span>
                  <span className="text-[11px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
                    {formatDate(a.created_at)}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">TYPE</span>
                  <span className="text-[11px] font-semibold text-[#111]" style={{ fontFamily: FONT }}>
                    {TYPE_LABELS[a.activity_type] || a.activity_type}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">AMOUNT</span>
                  <span className="text-[11px] font-semibold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
                    {formatUsd(a.amount_usd)}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-[#9ca3af] uppercase tracking-wider block">CHAIN</span>
                  <span className="text-[11px] text-[#6b7280]" style={{ fontFamily: FONT }}>
                    {chainLabel(a.chain_id)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-end mt-1.5">
                {a.tx_hash && (
                  <a
                    href={explorerTxUrl(a.chain_id, a.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#9ca3af] hover:text-[#111] transition-colors"
                  >
                    {a.tx_hash.slice(0, 6)}...
                  </a>
                )}
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
