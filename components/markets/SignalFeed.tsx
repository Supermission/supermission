'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';
import { useSignalFeed } from '@/lib/hooks/use-signal-feed';
import type { SignalFeedFilters, SignalSortOption } from '@/lib/hooks/use-signal-feed';
import type { MarketSignal } from '@/lib/types/market';
import SignalFeedCard from './SignalFeedCard';
import type { MarketCatalogItem } from '@/lib/types/market';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import { useUIStore } from '@/lib/store/ui';

const SIGNAL_INFO = [
  { name: 'Sentiment', desc: 'AI analysis of market direction based on news, data, and market conditions.' },
  { name: 'Momentum', desc: 'Market odds moving fast (>5% in 24h), aligned with AI sentiment.' },
  { name: 'Spot Price', desc: 'Real-world crypto price near a key threshold relevant to the market.' },
];

function SignalTypeInfo() {
  const [open, setOpen] = useState(false);
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-1 p-1 rounded-full text-[#9ca3af] hover:text-[#6b7280] hover:bg-black/5 transition-colors flex-shrink-0"
        aria-label="Signal type info"
      >
        <Info size={14} />
      </button>
      {open &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/20" />
            <div
              data-signal-info-popover
              data-dark={marketsDarkMode ? 'true' : 'false'}
              className={`relative w-full sm:w-[300px] rounded-t-2xl sm:rounded-2xl p-4 space-y-3 text-[12px] leading-snug ${
                marketsDarkMode
                  ? 'bg-[#151515] border border-white/[0.14] shadow-[0_24px_80px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'bg-white shadow-xl'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <span data-signal-info-title className={`text-[13px] font-bold ${marketsDarkMode ? 'text-white' : 'text-[#1a1a1a]'}`}>Signal Types</span>
                <button data-signal-info-close onClick={() => setOpen(false)} className={`${marketsDarkMode ? 'text-white/60 hover:text-white' : 'text-[#9ca3af] hover:text-[#6b7280]'} text-lg leading-none`}>&times;</button>
              </div>
              {SIGNAL_INFO.map((s) => (
                <div key={s.name}>
                  <span data-signal-info-name className={`font-bold ${marketsDarkMode ? 'text-white' : 'text-[#1a1a1a]'}`}>{s.name}</span>
                  <span data-signal-info-desc className={marketsDarkMode ? 'text-white/75' : 'text-[#6b7280]'}>: {s.desc}</span>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )
      }
    </>
  );
}

function MobileDropdown<T extends string | null>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold bg-white text-[#1a1a1a] rounded-[10px] border border-[#e5e7eb] hover:border-black/[0.2] transition-all"
      >
        {activeLabel}
        <svg width="8" height="8" viewBox="0 0 20 20" fill="#9ca3af" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M5 8l5 5 5-5z"/></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-1.5 min-w-[140px] bg-white rounded-[12px] border border-[#e5e7eb] shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1 z-50"
          >
            {options.map(({ label, value: v }) => (
              <button
                key={label}
                onClick={() => { onChange(v); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[11px] font-mono font-bold transition-colors ${
                  v === value
                    ? 'text-[#1a1a1a] bg-[#f5f5f5]'
                    : 'text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#fafafa]'
                }`}
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SignalFeedProps {
  onMarketClick?: (market: MarketCatalogItem) => void;
  externalFilters?: SignalFeedFilters;
  compact?: boolean;
}

const SIGNAL_TYPES: { label: string; value: MarketSignal['signal_type'] | null }[] = [
  { label: 'ALL', value: null },
  { label: 'SENTIMENT', value: 'sentiment' },
  { label: 'MOMENTUM', value: 'momentum' },
  { label: 'SPOT PRICE', value: 'spot_price' },
];

const CATEGORY_ICONS: Record<string, (props: { size?: number; className?: string }) => React.ReactElement> = {
  'ALL CATEGORIES': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  'POLITICS': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L3 7v2h18V7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 11v6M9 11v6M15 11v6M19 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 19h18v2H3v-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  'CRYPTO': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2.5s1.3 2 3 2.5 3 1 3 2.5-1.3 2.5-3 2.5c-1 0-2-.5-2.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6v2M12 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'SPORTS': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 9h12V7c0-1-1.5-4-6-4S6 6 6 7v2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 9c0 3 2 5 4 6v2h4v-2c2-1 4-3 4-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 19h8v2H8v-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 9H4c0 2 1 4 2 5M18 9h2c0 2-1 4-2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  'FINANCE': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2v4M12 18v4M6 8v8M18 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="6" width="4" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="10" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="16" y="8" width="4" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  'SCIENCE': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 3h6M10 3v5.2L5 18.5a1.5 1.5 0 001.3 2.5h11.4a1.5 1.5 0 001.3-2.5L14 8.2V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="17.5" r="1" fill="currentColor" />
      <circle cx="14" cy="16" r="0.75" fill="currentColor" />
    </svg>
  ),
  'CULTURE': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="8" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 11h18" stroke="currentColor" strokeWidth="2" />
      <path d="M7 3l2 5M12 3l1 5M17 3l-1 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'TECH': ({ size = 16, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

const CATEGORIES = [
  'ALL CATEGORIES',
  'POLITICS',
  'CRYPTO',
  'SPORTS',
  'FINANCE',
  'SCIENCE',
  'CULTURE',
  'TECH',
];

const SORT_OPTIONS: { label: string; value: SignalSortOption }[] = [
  { label: 'CONFIDENCE', value: 'confidence' },
  { label: 'MOST PROFITABLE', value: 'price_change' },
  { label: 'ENDING SOON', value: 'ending_soon' },
  { label: 'VOLUME', value: 'volume' },
];

const VOLUME_PRESETS: { label: string; value: number }[] = [
  { label: '$1K+', value: 1000 },
  { label: '$10K+', value: 10000 },
  { label: '$100K+', value: 100000 },
  { label: '$1M+', value: 1000000 },
];

/* ── Inline Icons ── */
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M21 2V8H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12C3 7.03 7.03 3 12 3c3.36 0 6.26 1.95 7.62 4.77" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M3 22V16H9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12c0 4.97-4.03 9-9 9-3.36 0-6.26-1.95-7.62-4.77" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className || ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-[16px] p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-16 bg-[#e5e7eb] rounded-full" />
        <div className="flex-1" />
        <div className="h-3 w-20 bg-[#f8fafc] rounded" />
      </div>
      <div className="h-1.5 w-full bg-[#f0f0f0] rounded-full mb-3" />
      <div className="h-5 w-full bg-[#e5e7eb] rounded mb-2" />
      <div className="h-5 w-2/3 bg-[#f8fafc] rounded mb-4" />
      <div className="flex gap-2 mb-3">
        <div className="h-12 flex-1 bg-[#f8fafc] rounded-[8px]" />
        <div className="h-12 flex-1 bg-[#f8fafc] rounded-[8px]" />
      </div>
      <div className="h-10 w-full bg-[#f8fafc] rounded-[10px]" />
    </div>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 6h18M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Category Card (straight line) ── */
function CategoryCard({
  cat,
  index,
  isActive,
  onClick,
}: {
  cat: string;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['ALL CATEGORIES'];
  const label = cat === 'ALL CATEGORIES' ? 'ALL' : cat;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: isActive ? -6 : 0,
        scale: isActive ? 1.06 : 1,
      }}
      whileHover={{
        y: -4,
        scale: 1.04,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 22, delay: index * 0.04 }}
      className="relative flex-shrink-0 cursor-pointer select-none"
    >
      <div
        data-signal-category-card
        data-active={isActive ? 'true' : 'false'}
        className={`relative flex flex-col items-center justify-center w-[56px] h-[76px] sm:w-[72px] sm:h-[96px] rounded-[10px] sm:rounded-[12px] transition-colors duration-200 ${
          isActive
            ? 'bg-[#1a1a1a] text-white'
            : 'bg-white text-[#6b7280] hover:text-[#1a1a1a]'
        }`}
        style={{
          boxShadow: isActive
            ? '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.08)'
            : '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        {/* Center suit icon */}
        <span className={`mb-1 ${isActive ? 'text-white' : 'text-[#1a1a1a]'}`}>
          {typeof icon === 'function' ? icon({ size: 22 }) : icon}
        </span>
        {/* Label */}
        <span
          className="text-[8px] font-bold tracking-wider text-center leading-tight px-1"
          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
        >
          {label}
        </span>

        {/* Active indicator — glowing bottom edge */}
        {isActive && (
          <div className="absolute -bottom-[1px] inset-x-2 h-[2px] rounded-full bg-white/30" />
        )}
      </div>
    </motion.button>
  );
}

/* ── Deck decoration — stack of cards behind the area ── */
function DeckStack() {
  return (
    <div className="absolute -top-2 -right-3 pointer-events-none z-0" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute bg-white rounded-[10px]"
          style={{
            width: 52,
            height: 72,
            top: i * -3,
            right: i * 4,
            transform: `rotate(${5 + i * 8}deg)`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
            opacity: 0.4 - i * 0.12,
          }}
        />
      ))}
    </div>
  );
}

export default function SignalFeed({ onMarketClick, externalFilters, compact }: SignalFeedProps) {
  const { signals, loading, loadingMore, error, refresh, loadMore, hasMore, totalCount, filters, setFilters } = useSignalFeed();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track a "deal key" — increments each time we need cards to re-deal
  const [dealKey, setDealKey] = useState(0);

  // Merge external filters (from chat context) into internal filter state
  useEffect(() => {
    if (!externalFilters) return;
    setFilters((prev) => ({ ...prev, ...externalFilters }));
  }, [externalFilters, setFilters]);

  // Scroll-based lazy loading — load more when sentinel enters viewport
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  const activeType = filters.signalType || null;
  const activeCategory = filters.category || null;
  const activeSort = filters.sortBy || 'confidence';

  const handleTypeChange = (type: MarketSignal['signal_type'] | null) => {
    setFilters((prev) => ({ ...prev, signalType: type }));
    setDealKey((k) => k + 1);
  };

  const handleCategoryChange = (cat: string) => {
    setFilters((prev) => ({
      ...prev,
      category: cat === 'ALL CATEGORIES' ? null : cat,
    }));
    setDealKey((k) => k + 1);
  };

  const handleSortChange = (sort: SignalSortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: sort }));
    setDealKey((k) => k + 1);
  };

  const handleSentimentChange = (sentiment: 'bullish' | 'bearish' | null) => {
    setFilters((prev) => ({
      ...prev,
      sentiment: prev.sentiment === sentiment ? null : sentiment,
    }));
    setDealKey((k) => k + 1);
  };

  const handleTrendingToggle = () => {
    setFilters((prev) => ({ ...prev, trending: !prev.trending }));
    setDealKey((k) => k + 1);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value || null }));
      setDealKey((k) => k + 1);
    }, 400);
  };

  const handleConfidenceChange = (value: number) => {
    setFilters((prev) => ({ ...prev, minConfidence: value }));
  };

  const handleEndDateChange = (value: string) => {
    setFilters((prev) => ({ ...prev, maxEndDate: value || null }));
  };

  const handleVolumeChange = (value: number) => {
    setFilters((prev) => ({
      ...prev,
      minVolume: prev.minVolume === value ? 0 : value,
    }));
  };

  const removeFilter = useCallback((key: keyof SignalFeedFilters) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (key === 'search') setSearchInput('');
    setDealKey((k) => k + 1);
  }, [setFilters]);

  // Count active advanced filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sentiment) count++;
    if (filters.trending) count++;
    if (filters.search) count++;
    if (filters.maxEndDate) count++;
    if (filters.minVolume && filters.minVolume > 0) count++;
    if (filters.minConfidence && filters.minConfidence > 0) count++;
    return count;
  }, [filters]);

  // Active filter chips data
  const activeChips = useMemo(() => {
    const chips: { key: keyof SignalFeedFilters; label: string }[] = [];
    if (filters.sentiment) chips.push({ key: 'sentiment', label: filters.sentiment === 'bullish' ? 'Bullish' : 'Bearish' });
    if (filters.trending) chips.push({ key: 'trending', label: 'Trending' });
    if (filters.search) chips.push({ key: 'search', label: `"${filters.search}"` });
    if (filters.maxEndDate) chips.push({ key: 'maxEndDate', label: `Ends by ${filters.maxEndDate}` });
    if (filters.minVolume && filters.minVolume > 0) {
      const v = filters.minVolume >= 1000000 ? `$${filters.minVolume / 1000000}M` : filters.minVolume >= 1000 ? `$${filters.minVolume / 1000}K` : `$${filters.minVolume}`;
      chips.push({ key: 'minVolume', label: `Vol ${v}+` });
    }
    if (filters.minConfidence && filters.minConfidence > 0) chips.push({ key: 'minConfidence', label: `Conf \u2265 ${filters.minConfidence}%` });
    return chips;
  }, [filters]);

  // Sort: active (non-expired) signals first, then expired
  const activeSignals = useMemo(() => {
    const now = Date.now();
    return [...signals].sort((a, b) => {
      const aExpired = new Date(a.expires_at).getTime() <= now;
      const bExpired = new Date(b.expires_at).getTime() <= now;
      if (aExpired !== bExpired) return aExpired ? 1 : -1;
      return 0; // preserve existing sort order within each group
    });
  }, [signals]);

  // Subscribe to live prices for all visible signal cards.
  const subscribedIds = useMemo(
    () => activeSignals.map((s) => s.condition_id),
    [activeSignals],
  );
  const { prices } = useSSEPrices(subscribedIds);

  // Stats (avg confidence computed from active signals, totalCount from server)
  const stats = useMemo(() => {
    if (activeSignals.length === 0) return null;
    const avgConf = activeSignals.reduce((s, sig) => s + sig.confidence, 0) / activeSignals.length;
    const topSignal = activeSignals[0];
    return { avgConf, topSignal, count: totalCount || activeSignals.length };
  }, [activeSignals, totalCount]);

  return (
    <div className="space-y-5">
      {/* ── Stats Strip ── */}
      {stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="relative flex items-center gap-2 sm:gap-4 bg-[#fafbfc] rounded-[16px] border border-[#e5e7eb] px-3 sm:px-5 py-3 sm:py-4 overflow-hidden"
        >
          <DeckStack />
          <div className="flex items-baseline gap-1.5 relative z-10">
            <span className="text-[18px] sm:text-[24px] font-bold text-black tabular-nums" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>{stats.count}</span>
            <span className="text-[11px] font-mono font-bold text-[#9ca3af]">SIGNALS</span>
          </div>
          <div className="w-px h-6 bg-[#e5e7eb]" />
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] sm:text-[16px] font-mono font-bold text-black tabular-nums">{stats.avgConf.toFixed(0)}%</span>
            <span className="text-[10px] font-mono font-bold text-[#9ca3af]">AVG CONF</span>
          </div>

          <div className="flex-1" />

          <button
            onClick={refresh}
            disabled={loading}
            className="relative z-10 flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono font-bold text-[#9ca3af] hover:text-black hover:bg-white border border-transparent hover:border-[#e5e7eb] rounded-[8px] transition-all"
          >
            {loading ? <SpinnerIcon className="text-[#9ca3af]" /> : <RefreshIcon className="text-[#9ca3af]" />}
            REFRESH
          </button>
        </motion.div>
      )}

      {/* ── Category Cards — straight line ── */}
      <div className="relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-end sm:justify-center gap-1 sm:gap-0 py-4 px-3 sm:px-2 overflow-x-auto overflow-y-visible scrollbar-hide"
          style={{ perspective: '600px', WebkitOverflowScrolling: 'touch' }}
        >
          {CATEGORIES.map((cat, i) => {
            const isActive = (cat === 'ALL CATEGORIES' && !activeCategory) || activeCategory?.toUpperCase() === cat;
            return (
              <CategoryCard
                key={cat}
                cat={cat}
                index={i}
                isActive={isActive}
                onClick={() => handleCategoryChange(cat)}
              />
            );
          })}
        </motion.div>
      </div>

      {/* ── Sort + Filter Toolbar — sticky on scroll ── */}
      <div className="bg-white rounded-[16px] border border-[#e5e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.04)] sticky top-16 z-20">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-wrap">
          {/* Mobile: Sort + Type dropdowns */}
          <div className="flex sm:hidden items-center gap-2">
            <MobileDropdown
              value={activeSort}
              options={SORT_OPTIONS}
              onChange={handleSortChange}
            />
            <MobileDropdown
              value={activeType}
              options={SIGNAL_TYPES}
              onChange={handleTypeChange}
            />
            <SignalTypeInfo />
          </div>

          {/* Desktop: Sort + Type inline buttons */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className="text-[9px] font-mono font-bold text-[#9ca3af] mr-0.5 flex-shrink-0">SORT</span>
            <div className="flex items-center flex-shrink-0">
              {SORT_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => handleSortChange(value)}
                  className={`px-3 py-2 text-[11px] font-mono font-bold border border-[#e5e7eb] -ml-px first:ml-0 first:rounded-l-[10px] last:rounded-r-[10px] transition-all duration-150 whitespace-nowrap ${
                    activeSort === value
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] z-10 relative'
                      : 'bg-white text-[#9ca3af] hover:text-[#6b7280] hover:border-black/[0.2]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center flex-shrink-0">
              <div className="w-px h-5 bg-black/10 mx-0.5 flex-shrink-0" />
              {SIGNAL_TYPES.map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => handleTypeChange(value)}
                  className={`px-3 py-2 text-[11px] font-mono font-bold border border-[#e5e7eb] -ml-px first:ml-0 first:rounded-l-[10px] last:rounded-r-[10px] transition-all duration-150 whitespace-nowrap ${
                    activeType === value
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] z-10 relative'
                      : 'bg-white text-[#9ca3af] hover:text-[#6b7280] hover:border-black/[0.2]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <SignalTypeInfo />
            </div>
          </div>

          {/* Row 2 on mobile: Sentiment + Trending + Filters */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => handleSentimentChange('bullish')}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono font-bold rounded-[10px] border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                filters.sentiment === 'bullish'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:text-emerald-600 hover:border-emerald-200'
              }`}
            >
              BULL
            </button>
            <button
              onClick={() => handleSentimentChange('bearish')}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono font-bold rounded-[10px] border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                filters.sentiment === 'bearish'
                  ? 'bg-rose-500 text-white border-rose-500'
                  : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:text-rose-500 hover:border-rose-200'
              }`}
            >
              BEAR
            </button>

            <button
              onClick={handleTrendingToggle}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono font-bold rounded-[10px] border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                filters.trending
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:text-amber-500 hover:border-amber-200'
              }`}
            >
              <span className="sm:hidden">HOT</span>
              <span className="hidden sm:inline">TRENDING</span>
            </button>

            <div className="w-px h-5 bg-black/10 mx-0.5 flex-shrink-0" />

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono font-bold rounded-[10px] border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                showAdvanced || activeFilterCount > 0
                  ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                  : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:text-[#6b7280] hover:border-black/[0.2]'
              }`}
            >
              <FilterIcon />
              <span className="hidden sm:inline">FILTERS</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[9px] bg-white/20 rounded-full">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Advanced Filters Panel ── */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-[#fafbfc] rounded-[16px] p-3 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              {/* Search */}
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search markets..."
                  className="w-full pl-9 pr-3 py-2 text-[13px] font-mono bg-white border border-[#e5e7eb] rounded-[10px] text-black placeholder:text-[#c5c7cb] focus:outline-none focus:border-[#1a1a1a] focus:ring-2 focus:ring-[#1a1a1a]/10 transition-all"
                />
                {searchInput && (
                  <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-black">
                    <XIcon />
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 items-end">
                {/* Confidence slider */}
                <div>
                  <label className="text-[9px] font-mono font-bold text-[#9ca3af] block mb-1">
                    CONFIDENCE <span className="text-black">{filters.minConfidence || 0}%</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={95}
                    step={5}
                    value={filters.minConfidence || 0}
                    onChange={(e) => handleConfidenceChange(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#e5e7eb] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#1a1a1a] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                {/* End date */}
                <div>
                  <label className="text-[9px] font-mono font-bold text-[#9ca3af] block mb-1">ENDS BEFORE</label>
                  <input
                    type="date"
                    value={filters.maxEndDate || ''}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-[#e5e7eb] rounded-[8px] text-black focus:outline-none focus:border-[#1a1a1a] transition-all"
                  />
                </div>

                {/* Volume presets */}
                <div className="col-span-2 sm:col-span-2">
                  <label className="text-[9px] font-mono font-bold text-[#9ca3af] block mb-1">VOLUME</label>
                  <div className="flex gap-1">
                    {VOLUME_PRESETS.map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => handleVolumeChange(value)}
                        className={`flex-1 px-1 py-1.5 text-[10px] font-mono font-bold rounded-[8px] border transition-all duration-150 ${
                          filters.minVolume === value
                            ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                            : 'bg-white text-[#9ca3af] border-[#e5e7eb] hover:text-[#6b7280] hover:border-black/[0.2]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active Filter Chips ── */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeChips.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => removeFilter(key)}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-mono font-bold bg-[#f0f0f0] text-[#6b7280] rounded-full hover:bg-[#e5e7eb] transition-colors group"
            >
              {label}
              <XIcon className="text-[#9ca3af] group-hover:text-black" />
            </button>
          ))}
          {activeChips.length >= 2 && (
            <button
              onClick={() => {
                setFilters((prev) => ({
                  signalType: prev.signalType,
                  category: prev.category,
                  sortBy: prev.sortBy,
                }));
                setSearchInput('');
                setDealKey((k) => k + 1);
              }}
              className="text-[11px] font-mono font-bold text-[#9ca3af] hover:text-black underline underline-offset-2 transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && signals.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-[14px] font-bold text-rose-500" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>{error}</p>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-6 py-2.5 text-[12px] font-mono font-bold border border-[#e5e7eb] text-black hover:bg-[#f7f7f7] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all rounded-[12px]"
          >
            <RefreshIcon /> RETRY
          </button>
        </motion.div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && activeSignals.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-3 border border-[#e5e7eb] rounded-[12px] flex items-center justify-center" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <span className="text-[22px]">{'\u2660'}</span>
            </div>
            <p className="text-[14px] font-bold text-[#6b7280] mb-2" style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}>No signals in this hand</p>
            <button
              onClick={() => { setFilters({}); setDealKey((k) => k + 1); }}
              className="text-[12px] font-mono font-bold text-[#9ca3af] hover:text-black underline underline-offset-2 transition-colors"
            >
              Deal again
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Signal cards — normal page-scroll grid ── */}
      {!loading && !error && activeSignals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeSignals.map((signal, i) => (
            <SignalFeedCard
              key={`${signal.condition_id}-${signal.signal_type}-${dealKey}`}
              signal={signal}
              index={i}
              onMarketClick={onMarketClick}
              layout="dealt"
              totalCards={activeSignals.length}
              livePrices={prices[signal.condition_id]}
            />
          ))}
        </div>
      )}

      {/* Sentinel for lazy loading next page */}
      {hasMore && <div ref={sentinelRef} className="h-1" />}
      {loadingMore && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`load-more-${i}`} />)}
        </div>
      )}

    </div>
  );
}
