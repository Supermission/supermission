'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MarketSortOption } from '@/lib/types/market';
import { CATEGORY_GROUPS, CLAIMED_TAGS } from '@/lib/config/categories';
import { WORKER_API } from '@/lib/config/worker';

type ViewMode = 'normal' | 'stacked';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

interface CategorySidebarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onSearch?: (query: string) => void;
  onSort?: (sort: MarketSortOption) => void;
  currentSort?: MarketSortOption;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

/* ─── Custom SVG icons ─── */
const CATEGORY_ICONS: Record<string, (props: { size?: number; className?: string }) => React.ReactElement> = {
  all: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  politics: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L3 7v2h18V7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 11v6M9 11v6M15 11v6M19 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 19h18v2H3v-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  world: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3c-2 2.5-3 5.5-3 9s1 6.5 3 9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3c2 2.5 3 5.5 3 9s-1 6.5-3 9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 7.5h15M4.5 16.5h15" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  ),
  crypto: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.5s1.3 2 3 2.5 3 1 3 2.5-1.3 2.5-3 2.5c-1 0-2-.5-2.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6v2M12 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  sports: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 9h12V7c0-1-1.5-4-6-4S6 6 6 7v2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 9c0 3 2 5 4 6v2h4v-2c2-1 4-3 4-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 19h8v2H8v-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 9H4c0 2 1 4 2 5M18 9h2c0 2-1 4-2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  finance: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2v4M12 18v4M6 8v8M18 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="6" width="4" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="10" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="16" y="8" width="4" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  tech: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  culture: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 11h18" stroke="currentColor" strokeWidth="2" />
      <path d="M7 3l2 5M12 3l1 5M17 3l-1 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  science: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 3h6M10 3v5.2L5 18.5a1.5 1.5 0 001.3 2.5h11.4a1.5 1.5 0 001.3-2.5L14 8.2V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="17.5" r="1" fill="currentColor" />
      <circle cx="14" cy="16" r="0.75" fill="currentColor" />
    </svg>
  ),
  more: ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
};

