'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSharedNow } from '@/lib/hooks/use-shared-now';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { MiniProbabilityBar } from './MiniProbabilityBar';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { getMarketAssetTag, getMarketTimeframeTag, ASSET_TAG_STYLES, TIMEFRAME_TAG_STYLE } from '@/lib/types/market';
import type { WatchlistEntry } from '@/lib/hooks/use-watchlist';

type WatchlistSort = 'date_added' | 'volume' | 'ending_soon' | 'price_change';

interface WatchlistViewProps {
  markets: MarketCatalogItem[];
  loading: boolean;
  watchlist: Set<string>;
  entries: WatchlistEntry[];
  onToggleWatch: (conditionId: string) => void;
  onMarketClick?: (market: MarketCatalogItem) => void;
  onTrade?: (params: {
    conditionId: string;
    tokenId: string;
    side: 'BUY';
    outcome: string;
    amount: number;
  }) => void;
  onPricesUpdate?: (prices: Record<string, LivePrices>) => void;
  tradingConditionId?: string | null;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* ── Inline Icons ── */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Countdown ── */
function LiveCountdown({ endDate }: { endDate: string | null }) {
  const now = useSharedNow();
  if (!endDate) return null;
  const diff = new Date(endDate).getTime() - now;
  if (diff <= 0) return <span className="text-amber-600">Ended</span>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return <>Ends in {d}d {h}h</>;
  const s = Math.floor((diff % 60000) / 1000);
  return <>Ends in {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</>;
}

const SORT_OPTIONS: { value: WatchlistSort; label: string }[] = [
  { value: 'date_added', label: 'DATE ADDED' },
  { value: 'volume', label: 'VOLUME' },
  { value: 'ending_soon', label: 'ENDING SOON' },
  { value: 'price_change', label: 'PRICE CHANGE' },
];

/* ── Watchlist Card ── */
function WatchlistCard({ market, addedAt, livePrices, index, onRemove, onClick }: {
  market: MarketCatalogItem;
  addedAt?: string;
  livePrices?: LivePrices;
  index: number;
  onRemove: () => void;
  onClick?: () => void;
}) {
  const rawYes = livePrices?.yes ?? market.outcome_prices?.[0] ?? null;
  const rawNo = livePrices?.no ?? market.outcome_prices?.[1] ?? null;
  const hasPrices = rawYes !== null && rawNo !== null;
  const yesPrice = rawYes ?? 0;
  const noPrice = rawNo ?? 0;
  const yesPercent = Math.round(yesPrice * 100);
  const noPercent = Math.round(noPrice * 100);
  const outcomeLabels = market.outcomes || ['Yes', 'No'];
  const yesLabel = outcomeLabels[0] || 'Yes';
  const noLabel = outcomeLabels[1] || 'No';
  const assetTag = getMarketAssetTag(market.question);
  const timeframeTag = getMarketTimeframeTag(market);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmRemove) {
      onRemove();
      setConfirmRemove(false);
    } else {
      setConfirmRemove(true);
      setTimeout(() => setConfirmRemove(false), 3000);
    }
  }, [confirmRemove, onRemove]);

  return (
    <motion.div
      data-watchlist-card
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{
        y: -2,
        transition: { type: 'spring', stiffness: 400, damping: 30 },
      }}
      transition={{ delay: index * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className="group relative bg-white rounded-[14px] flex flex-col cursor-pointer border border-[#e5e7eb] hover:border-[#d0d0d6] transition-all duration-200"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
      }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3">
        {/* Meta row: tags + remove */}
        <div className="flex items-center gap-1.5 mb-3">
          {market.categories?.[0] && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-[#f4f4f6] text-[#6b7280] watchlist-category-tag">
              {market.categories[0]}
            </span>
          )}
          {market.is_trending && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-50 text-amber-600">
              Trending
            </span>
          )}
          {assetTag && (
            <span className={`text-[8px] font-bold px-1.5 py-1 rounded-md ${ASSET_TAG_STYLES[assetTag] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>
              {assetTag}
            </span>
          )}
          {timeframeTag && (
            <span className={`text-[8px] font-bold px-1.5 py-1 rounded-md ${TIMEFRAME_TAG_STYLE}`}>
              {timeframeTag}
            </span>
          )}
          <div className="flex-1" />
          {addedAt && (
            <span className="text-[9px] text-[#9ca3af] font-medium mr-1">{timeAgo(addedAt)}</span>
          )}
          <button
            onClick={handleRemoveClick}
            data-watchlist-remove-button
            className={`flex-shrink-0 p-1.5 rounded-md transition-all duration-150 ${
              confirmRemove
                ? 'bg-rose-50 text-rose-500'
                : 'text-black/15 group-hover:text-black/30 hover:!text-rose-500 hover:!bg-rose-50'
            }`}
            aria-label={confirmRemove ? 'Confirm remove from watchlist' : 'Remove from watchlist'}
          >
            {confirmRemove ? (
              <span className="text-[8px] font-mono font-bold px-0.5">Remove?</span>
            ) : (
              <TrashIcon />
            )}
          </button>
        </div>

        {/* Question */}
        <h3
          className="text-[14px] font-semibold leading-[1.4] text-[#111] line-clamp-2 tracking-[-0.01em] mb-3"
          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
        >
          {market.question}
        </h3>

        {/* Price + Change row */}
        {hasPrices && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-2">
              <span
                className="text-[22px] font-bold text-[#111] tabular-nums tracking-tight"
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                {yesPercent}%
              </span>
              <span className="text-[10px] font-medium text-[#9ca3af] uppercase tracking-wide">{yesLabel}</span>
            </div>
            {market.price_change_24h !== 0 && (
              <span className={`text-[11px] font-bold tabular-nums px-2 py-1 rounded-md ${
                market.price_change_24h > 0
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-rose-600 bg-rose-50'
              }`}>
                {market.price_change_24h > 0 ? '+' : ''}{(market.price_change_24h * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}

        {/* Probability bar */}
        {hasPrices ? (
          <MiniProbabilityBar yesPercent={yesPercent} noPercent={noPercent} yesLabel={yesLabel} noLabel={noLabel} />
        ) : (
          <div className="py-2 text-center">
            <span className="text-[10px] font-mono font-medium text-[#9ca3af]">Price unavailable</span>
          </div>
        )}
      </div>

      {/* ── Footer: Stats + View button ── */}
      <div className="px-4 pb-4 pt-2 mt-auto">
        {/* Stats row */}
        <div className="flex items-center justify-between text-[10px] mb-3">
          <div className="flex items-center gap-3">
            <div>
              <span className="font-medium text-[#9ca3af] uppercase tracking-wide">Vol </span>
              <span className="font-bold text-[#111] tabular-nums">{formatVolume(market.volume)}</span>
            </div>
            {market.volume_24h > 0 && (
              <div>
                <span className="font-medium text-[#9ca3af] uppercase tracking-wide">24h </span>
                <span className="font-bold text-[#111] tabular-nums">{formatVolume(market.volume_24h)}</span>
              </div>
            )}
          </div>
          {market.end_date && (
            <span className="font-bold tabular-nums text-[#6b7280]">
              <LiveCountdown endDate={market.end_date} />
            </span>
          )}
        </div>

        {/* View Market button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="w-full py-2.5 text-[11px] font-semibold rounded-[10px] transition-all duration-200 active:scale-[0.98] bg-[#f4f4f6] text-[#3a3a3f] hover:bg-[#e8e8ec] hover:text-[#111] border border-transparent hover:border-[#d0d0d6] watchlist-view-btn"
          style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
        >
          View Market
        </button>
      </div>
    </motion.div>
  );
}

/* ── Main WatchlistView ── */
export function WatchlistView({
  markets,
  loading,
  watchlist,
  entries,
  onToggleWatch,
  onMarketClick,
  onTrade,
  onPricesUpdate,
  tradingConditionId,
}: WatchlistViewProps) {
  const address = useEmbeddedAddress();
  const [sortBy, setSortBy] = useState<WatchlistSort>('date_added');
  const [searchQuery, setSearchQuery] = useState('');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Build created_at map from entries
  const addedAtMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      map.set(entry.condition_id, entry.created_at);
    }
    return map;
  }, [entries]);

  // SSE-based live prices — only subscribe to watchlisted markets
  const subscribedIds = useMemo(
    () => markets.map((m) => m.condition_id),
    [markets],
  );
  const { prices } = useSSEPrices(subscribedIds);

  useEffect(() => {
    if (onPricesUpdate && Object.keys(prices).length > 0) {
      onPricesUpdate(prices);
    }
  }, [prices, onPricesUpdate]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return markets;
    const q = searchQuery.toLowerCase();
    return markets.filter(m =>
      m.question.toLowerCase().includes(q) ||
      m.categories?.some(c => c.toLowerCase().includes(q))
    );
  }, [markets, searchQuery]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case 'date_added':
        arr.sort((a, b) => {
          const aDate = addedAtMap.get(a.condition_id) || '';
          const bDate = addedAtMap.get(b.condition_id) || '';
          return bDate.localeCompare(aDate); // newest first
        });
        break;
      case 'volume':
        arr.sort((a, b) => b.volume - a.volume);
        break;
      case 'ending_soon':
        arr.sort((a, b) => {
          const aEnd = a.end_date ? new Date(a.end_date).getTime() : Infinity;
          const bEnd = b.end_date ? new Date(b.end_date).getTime() : Infinity;
          return aEnd - bEnd;
        });
        break;
      case 'price_change':
        arr.sort((a, b) => Math.abs(b.price_change_24h) - Math.abs(a.price_change_24h));
        break;
    }
    return arr;
  }, [filtered, sortBy, addedAtMap]);

  // Filter out instantly-removed items
  const visibleSorted = useMemo(
    () => sorted.filter(m => !removedIds.has(m.condition_id)),
    [sorted, removedIds]
  );

  // Clean up removedIds once the markets array no longer contains them
  useEffect(() => {
    if (removedIds.size === 0) return;
    const marketIds = new Set(markets.map(m => m.condition_id));
    const stillPresent = new Set([...removedIds].filter(id => marketIds.has(id)));
    if (stillPresent.size < removedIds.size) {
      setRemovedIds(stillPresent);
    }
  }, [markets, removedIds]);

  // Summary stats
  const stats = useMemo(() => {
    if (markets.length === 0) return null;
    const avgVolume = markets.reduce((s, m) => s + m.volume, 0) / markets.length;
    const endingSoon = markets.filter(m => {
      if (!m.end_date) return false;
      return new Date(m.end_date).getTime() - Date.now() < 24 * 60 * 60 * 1000;
    }).length;
    const trending = markets.filter(m => m.is_trending).length;
    return { total: markets.length, avgVolume, endingSoon, trending };
  }, [markets]);

  const handleRemove = useCallback((conditionId: string) => {
    // Instantly hide the card, then call the actual toggle
    setRemovedIds(prev => new Set([...prev, conditionId]));
    onToggleWatch(conditionId);
    toast.success('Removed from watchlist');
  }, [onToggleWatch]);

  // ── No wallet ──
  if (!address) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#f8fafc] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <p className="text-sm font-bold text-black/55 mb-1">Connect wallet to view watchlist</p>
          <p className="text-[11px] text-[#9ca3af]">Bookmark markets to track them here</p>
        </div>
      </motion.div>
    );
  }


  // ── Empty ──
  if (markets.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#f8fafc] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-black/20">
              <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-bold text-black/55 mb-1">No markets bookmarked</p>
          <p className="text-[11px] text-[#9ca3af]">Browse markets and tap the bookmark icon to add them here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* ── Watchlist Dashboard — gradient card like portfolio ── */}
      {stats && (
        <motion.div
          data-watchlist-panel
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-[16px] overflow-hidden"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)' }}
        >
          {/* Top section: gradient with watching count + avg volume */}
          <div className="px-5 py-5 flex items-end justify-between bg-gradient-to-br from-blue-50 via-white to-indigo-50/30">
            <div>
              <span className="text-[10px] font-bold text-blue-600/50 uppercase tracking-wider block mb-1">Watching</span>
              <span
                className="text-[32px] font-bold text-[#111] tabular-nums tracking-tight block leading-none"
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                {stats.total}
              </span>
            </div>
            <div className="text-right rounded-[12px] px-3.5 py-2.5 bg-blue-500/10">
              <span className="text-[9px] font-bold text-blue-600/60 uppercase tracking-wider block mb-0.5">AVG VOL</span>
              <span
                className="text-[20px] font-bold text-[#111] tabular-nums block leading-none"
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                {formatVolume(stats.avgVolume)}
              </span>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 bg-white border-t border-[#f1f3f4]">
            <div className="px-4 py-3 text-center border-r border-[#f1f3f4]">
              <span className={`text-[9px] font-bold uppercase tracking-wider block mb-1 ${stats.endingSoon > 0 ? 'text-orange-600' : 'text-[#9ca3af]'}`}>ENDING</span>
              <span
                className={`text-[18px] font-bold tabular-nums block ${stats.endingSoon > 0 ? 'text-orange-600' : 'text-[#111]'}`}
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                {stats.endingSoon}
              </span>
            </div>
            <div className="px-4 py-3 text-center">
              <span className={`text-[9px] font-bold uppercase tracking-wider block mb-1 ${stats.trending > 0 ? 'text-amber-600' : 'text-[#9ca3af]'}`}>TRENDING</span>
              <span
                className={`text-[18px] font-bold tabular-nums block ${stats.trending > 0 ? 'text-amber-600' : 'text-[#111]'}`}
                style={{ fontFamily: 'var(--font-bricolage, "Bricolage Grotesque", sans-serif)' }}
              >
                {stats.trending}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Toolbar: Search + Sort — sticky on scroll ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sticky top-16 z-20 bg-white py-2 -mx-1 px-1">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 sm:max-w-xs bg-white border border-[#e5e7eb] rounded-[8px] px-3 py-2 focus-within:border-black/[0.2] transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-black/20 flex-shrink-0">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search watchlist..."
            className="text-[11px] font-mono font-semibold text-black bg-transparent focus:outline-none w-full placeholder:text-black/20"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-black/20 hover:text-black/40 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort + Count row */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-2 sm:px-2.5 py-1.5 text-[8px] sm:text-[9px] font-mono font-bold rounded-[8px] transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                sortBy === opt.value
                  ? 'bg-[#3a3a3a] text-white'
                  : 'bg-white border border-[#e5e7eb] text-[#9ca3af] hover:text-[#6b7280] hover:border-black/[0.15]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          <div className="flex-1" />

          <span className="text-[10px] font-mono font-semibold text-[#9ca3af] tabular-nums whitespace-nowrap flex-shrink-0">
            {visibleSorted.length} market{visibleSorted.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Search empty ── */}
      {searchQuery && visibleSorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-sm font-bold text-[#9ca3af]">No matches found</p>
          <p className="text-[11px] text-[#9ca3af]">Try a different search term</p>
        </div>
      )}

      {/* ── Market cards grid — normal page scroll ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleSorted.map((market, i) => (
          <WatchlistCard
            key={market.condition_id}
            market={market}
            addedAt={addedAtMap.get(market.condition_id)}
            livePrices={prices[market.condition_id]}
            index={i}
            onRemove={() => handleRemove(market.condition_id)}
            onClick={() => onMarketClick?.(market)}
          />
        ))}
      </div>
    </div>
  );
}
