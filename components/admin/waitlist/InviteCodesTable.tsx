'use client';

import { useState } from 'react';

export interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function InviteCodesTable({
  codes,
  loading,
  onGenerate,
  onDeactivate,
  generateLoading,
}: {
  codes: InviteCode[];
  loading: boolean;
  onGenerate: (count: number, maxUses: number, expiresAt: string | null) => void;
  onDeactivate: (codeId: string) => void;
  generateLoading: boolean;
}) {
  const [count, setCount] = useState(5);
  const [maxUses, setMaxUses] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Generate controls */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] p-4 flex flex-col sm:flex-row sm:items-end gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Count</label>
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
            className="bg-white border border-[#e5e7eb] rounded-[8px] px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Max Uses Per Code</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxUses}
            onChange={(e) => setMaxUses(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
            className="bg-white border border-[#e5e7eb] rounded-[8px] px-3 py-1.5 text-[12px] text-[#1a1a1a] outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 w-full"
          />
        </div>
        <button
          onClick={() => onGenerate(count, maxUses, null)}
          disabled={generateLoading}
          className="text-[11px] font-semibold px-4 py-2 rounded-[8px] bg-[#1a1a1a] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {generateLoading ? 'Generating...' : `Generate ${count} Code${count > 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-[#f8fafc]">
                {['Code', 'Uses', 'Created By', 'Created', 'Expires', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-[#e5e7eb]">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No invite codes yet</td>
                </tr>
              ) : (
                codes.map((c) => (
                  <tr key={c.id} className="border-b border-[#e5e7eb] hover:bg-[#f8fafc] transition-colors">
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleCopy(c.code, c.id)}
                        className="text-[12px] font-mono text-gray-700 hover:text-[#1a1a1a] transition-colors flex items-center gap-1.5"
                      >
                        {c.code}
                        <span className="text-[9px] text-gray-400">
                          {copiedId === c.id ? 'copied!' : 'copy'}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-500">
                      {c.current_uses}/{c.max_uses ?? '\u221e'}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400">
                      {c.created_by.split('@')[0]}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400">
                      {timeAgo(c.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-gray-400">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'never'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        !c.is_active
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : c.max_uses !== null && c.current_uses >= c.max_uses
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {!c.is_active ? 'inactive' : c.max_uses !== null && c.current_uses >= c.max_uses ? 'maxed' : 'active'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.is_active ? (
                        <button
                          onClick={() => onDeactivate(c.id)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-[6px] bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