function FallbackIcon({ size = 16, className }: { size?: number; className?: string }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${className ?? ''}`}
    >
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SORT_OPTIONS: { value: MarketSortOption; label: string }[] = [
  { value: 'volume', label: 'Vol' },
  { value: 'trending', label: 'Hot' },
  { value: 'newest', label: 'New' },
  { value: 'ending_soon', label: 'Ending' },
  { value: 'price_change', label: 'Movers' },
];

interface TagData {
  label: string;
  count: number;
}

export function CategorySidebar({
  selectedCategory,
  onSelectCategory,
  onSearch,
  onSort,
  currentSort = 'newest',
  viewMode = 'normal',
  onViewModeChange,
}: CategorySidebarProps) {
  const [tags, setTags] = useState<TagData[]>([]);
  const [totalMarkets, setTotalMarkets] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (tagsLoaded) return;
    setTagsLoaded(true);
    fetch(`${WORKER_API}/v1/markets/tags`)
      .then(res => res.json())
      .then(data => {
        setTags(data.tags || []);
        setTotalMarkets(data.totalMarkets || 0);
      })
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, [tagsLoaded]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch?.(value);
    }, 300);
  }, [onSearch]);

  // Build tag → count map
  const tagCountMap = new Map<string, number>();
  for (const tag of tags) {
    tagCountMap.set(tag.label, tag.count);
  }

  // Compute unclaimed tags (tags not in any category group)
  const unclaimedTags = tags.filter(t => !CLAIMED_TAGS.has(t.label) && t.count > 0);

  // Check if selected category is a child tag (to auto-expand its parent)
  useEffect(() => {
    if (selectedCategory === 'all') return;
    for (const group of CATEGORY_GROUPS) {
      if (group.childTags.includes(selectedCategory)) {
        setExpandedGroups(prev => {
          if (prev.has(group.key)) return prev;
          const next = new Set(prev);
          next.add(group.key);
          return next;
        });
        break;
      }
    }
  }, [selectedCategory]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
    {/* ── Mobile: horizontal scroll strip ── */}
    <div className="lg:hidden fixed top-14 sm:top-16 left-0 right-0 z-30 bg-white border-b border-[#e5e7eb]">
      {/* Row 1: Search */}
      {onSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-1.5 border border-[#e5e7eb] rounded-[8px] px-2 py-1.5 flex-1 min-w-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-[#9ca3af] flex-shrink-0">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
              <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search"
              className="flex-1 bg-transparent text-[10px] text-black placeholder:text-[#9ca3af] focus:outline-none min-w-0"
              style={{ fontFamily: FONT }}
            />
          </div>
        </div>
      )}

      {/* Row 2: Sort filters + view mode dropdown beside MOVERS */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e5e7eb]">
        {onSort && (
          <div className="flex items-center gap-1 flex-shrink-0 overflow-x-auto scrollbar-hide flex-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSort(opt.value)}
                className={`px-2 py-1 text-[8px] font-semibold whitespace-nowrap transition-colors rounded-[4px] border ${
                  currentSort === opt.value
                    ? 'bg-[#3a3a3a] text-white border-[#3a3a3a]'
                    : 'text-[#9ca3af] hover:text-black border-[#e5e7eb]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* View mode dropdown — beside MOVERS */}
        {onViewModeChange && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => onViewModeChange(viewMode === 'normal' ? 'stacked' : 'normal')}
              className="flex items-center gap-1 px-2 py-1 text-[8px] font-semibold rounded-[4px] border border-[#e5e7eb] text-[#9ca3af] hover:text-black transition-colors"
              title={viewMode === 'normal' ? 'Switch to Stacked' : 'Switch to Normal'}
            >
              {viewMode === 'normal' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="2" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="2.5" />
                  <rect x="4" y="10" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="2" opacity="0.6" />
                  <rect x="4" y="18" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                </svg>
              )}
              <span>{viewMode === 'normal' ? 'Normal' : 'Stacked'}</span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Parent category chips — horizontal scroll */}
      <div className="flex items-center overflow-x-auto scrollbar-hide">
        <button
          onClick={() => onSelectCategory('all')}
          className={`flex-shrink-0 px-3 py-2 text-[10px] font-semibold whitespace-nowrap transition-colors ${
            selectedCategory === 'all' ? 'text-black' : 'text-[#9ca3af]'
          }`}
        >
          {selectedCategory === 'all' && <span className="inline-block w-1 h-1 rounded-full bg-black mr-1.5 align-middle" />}
          All
        </button>
        {!loading && CATEGORY_GROUPS.map(group => {
          const isParentActive = selectedCategory === group.primaryTag;
          const isChildActive = group.childTags.includes(selectedCategory);
          const active = isParentActive || isChildActive;
          const Icon = CATEGORY_ICONS[group.icon] || FallbackIcon;
          return (
            <button
              key={group.key}
              onClick={() => onSelectCategory(group.primaryTag)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 text-[10px] font-semibold whitespace-nowrap transition-colors ${
                active ? 'text-black' : 'text-[#9ca3af]'
              }`}
            >
              {active && <span className="inline-block w-1 h-1 rounded-full bg-black mr-0.5 align-middle" />}
              <Icon size={10} className={active ? 'text-black' : 'text-[#9ca3af]'} />
              {group.label}
            </button>
          );
        })}
      </div>
    </div>

    {/* ── Desktop: fixed sidebar ── */}
    <div className="hidden lg:block lg:fixed lg:top-16 lg:left-0 lg:w-52 lg:h-[calc(100vh-4rem)] lg:z-30">
      <div className="h-full flex flex-col bg-white border-r border-[#e5e7eb]">

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">

          {/* ── Search ── */}
          {onSearch && (
            <div className="p-3 pb-2">
              <div className="flex items-center gap-2 border border-[#e5e7eb] rounded-[8px] px-2.5 py-[7px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[#9ca3af] flex-shrink-0">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
                  <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-[11px] text-black placeholder:text-[#9ca3af] focus:outline-none min-w-0"
                  style={{ fontFamily: FONT }}
                />
                {searchQuery && (
                  <button
                    onClick={() => handleSearch('')}
                    className="text-[#9ca3af] hover:text-[#6b7280] transition-colors flex-shrink-0"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Sort ── */}
          {onSort && (
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {SORT_OPTIONS.map(opt => {
                  const active = currentSort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => onSort(opt.value)}
                      className={`px-2.5 py-[5px] text-[9px] font-semibold border rounded-[6px] transition-all duration-100 ${
                        active
                          ? 'bg-[#3a3a3a] text-white border-[#3a3a3a]'
                          : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#d1d5db] hover:text-[#6b7280]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── View Mode Toggle ── */}
          {onViewModeChange && (
            <div className="px-3 pb-3 pt-2 mt-1 border-t border-[#e5e7eb]">
              <span className="block text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">View</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onViewModeChange('normal')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-[5px] text-[9px] font-semibold border rounded-[6px] transition-all duration-100 ${
                    viewMode === 'normal'
                      ? 'bg-[#3a3a3a] text-white border-[#3a3a3a]'
                      : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#d1d5db] hover:text-[#6b7280]'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2.5" />
                  </svg>
                  Normal
                </button>
                <button
                  onClick={() => onViewModeChange('stacked')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-[5px] text-[9px] font-semibold border rounded-[6px] transition-all duration-100 ${
                    viewMode === 'stacked'
                      ? 'bg-[#3a3a3a] text-white border-[#3a3a3a]'
                      : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:border-[#d1d5db] hover:text-[#6b7280]'
                  }`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="2" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="2.5" />
                    <rect x="4" y="10" width="16" height="6" rx="1" stroke="currentColor" strokeWidth="2" opacity="0.6" />
                    <rect x="4" y="18" width="16" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                  </svg>
                  Stacked
                </button>
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="h-px bg-[#e5e7eb] mx-3" />

          {/* ── Categories ── */}
          <div className="py-2">
            {/* All */}
            <CategoryItem
              label="All"
              count={totalMarkets || undefined}
              isActive={selectedCategory === 'all'}
              onClick={() => onSelectCategory('all')}
              icon={CATEGORY_ICONS.all}
            />

            {/* Divider below All */}
            <div className="h-px bg-[#e5e7eb] mx-3 my-1" />

            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-[7px]">
                  <div className="w-[15px] h-[15px] bg-[#f8fafc] animate-pulse rounded" />
                  <div className="h-[11px] w-16 bg-[#f8fafc] animate-pulse rounded" />
                </div>
              ))
            ) : (
              <>
                {CATEGORY_GROUPS.map((group, gi) => {
                  const Icon = CATEGORY_ICONS[group.icon] || FallbackIcon;
                  const parentCount = tagCountMap.get(group.primaryTag) || 0;
                  const isExpanded = expandedGroups.has(group.key);
                  const isParentActive = selectedCategory === group.primaryTag;
                  const isChildActive = group.childTags.includes(selectedCategory);

                  // Get child tags that exist in the data (count > 0)
                  const visibleChildren = group.childTags
                    .map(tag => ({ label: tag, count: tagCountMap.get(tag) || 0 }))
                    .filter(c => c.count > 0);

                  const hasChildren = visibleChildren.length > 0;

                  return (
                    <motion.div
                      key={group.key}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: gi * 0.02, duration: 0.15 }}
                    >
                      {/* Parent row */}
                      <div className="flex items-center">
                        <button
                          onClick={() => onSelectCategory(group.primaryTag)}
                          className={`flex-1 flex items-center gap-2.5 pl-3 pr-1 py-[7px] text-left transition-all duration-100 relative group ${
                            isParentActive || isChildActive
                              ? 'text-black bg-[#f8fafc]'
                              : 'text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f8fafc]/50'
                          }`}
                        >
                          {/* Left accent bar */}
                          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 transition-all duration-150 ${
                            isParentActive ? 'bg-black' : isChildActive ? 'bg-black/30' : 'bg-transparent group-hover:bg-black/10'
                          }`} />
                          <Icon
                            size={14}
                            className={`flex-shrink-0 transition-colors duration-100 ${
                              isParentActive || isChildActive ? 'text-black' : 'text-[#9ca3af] group-hover:text-[#6b7280]'
                            }`}
                          />
                          <span className={`flex-1 text-[11px] font-semibold truncate ${
                            isParentActive || isChildActive ? 'text-black' : ''
                          }`}>
                            {group.label}
                          </span>
                          {parentCount > 0 && (
                            <span className={`text-[8px] font-mono font-bold tabular-nums flex-shrink-0 h-5 px-1.5 flex items-center justify-center rounded-full ${
                              isParentActive ? 'bg-[#3a3a3a] text-white' : 'bg-[#e5e7eb] text-[#6b7280]'
                            }`}>
                              {parentCount}
                            </span>
                          )}
                        </button>
                        {/* Chevron toggle */}
                        {hasChildren && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroup(group.key); }}
                            className="flex items-center justify-center w-7 h-7 mr-1 flex-shrink-0 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
                            aria-label={isExpanded ? `Collapse ${group.label}` : `Expand ${group.label}`}
                          >
                            <ChevronIcon expanded={isExpanded} />
                          </button>
                        )}
                      </div>

                      {/* Child tags */}
                      <AnimatePresence>
                        {isExpanded && hasChildren && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            {visibleChildren.map((child, ci) => (
                              <motion.div
                                key={child.label}
                                initial={{ opacity: 0, x: -4 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: ci * 0.02, duration: 0.1 }}
                              >
                                <ChildCategoryItem
                                  label={child.label}
                                  count={child.count}
                                  isActive={selectedCategory === child.label}
                                  onClick={() => onSelectCategory(child.label)}
                                />
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}

                {/* ── More (unclaimed tags) ── */}
                {unclaimedTags.length > 0 && (
                  <>
                    <div className="h-px bg-[#e5e7eb] mx-3 my-1" />
                    <button
                      onClick={() => setMoreExpanded(prev => !prev)}
                      className="w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-all duration-100 text-[#9ca3af] hover:text-[#6b7280] group"
                    >
                      <div className="flex-shrink-0 text-[#d1d5db] group-hover:text-[#9ca3af] transition-colors">
                        {CATEGORY_ICONS.more({ size: 14 })}
                      </div>
                      <span className="flex-1 text-[10px] font-semibold">
                        More ({unclaimedTags.length})
                      </span>
                      <ChevronIcon expanded={moreExpanded} className="text-[#9ca3af]" />
                    </button>
                    <AnimatePresence>
                      {moreExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          {unclaimedTags.map((tag, i) => (
                            <motion.div
                              key={tag.label}
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.01, duration: 0.1 }}
                            >
                              <ChildCategoryItem
                                label={tag.label}
                                count={tag.count}
                                isActive={selectedCategory === tag.label}
                                onClick={() => onSelectCategory(tag.label)}
                              />
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ─── Parent category list item ─── */
function CategoryItem({
  label,
  count,
  isActive,
  onClick,
  icon: Icon,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  icon: (props: { size?: number; className?: string }) => React.ReactElement;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-[7px] text-left transition-all duration-100 relative group ${
        isActive
          ? 'text-black bg-[#f8fafc]'
          : 'text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f8fafc]/50'
      }`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 transition-all duration-150 ${
        isActive ? 'bg-black' : 'bg-transparent group-hover:bg-black/10'
      }`} />

      <Icon
        size={14}
        className={`flex-shrink-0 transition-colors duration-100 ${
          isActive ? 'text-black' : 'text-[#9ca3af] group-hover:text-[#6b7280]'
        }`}
      />
      <span className={`flex-1 text-[11px] font-semibold truncate ${
        isActive ? 'text-black' : ''
      }`}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span className={`text-[8px] font-mono font-bold tabular-nums flex-shrink-0 h-5 px-1.5 flex items-center justify-center rounded-full ${
          isActive ? 'bg-[#3a3a3a] text-white' : 'bg-[#e5e7eb] text-[#6b7280]'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ─── Child / subcategory item (indented) ─── */
function ChildCategoryItem({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 pl-9 pr-3 py-[5px] text-left transition-all duration-100 relative group ${
        isActive
          ? 'text-black bg-[#f8fafc]'
          : 'text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f8fafc]/50'
      }`}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3 transition-all duration-150 ${
        isActive ? 'bg-black' : 'bg-transparent group-hover:bg-black/10'
      }`} />

      {/* Dot indicator */}
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${
        isActive ? 'bg-black' : 'bg-[#d1d5db] group-hover:bg-[#9ca3af]'
      }`} />

      <span className={`flex-1 text-[10px] font-medium truncate ${
        isActive ? 'text-black font-semibold' : ''
      }`}>
        {label}
      </span>
      {count > 0 && (
        <span className={`text-[8px] font-mono tabular-nums flex-shrink-0 ${
          isActive ? 'text-[#6b7280] font-bold' : 'text-[#d1d5db]'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
