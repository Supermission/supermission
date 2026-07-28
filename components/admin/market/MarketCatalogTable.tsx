'use client';

import { useState, useMemo } from 'react';

interface MarketRow {
  conditionId: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  isActive: boolean;
  isClosed: boolean;
  isResolved: boolean;
  catalogVolume: number;
  platformVolume: number;
  platformTrades: number;
  platformTraders: number;
  endDate: string | null;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function StatusBadge({ isActive, isClosed, isResolved }: { isActive: boolean; isClosed: boolean; isResolved: boolean }) {
  if (isResolved) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-50 text-purple-600">Resolved</span>;
  }
  if (isClosed) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-500">Closed</span>;
  }
  if (isActive) {
    return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-600">Active</span>;
  }
  return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-50 text-amber-600">Inactive</span>;
}

export function MarketCatalogTable({ markets, loading }: { markets: MarketRow[]; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'resolved'>('all');
  const [sortBy, setSortBy] = useState<'platformVolume' | 'platformTrades' | 'endDate'>('platformVolume');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filtered = useMemo(() => {
    let list = markets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.question?.toLowerCase().includes(q) || m.conditionId.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      list = list.filter((m) => {
        if (statusFilter === 'active') return m.isActive && !m.isClosed;
        if (statusFilter === 'closed') return m.isClosed && !m.isResolved;
        if (statusFilter === 'resolved') return m.isResolved;
        return true;
      });
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'endDate') {
        return (b.endDate || '').localeCompare(a.endDate || '');
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
    return list;
  }, [markets, search, statusFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-6 animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-48 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full bg-white border border-[#e5e7eb] rounded-[8px] pl-9 pr-3 py-2 text-[12px] text-[#1a1a1a] placeholder:text-gray-300 focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-colors outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'closed', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-[6px] transition-colors ${
                statusFilter === s
                  ? 'bg-[#1a1a1a] text-white'
                  : 'bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a]'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-3 py-1.5 text-[11px] font-semibold bg-white border border-[#e5e7eb] rounded-[6px] text-gray-500 outline-none"
        >
          <option value="platformVolume">Sort: Volume</option>
          <option value="platformTrades">Sort: Trades</option>
          <option value="endDate">Sort: End Date</option>
        </select>
        <span className="text-[11px] font-mono text-gray-400">
          {filtered.length} market{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Market</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Prices</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Volume</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Trades</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Traders</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">End Date</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No markets found
                  </td>
                </tr>
              ) : (
                paginated.map((m) => (
                  <tr key={m.conditionId} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 py-3 max-w-[300px]">
                      <p className="text-[12px] text-[#1a1a1a] font-medium truncate" title={m.question}>
                        {m.question || m.conditionId.slice(0, 16) + '...'}
                      </p>
                      <p className="text-[10px] font-mono text-gray-300 mt-0.5">
                        {m.conditionId.slice(0, 10)}...
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={m.isActive} isClosed={m.isClosed} isResolved={m.isResolved} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {m.outcomes.map((o, i) => (
                          <span key={i} className="text-[11px] font-mono text-gray-500">
                            <span className="text-gray-400">{o}:</span>{' '}
                            <span className={m.outcomePrices[i] >= 0.5 ? 'text-emerald-600 font-medium' : 'text-gray-500'}>
                              {((m.outcomePrices[i] || 0) * 100).toFixed(0)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-[#1a1a1a] tabular-nums">
                      {m.platformVolume > 0 ? formatUsd(m.platformVolume) : <span className="text-gray-300">--</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                      {m.platformTrades || <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-gray-500 tabular-nums">
                      {m.platformTraders || <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-gray-400 whitespace-nowrap">
                      {m.endDate ? new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb] bg-[#f8fafc]">
            <span className="text-[11px] font-mono text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-white border border-[#e5e7eb] text-gray-500 hover:text-[#1a1a1a] rounded-md disabled:opacity-25 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
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
