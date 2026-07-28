'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface MarketResult {
  condition_id: string;
  question: string;
  outcome_prices: number[];
  volume: number;
}

interface MarketPickerProps {
  onSelect: (conditionId: string) => void;
  excludeIds?: string[];
}

export function MarketPicker({ onSelect, excludeIds = [] }: MarketPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarketResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/markets?search=${encodeURIComponent(query.trim())}&limit=10`,
        );
        if (!res.ok) throw new Error('Search failed');
        const json = await res.json();
        const filtered = (json.markets || []).filter(
          (m: MarketResult) => !excludeIds.includes(m.condition_id),
        );
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, excludeIds]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (conditionId: string) => {
      onSelect(conditionId);
      setQuery('');
      setResults([]);
      setOpen(false);
    },
    [onSelect],
  );

  function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  function formatVolume(v: number): string {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder="Search markets to compare..."
        className="w-full bg-white border border-[#e5e7eb] rounded-[8px] px-3 py-2 text-sm text-[#3a3a3a] placeholder-[#9ca3af] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-3.5 h-3.5 border-2 border-[#e5e7eb] border-t-[#6b7280] rounded-full animate-spin" />
        </div>
      )}

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#e5e7eb] rounded-[8px] shadow-[0px_4px_12px_0px_rgba(0,0,0,0.06)] max-h-72 overflow-y-auto">
          {results.map((market) => {
            const price = market.outcome_prices?.[0] ?? 0;
            return (
              <button
                key={market.condition_id}
                onClick={() => handleSelect(market.condition_id)}
                className="w-full px-3 py-2.5 text-left hover:bg-[#f7f7f7] transition-colors border-b border-[#e5e7eb] last:border-b-0"
              >
                <div className="text-xs text-[#3a3a3a] leading-snug mb-1 font-mono">
                  {truncate(market.question, 80)}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-[#6b7280]">
                  <span className="text-emerald-400 font-bold">
                    {(price * 100).toFixed(1)}%
                  </span>
                  <span>{formatVolume(market.volume)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
