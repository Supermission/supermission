'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { CategorySidebar } from './CategorySidebar';
import { MarketGrid } from './MarketGrid';
import { StackedMarketGrid } from './StackedMarketGrid';
import { PortfolioView } from './PortfolioView';
import { WatchlistView } from './WatchlistView';
import { useMarketCatalog } from '@/lib/hooks/use-market-catalog';
import { useWatchlist } from '@/lib/hooks/use-watchlist';
import { useWatchlistAlerts } from '@/lib/hooks/use-watchlist-alerts';
import { useTradeExecution } from '@/lib/hooks/use-trade-execution';
import { useTradeHandlers } from '@/lib/hooks/use-trade-handlers';
import { useWatchlistMarkets } from '@/lib/hooks/use-watchlist-markets';
import { useUIStore } from '@/lib/store/ui';
import { WORKER_API } from '@/lib/config/worker';
import SignalFeed from './SignalFeed';
import dynamic from 'next/dynamic';
const PredictionMarketChat = dynamic(() => import('./PredictionMarketChat').then(mod => ({ default: mod.PredictionMarketChat })), { ssr: false });
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { WatchlistAlertOverlay } from './WatchlistAlertOverlay';

export function MarketTerminal() {
  const router = useRouter();
  const address = useEmbeddedAddress();
  const activeTab = useUIStore((s) => s.marketTab);
  const setWatchlistCount = useUIStore((s) => s.setWatchlistCount);
  const setPortfolioCount = useUIStore((s) => s.setPortfolioCount);
  const [viewMode, setViewMode] = useState<'normal' | 'stacked'>('normal');
  // Ref-based price cache — avoids re-rendering MarketTerminal (and ALL children)
  // every time SSE delivers prices. Only the component with useSSEPrices re-renders.
  const gridPricesRef = useRef<Record<string, LivePrices>>({});

  const tradeExecution = useTradeExecution();
  const { isExecuting } = tradeExecution;

  // Ref to portfolio hooks — lets us inject optimistic buys/sells from trade handlers
  const portfolioHooksRef = useRef<{
    refetch: (addr: string) => Promise<void>;
    refreshHistory: () => void;
  } | null>(null);
  const handlePortfolioHookReady = useCallback((hooks: {
    refetch: (addr: string) => Promise<void>;
    refreshHistory: () => void;
  }) => { portfolioHooksRef.current = hooks; }, []);

  const {
    markets,
    loading,
    total,
    hasMore,
    loadMore,
    filters,
    setCategory,
    setSort,
    setSearch,
  } = useMarketCatalog();

  const { watchlist, entries: watchlistEntries, toggle: rawToggleWatch } = useWatchlist(address);
  const toggleWatch = useCallback((conditionId: string) => {
    if (!address) { toast.error('Connect wallet to bookmark'); return; }
    rawToggleWatch(conditionId);
  }, [address, rawToggleWatch]);

  const { watchlistMarkets, watchlistLoading } = useWatchlistMarkets({
    watchlist,
    activeTab,
    setWatchlistCount,
  });

  const {
    handleTrade,
    handleSellPosition,
    handleRedeemPosition,
    activeTradeId,
    sellingPosition,
    redeemingPosition,
  } = useTradeHandlers({
    address,
    tradeExecution,
    markets,
    watchlistMarkets,
    gridPricesRef,
    portfolioHooksRef,
  });

  // Redirect legacy ?detail=<conditionId> deep-links to the full-page route.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const detailId = params.get('detail');
    if (detailId) router.replace(`/markets/${detailId}`);
  }, [router]);

  const handleMarketClick = useCallback((market: MarketCatalogItem) => {
    router.push(`/markets/${market.condition_id}`);
  }, [router]);
  const handleMarketClickById = useCallback((conditionId: string) => {
    router.push(`/markets/${conditionId}`);
  }, [router]);
  const handleMarketTextClick = useCallback(async (questionText: string) => {
    // Resolve the question text to a condition_id, then navigate to the page.
    const found = markets.find(m => m.question?.toLowerCase().includes(questionText.toLowerCase()));
    if (found) { router.push(`/markets/${found.condition_id}`); return; }
    try {
      const res = await fetch(`${WORKER_API}/v1/markets?search=${encodeURIComponent(questionText)}&limit=1`);
      const data = await res.json();
      const market = data.markets?.[0];
      if (market) router.push(`/markets/${market.condition_id}`);
      else toast.error('Market not found in catalog');
    } catch (err) {
      console.warn('[MarketTerminal] Failed to find market by text:', err);
      toast.error('Failed to find market');
    }
  }, [markets, router]);

  useWatchlistAlerts({ watchlist, livePricesRef: gridPricesRef, markets, threshold: 5, enabled: watchlist.size > 0 });
  const handlePricesUpdate = useCallback((prices: Record<string, LivePrices>) => {
    gridPricesRef.current = { ...gridPricesRef.current, ...prices };
  }, []);

  return (
    <>
      {/* Watchlist price alert notifications — bottom-right corner */}
      <WatchlistAlertOverlay onMarketClick={handleMarketClickById} />

      {/* Fixed Sidebar — search, sort, categories (browse only) */}
      {activeTab === 'browse' && (
        <CategorySidebar
          selectedCategory={filters.category || 'all'}
          onSelectCategory={setCategory}
          onSearch={setSearch}
          onSort={setSort}
          currentSort={filters.sort || 'trending'}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {/* Content — offset when sidebar visible */}
      <div className={activeTab === 'browse' ? 'lg:ml-52 p-4 sm:p-6 pt-32 sm:pt-6 pb-20 md:pb-0' : activeTab === 'agent' ? 'p-0 h-[calc(100dvh-3.5rem)] sm:h-[calc(100dvh-4rem)]' : 'p-4 sm:p-6 pb-20 md:pb-0'}>
        {/* Portfolio always mounted (hidden when not active) so hooks stay alive for optimistic updates */}
        <div className={activeTab === 'portfolio' ? '' : 'hidden'}>
          <PortfolioView
            onSell={handleSellPosition}
            onRedeem={handleRedeemPosition}
            sellingConditionId={sellingPosition}
            redeemingConditionId={redeemingPosition}
            onPositionCountChange={setPortfolioCount}
            onHookReady={handlePortfolioHookReady}
            onMarketClick={handleMarketClickById}
            onPricesUpdate={handlePricesUpdate}
          />
        </div>
        {activeTab === 'watchlist' ? (
          <WatchlistView
            markets={watchlistMarkets}
            loading={watchlistLoading}
            watchlist={watchlist}
            entries={watchlistEntries}
            onToggleWatch={toggleWatch}
            onMarketClick={handleMarketClick}
            onTrade={handleTrade}
            onPricesUpdate={handlePricesUpdate}
            tradingConditionId={activeTradeId}
          />
        ) : activeTab === 'browse' ? (
          <>
          {viewMode === 'stacked' ? (
            <StackedMarketGrid
              category={filters.category}
              sort={filters.sort}
              search={filters.search}
              onMarketClick={handleMarketClick}
              onPricesUpdate={handlePricesUpdate}
            />
          ) : (
            <MarketGrid
              markets={markets}
              loading={loading}
              total={total}
              hasMore={hasMore}
              onLoadMore={loadMore}
              watchlist={watchlist}
              onToggleWatch={toggleWatch}
              onTrade={handleTrade}
              onMarketClick={handleMarketClick}
              onPricesUpdate={handlePricesUpdate}
              tradingConditionId={activeTradeId}
              topContent={
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-black/[0.04]" />
                  <span className="flex items-center gap-1.5 text-[10px] text-[#9ca3af] font-medium" style={{ fontFamily: "var(--font-bricolage), sans-serif" }}>
                    Powered by
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/tokens/polymarket.png" alt="Polymarket" className="w-4 h-4 rounded" />
                    <span className="font-bold text-[#1a1a1a]">Polymarket</span>
                  </span>
                </div>
              }
            />
          )}
          </>
        ) : activeTab === 'signals' ? (
          <SignalFeed onMarketClick={handleMarketClick} />
        ) : activeTab === 'agent' ? (
          <PredictionMarketChat onMarketClick={handleMarketClick} onMarketTextClick={handleMarketTextClick} />
        ) : null}
      </div>
    </>
  );
}
