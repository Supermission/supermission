'use client';

import { useState } from 'react';

export interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  created_at: string;
  approved_at: string | null;
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
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : status === 'rejected'
        ? 'bg-red-50 text-red-600 border border-red-200'
        : status === 'pending'
          ? 'bg-amber-50 text-amber-700 border border-amber-200'
          : 'bg-gray-50 text-gray-500 border border-gray-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status || 'unknown'}
    </span>
  );
}

export function WaitlistTable({
  entries,
  loading,
  onAction,
  onBulkApprove,
  actionLoading,
}: {
  entries: WaitlistEntry[];
  loading: boolean;
  onAction: (email: string, action: 'approve' | 'reject') => void;
  onBulkApprove: (emails: string[]) => void;
  actionLoading: string | null;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = entries.filter((e) => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (search && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendingFiltered = filtered.filter((e) => e.status === 'pending');

  const counts = {
    all: entries.length,
    pending: entries.filter((e) => e.status === 'pending').length,
    approved: entries.filter((e) => e.status === 'approved').length,
  };

  function toggleSelect(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === pendingFiltered.length && pendingFiltered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingFiltered.map((e) => e.email)));
    }
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkLoading(true);
    onBulkApprove(Array.from(selected));
    setSelected(new Set());
    setBulkLoading(false);
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-[#e5e7eb] flex flex-col sm:flex-row sm:items-center gap-3 bg-[#f8fafc]">
        <input
          type="text"
          placeholder="Search email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-white border border-[#e5e7eb] rounded-[8px] px-3 py-1.5 text-[12px] text-[#1a1a1a] placeholder:text-gray-300 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 w-full sm:w-64"
        />
        <div className="flex gap-1">
          {(['all', 'pending', 'approved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-[6px] transition-colors ${
                filter === f
                  ? 'bg-white text-[#1a1a1a] shadow-sm border border-[#e5e7eb]'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-white'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkLoading}
            className="text-[10px] font-semibold px-3 py-1.5 rounded-[8px] bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-40 ml-auto whitespace-nowrap"
          >
            {bulkLoading ? '...' : `Approve Selected (${selected.size})`}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={pendingFiltered.length > 0 && selected.size === pendingFiltered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 accent-emerald-500"
                />
              </th>
              {['Email', 'Status', 'Signed Up', 'Approved At', 'Actions'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#e5e7eb]">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-3 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No waitlist entries found</td>
              </tr>
            ) : (
              filtered.map((entry) => {
                const isActioning = actionLoading === entry.email;
                const isPending = entry.status === 'pending';
                return (
                  <tr key={entry.id} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                    <td className="px-3 py-2.5 w-8">
                      {isPending ? (
                        <input
                          type="checkbox"
                          checked={selected.has(entry.email)}
                          onChange={() => toggleSelect(entry.email)}
                          className="rounded border-gray-300 accent-emerald-500"
                        />
                      ) : (
                        <span className="text-gray-200">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-mono text-gray-700">{entry.email}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={entry.status} /></td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400">{timeAgo(entry.created_at)}</td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400">{entry.approved_at ? timeAgo(entry.approved_at) : '-'}</td>
                    <td className="px-3 py-2.5">
                      {isPending ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onAction(entry.email, 'approve')}
                            disabled={isActioning}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-40"
                          >
                            {isActioning ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => onAction(entry.email, 'reject')}
                            disabled={isActioning}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-40"
                          >
                            {isActioning ? '...' : 'Delete'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">-</span>
                      )}
                    </td>
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
