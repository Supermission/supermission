// components/dashboard/activity/TradeFilters.tsx
'use client';

import type { SourceFilter, TimeRange, ViewMode } from '@/lib/types/trading-activity';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'markets', label: 'Markets' },
  { id: 'perps', label: 'Perps' },
  { id: 'swaps', label: 'Swaps' },
];

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'All' },
];

interface TradeFiltersProps {
  source: SourceFilter;
  onSourceChange: (s: SourceFilter) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (t: TimeRange) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onExport: () => void;
  tradeCount: number;
}

export function TradeFilters({
  source, onSourceChange, timeRange, onTimeRangeChange,
  view, onViewChange, onExport, tradeCount,
}: TradeFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      {/* Source chips */}
      <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-[8px] p-0.5">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onSourceChange(f.id)}
            className={`px-2.5 py-1.5 rounded-[6px] text-[10px] font-bold transition-all ${
              source === f.id ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#9ca3af] hover:text-[#666]'
            }`}
            style={{ fontFamily: FONT }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Time range */}
      <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-[8px] p-0.5">
        {TIME_RANGES.map((t) => (
          <button
            key={t.id}
            onClick={() => onTimeRangeChange(t.id)}
            className={`px-2 py-1.5 rounded-[6px] text-[10px] font-bold transition-all ${
              timeRange === t.id ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#9ca3af] hover:text-[#666]'
            }`}
            style={{ fontFamily: FONT }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Right side: count + view toggle + export */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-[#9ca3af] tabular-nums" style={{ fontFamily: FONT }}>
          {tradeCount} trades
        </span>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-[#f0f0f0] rounded-[6px] p-0.5">
          <button
            onClick={() => onViewChange('list')}
            className={`p-1.5 rounded-[4px] transition-colors ${view === 'list' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#9ca3af] hover:bg-white/50'}`}
            title="List view"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          </button>
          <button
            onClick={() => onViewChange('card')}
            className={`p-1.5 rounded-[4px] transition-colors ${view === 'card' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#9ca3af] hover:bg-white/50'}`}
            title="Card view"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
          </button>
        </div>

        {/* CSV Export */}
        <button
          onClick={onExport}
          className="h-7 px-2.5 rounded-[6px] border border-[#e5e7eb] text-[9px] font-bold text-[#9ca3af] hover:text-[#1a1a1a] hover:border-[#1a1a1a] transition-colors flex items-center gap-1"
          style={{ fontFamily: FONT }}
          title="Export CSV"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          CSV
        </button>
      </div>
    </div>
  );
}
