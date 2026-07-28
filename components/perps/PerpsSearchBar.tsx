'use client';

import { Search } from 'lucide-react';

interface PerpsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  darkMode?: boolean;
}

export function PerpsSearchBar({ value, onChange, darkMode = false }: PerpsSearchBarProps) {
  if (darkMode) {
    return (
      <div className="relative w-full">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search..."
          className="w-full h-9 pl-9 pr-3 rounded-full bg-white/[0.06] text-[12px] font-bold text-white placeholder:text-white/30 outline-none border border-transparent focus:border-white/20 transition-colors"
          style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
        />
      </div>
    );
  }

  return (
    <div data-perps-market-search-wrap className="relative flex-shrink-0 w-full sm:w-auto">
      <Search
        size={13}
        data-perps-market-search-icon
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"
      />
      <input
        data-perps-market-search
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search markets..."
        className="w-full sm:w-48 h-8 pl-8 pr-3 rounded-[8px] border border-[#e5e7eb] bg-white text-[11px] sm:text-xs font-semibold text-[#1a1a1a] placeholder:text-[#9ca3af] outline-none focus:border-[#3a3a3a] hover:border-[#3a3a3a] transition-colors appearance-none"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      />
    </div>
  );
}
