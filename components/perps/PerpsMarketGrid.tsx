'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHLMarkets } from '@/lib/hyperliquid/hooks';
import { useUIStore } from '@/lib/store/ui';
import { PerpsMarketCard } from './PerpsMarketCard';
import { PerpsFilters, type MarketMode } from './PerpsFilters';
import { PerpsSearchBar } from './PerpsSearchBar';
import { CoinIcon } from './CoinIcon';
import { formatPrice, formatVolume, pctChange } from '@/lib/hyperliquid/utils';
import type { MarketData } from '@/lib/hyperliquid/types';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

function useColCount() {
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCols(w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return cols;
}

function MasonryGrid({ markets, activeCardId, onActivate }: { markets: MarketData[]; activeCardId: string | null; onActivate: (id: string | null) => void }) {
  const colCount = useColCount();
  const columns = useMemo(() => {
    const cols: MarketData[][] = Array.from({ length: colCount }, () => []);
    markets.forEach((m, i) => cols[i % colCount].push(m));
    return cols;
  }, [markets, colCount]);

  return (
    <div className="flex gap-2 sm:gap-3">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex-1 flex flex-col gap-2 sm:gap-3 min-w-0">
          {col.map((m, rowIdx) => (
            <PerpsMarketCard key={m.coin} market={m} index={colIdx + rowIdx * colCount} activeCardId={activeCardId} onActivate={onActivate} compact={colCount === 1} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Mobile-only compact list row
function MobileMarketRow({ market, index, darkMode }: { market: MarketData; index: number; darkMode: boolean }) {
  const router = useRouter();
  const midPx = parseFloat(market.midPx);
  const prevPx = parseFloat(market.prevDayPx);
  const change = pctChange(midPx, prevPx);
  const isPositive = change >= 0;
  const decimals = midPx >= 1000 ? 2 : midPx >= 1 ? 4 : 6;
  const volume = parseFloat(market.dayNtlVlm);
  const isSpot = market.marketType === 'spot';

  return (
    <div
      onClick={() => router.push(isSpot ? `/spot/${market.coin}` : `/perps/${market.coin}`)}
      className={`flex items-center gap-3 px-3 py-3 border-b cursor-pointer ${
        darkMode
          ? 'bg-[#111] border-white/[0.04] active:bg-white/[0.04]'
          : 'bg-white border-black/[0.04] active:bg-black/[0.02]'
      }`}
    >
      <CoinIcon symbol={market.coin} size={28} className="w-7 h-7 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-black ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>{market.coin}</span>
          <span className={`text-[9px] font-bold uppercase ${darkMode ? 'text-white/30' : 'text-black/30'}`}>{isSpot ? 'SPOT' : `${market.maxLeverage}x`}</span>
        </div>
        <span className={`text-[10px] ${darkMode ? 'text-white/40' : 'text-black/40'}`}>Vol {formatVolume(volume)}</span>
      </div>
      <div className="text-right">
        <div className={`text-[14px] font-black tabular-nums ${darkMode ? 'text-white' : 'text-[#1a1a1a]'}`} style={{ fontFamily: FONT }}>
          ${formatPrice(midPx, decimals)}
        </div>
        <div className={`text-[11px] font-bold tabular-nums ${
          isPositive
            ? darkMode ? 'text-[#00ff88]' : 'text-emerald-600'
            : darkMode ? 'text-[#ff4466]' : 'text-rose-500'
        }`} style={{ fontFamily: FONT }}>
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

export function PerpsMarketGrid() {
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState('Volume');
  const [search, setSearch] = useState('');
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [marketMode, setMarketMode] = useState<MarketMode>('perps');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { markets: allMarkets, isLoading, error } = useHLMarkets({
    category,
    sort,
    search,
  });

  // Filter by market mode — UI uses 'perps'/'spot', store uses 'perp'/'spot'
  const filterType = marketMode === 'perps' ? 'perp' : 'spot';
  const markets = allMarkets.filter(m => (m.marketType || 'perp') === filterType);

  const perpsDarkMode = useUIStore((s) => s.perpsDarkMode);

  // Mobile view with light/dark support
  if (isMobile) {
    return (
      <div className={`min-h-screen ${perpsDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
        {/* Mobile header */}
        <div className={`sticky top-14 z-20 border-b px-3 py-2 ${
          perpsDarkMode ? 'bg-[#0a0a0a] border-white/[0.06]' : 'bg-white border-black/[0.06]'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <PerpsFilters
              activeCategory={category}
              onCategoryChange={setCategory}
              activeSort={sort}
              onSortChange={setSort}
              marketMode={marketMode}
              onMarketModeChange={setMarketMode}
              darkMode={perpsDarkMode}
            />
          </div>
          <PerpsSearchBar value={search} onChange={setSearch} darkMode={perpsDarkMode} />
        </div>

        {/* Loading */}
        {isLoading && !error && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 border-2 rounded-full animate-spin ${
                perpsDarkMode ? 'border-white/20 border-t-white/60' : 'border-black/10 border-t-black/40'
              }`} />
              <span className={`text-[11px] font-bold uppercase tracking-widest ${perpsDarkMode ? 'text-white/40' : 'text-black/40'}`} style={{ fontFamily: FONT }}>Loading</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-12">
            <p className={`text-sm font-medium ${perpsDarkMode ? 'text-[#ff4466]' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && markets.length === 0 && (
          <div className="text-center py-16">
            <p className={`text-sm font-medium ${perpsDarkMode ? 'text-white/40' : 'text-black/40'}`} style={{ fontFamily: FONT }}>No markets found</p>
          </div>
        )}

        {/* Market list */}
        {!isLoading && !error && markets.length > 0 && (
          <>
            <div className={`flex items-center gap-2 px-3 py-2 border-b ${perpsDarkMode ? 'border-white/[0.04]' : 'border-black/[0.04]'}`}>
              <span className={`text-[9px] font-bold uppercase tracking-widest ${perpsDarkMode ? 'text-white/30' : 'text-black/30'}`} style={{ fontFamily: FONT }}>
                {markets.length} Markets
              </span>
              <div className="flex-1" />
              <span className={`flex items-center gap-1 text-[9px] ${perpsDarkMode ? 'text-white/30' : 'text-black/30'}`} style={{ fontFamily: FONT }}>
                <CoinIcon symbol="HYPE" size={12} className="w-3 h-3 opacity-50" />
                Hyperliquid
              </span>
            </div>
            <div>
              {markets.map((m, i) => (
                <MobileMarketRow key={m.coin} market={m} index={i} darkMode={perpsDarkMode} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Desktop view (unchanged)
  return (
    <div className="px-2 sm:px-6 md:px-8 py-2 sm:py-6">
      {/* Toolbar — single row: filters + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
        <PerpsFilters
          activeCategory={category}
          onCategoryChange={setCategory}
          activeSort={sort}
          onSortChange={setSort}
          marketMode={marketMode}
          onMarketModeChange={setMarketMode}
        />
        <PerpsSearchBar value={search} onChange={setSearch} />
      </div>

      {/* Error */}
      {error && (
        <div className="text-center py-12">
          <p className="text-sm text-rose-500 font-medium" style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}>
            {error}
          </p>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && !error && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-3 w-3 border-2 border-black/20 border-t-black/60 rounded-full animate-spin" />
            <span className="text-[10px] font-semibold text-black/30 tracking-wider uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              Loading markets
            </span>
            <div className="flex-1 h-px bg-black/[0.04]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border border-black/[0.08] rounded-[12px] bg-white p-4 animate-pulse">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-black/[0.06]" />
                  <div className="flex-1">
                    <div className="h-4 w-20 bg-black/[0.07] rounded-[4px] mb-1" />
                    <div className="h-5 w-28 bg-black/[0.07] rounded-[4px]" />
                  </div>
                  <div className="h-6 w-16 bg-black/[0.05] rounded-md" />
                </div>
                <div className="flex gap-1.5 mb-3">
                  <div className="h-5 w-14 bg-black/[0.04] rounded-md" />
                  <div className="h-5 w-14 bg-black/[0.04] rounded-md" />
                </div>
                <div className="flex justify-between mb-3">
                  <div className="h-8 w-20 bg-black/[0.04] rounded-[4px]" />
                  <div className="h-8 w-20 bg-black/[0.04] rounded-[4px]" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-9 bg-emerald-100/60 rounded-[8px]" />
                  <div className="flex-1 h-9 bg-rose-100/60 rounded-[8px]" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty */}
      {!isLoading && !error && markets.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-[#9ca3af] font-medium" style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}>
            No markets found
          </p>
        </div>
      )}

      {/* Market cards — 4 columns on XL */}
      {!isLoading && !error && markets.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-black/30 tracking-wider uppercase" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
              {markets.length} market{markets.length !== 1 ? 's' : ''}
            </span>
            <div className="flex-1 h-px bg-black/[0.04]" />
            <span className="flex items-center gap-1.5 text-[10px] text-[#9ca3af] font-medium" style={{ fontFamily: "var(--font-bricolage), sans-serif" }}>
              Powered by
              <CoinIcon symbol="HYPE" size={16} className="w-4 h-4" />
              <span className="font-bold text-[#1a1a1a]">Hyperliquid</span>
            </span>
          </div>
          <MasonryGrid markets={markets} activeCardId={activeCardId} onActivate={setActiveCardId} />
        </>
      )}
    </div>
  );
}
