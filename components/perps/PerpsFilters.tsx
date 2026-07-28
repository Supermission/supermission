'use client';

import { ASSET_CATEGORIES } from '@/lib/hyperliquid/constants';

const CATEGORIES = ['All', ...Object.keys(ASSET_CATEGORIES)];
const SORT_OPTIONS = ['Volume', '24h Change', 'Funding', 'OI', 'Price'];

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

export type MarketMode = 'perps' | 'spot';

interface PerpsFiltersProps {
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  activeSort: string;
  onSortChange: (sort: string) => void;
  marketMode: MarketMode;
  onMarketModeChange: (mode: MarketMode) => void;
  darkMode?: boolean;
}

export function PerpsFilters({
  activeCategory,
  onCategoryChange,
  activeSort,
  onSortChange,
  marketMode,
  onMarketModeChange,
  darkMode = false,
}: PerpsFiltersProps) {
  if (darkMode) {
    return (
      <div className="flex items-center gap-2 w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {/* Perps/Spot pills */}
        <div className="flex-shrink-0 flex h-7 rounded-full bg-white/[0.06] p-0.5" style={{ fontFamily: FONT }}>
          <button
            onClick={() => onMarketModeChange('perps')}
            className={`px-3 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
              marketMode === 'perps' ? 'bg-white text-black' : 'text-white/50'
            }`}
          >
            Perps
          </button>
          <button
            onClick={() => onMarketModeChange('spot')}
            className={`px-3 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all cursor-pointer ${
              marketMode === 'spot' ? 'bg-white text-black' : 'text-white/50'
            }`}
          >
            Spot
          </button>
        </div>
        {/* Category */}
        <select
          value={activeCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="flex-shrink-0 h-7 px-2 pr-5 rounded-full bg-white/[0.06] text-[10px] font-bold text-white/60 outline-none cursor-pointer appearance-none border-none"
          style={{
            fontFamily: FONT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        {/* Sort */}
        <select
          value={activeSort}
          onChange={(e) => onSortChange(e.target.value)}
          className="flex-shrink-0 h-7 px-2 pr-5 rounded-full bg-white/[0.06] text-[10px] font-bold text-white/60 outline-none cursor-pointer appearance-none border-none"
          style={{
            fontFamily: FONT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Row 1: Perps/Spot animated toggle + Sort + Search on right */}
      <div className="flex items-center gap-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {/* Animated Perps/Spot toggle */}
        {/* Perps/Spot switch */}
        <div className="flex-shrink-0 flex h-8 rounded-[8px] border border-[#e5e7eb] overflow-hidden" style={{ fontFamily: FONT }}>
          <button
            onClick={() => onMarketModeChange('perps')}
            className={`px-3 text-[11px] sm:text-xs font-semibold transition-all duration-200 cursor-pointer ${
              marketMode === 'perps'
                ? 'bg-[#1a1a1a] text-white'
                : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-[#1a1a1a]'
            }`}
          >
            Perps
          </button>
          <button
            onClick={() => onMarketModeChange('spot')}
            className={`px-3 text-[11px] sm:text-xs font-semibold border-l border-[#e5e7eb] transition-all duration-200 cursor-pointer ${
              marketMode === 'spot'
                ? 'bg-[#1a1a1a] text-white'
                : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-[#1a1a1a]'
            }`}
          >
            Spot
          </button>
        </div>

        {/* Category dropdown */}
        <select
          value={activeCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="flex-shrink-0 h-8 px-2 pr-6 rounded-[8px] border border-[#e5e7eb] bg-white text-[11px] sm:text-xs font-semibold text-[#9ca3af] outline-none cursor-pointer appearance-none hover:border-[#3a3a3a] transition-colors"
          style={{
            fontFamily: FONT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'All' ? 'Category: All' : cat}
            </option>
          ))}
        </select>

        {/* Sort dropdown */}
        <select
          value={activeSort}
          onChange={(e) => onSortChange(e.target.value)}
          className="flex-shrink-0 h-8 px-2 pr-6 rounded-[8px] border border-[#e5e7eb] bg-white text-[11px] sm:text-xs font-semibold text-[#9ca3af] outline-none cursor-pointer appearance-none hover:border-[#3a3a3a] transition-colors"
          style={{
            fontFamily: FONT,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              Sort: {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
