'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { MarketSortOption } from '@/lib/types/market';

interface MarketSearchProps {
  onSearch: (query: string) => void;
  onSort: (sort: MarketSortOption) => void;
  currentSort: MarketSortOption;
}

const SORT_OPTIONS: { value: MarketSortOption; label: string }[] = [
  { value: 'volume', label: 'VOLUME' },
  { value: 'trending', label: 'TRENDING' },
  { value: 'newest', label: 'NEWEST' },
  { value: 'ending_soon', label: 'ENDING SOON' },
  { value: 'price_change', label: 'MOVERS' },
];

export function MarketSearch({ onSearch, onSort, currentSort }: MarketSearchProps) {
  const [query, setQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      {/* Search Input */}
      <div className="flex-1 flex items-center border border-[#e5e7eb] rounded-[8px] bg-white">
        <Search size={14} className="ml-3 text-[#9ca3af] flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search markets..."
          className="flex-1 px-3 py-2 text-xs font-medium bg-transparent focus:outline-none placeholder:text-[#9ca3af]"
          style={{ fontFamily: "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)" }}
        />
      </div>

      {/* Sort Dropdown */}
      <div className="flex items-center gap-1 rounded-[8px] overflow-hidden border border-[#e5e7eb]">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onSort(opt.value)}
            className={`px-2.5 py-2 text-[9px] font-semibold border-r border-[#e5e7eb] last:border-r-0 transition-colors whitespace-nowrap ${
              currentSort === opt.value
                ? 'bg-[#3a3a3a] text-white'
                : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
