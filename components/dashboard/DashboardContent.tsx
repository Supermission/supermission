import { useState, useCallback, useEffect } from 'react';
import { useDashboardData } from '@/lib/hooks/dashboard/useDashboardData';
import { useMissionCards } from '@/lib/hooks/dashboard/useMissionCards';
import { useCardFilter } from '@/lib/hooks/dashboard/useCardFilter';
import { usePolymarketPositions, PolymarketPosition } from '@/lib/hooks/dashboard/usePolymarketPositions';
import { FilterTags } from './FilterTags';
import { KanbanBoard } from './KanbanBoard';
import { LoadingState } from './shared/LoadingState';
import { PositionCard } from './PositionCard';
import { AnalyticsSidebarWrapper } from './AnalyticsSidebarWrapper';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface DashboardContentProps {
  address: string;
}

export function DashboardContent({ address }: DashboardContentProps) {
  const { missions, isLoading } = useDashboardData(address);
  const cards = useMissionCards(missions);
  const {
    activeFilter,
    setActiveFilter,
    activeSubFilter,
    setActiveSubFilter,
    filteredCards,
    filterCounts,
    subFilterCounts,
  } = useCardFilter(cards);

  const {
    positions,
    isLoading: isLoadingPositions,
    error: positionsError,
    refetch: refetchPositions,
  } = usePolymarketPositions();

  const [hasLoadedPositions, setHasLoadedPositions] = useState(false);

  // Auto-fetch positions on mount
  useEffect(() => {
    if (address && !hasLoadedPositions) {
      handleFetchPositions();
      setHasLoadedPositions(true);
    }
  }, [address, hasLoadedPositions]);

  // Fetch positions manually
  const handleFetchPositions = useCallback(async () => {
    try {
      await refetchPositions(address);
      if (!isLoadingPositions && !positionsError) {
        toast.success('Positions loaded successfully');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch positions');
    }
  }, [address, refetchPositions, isLoadingPositions, positionsError]);

  // Handle sell action
  const handleSell = useCallback((position: PolymarketPosition) => {
    if (!position.asset) {
      toast.error('Cannot sell: missing position information');
      return;
    }
    toast.info('Sell via the Markets terminal');
  }, []);

  // Calculate counts including positions
  const totalPositionsCount = positions.length;
  const predictionMarketCount = filterCounts.prediction_market + totalPositionsCount;

  // Determine whether to show positions section (only for prediction_market filter)
  const showPositions = activeFilter === 'prediction_market';

  // Show analytics only for prediction market filter
  const showAnalytics = activeFilter === 'prediction_market';

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="flex gap-4">
      {/* Main Content */}
      <div className="flex-1 space-y-4">
        <FilterTags
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          counts={{
            ...filterCounts,
            prediction_market: predictionMarketCount,
          }}
          activeSubFilter={activeSubFilter}
          onSubFilterChange={setActiveSubFilter}
          subFilterCounts={subFilterCounts}
        />

        {/* Positions Section */}
        {showPositions && (
          <div className="space-y-4">
            {/* Positions Card */}
            <div className="border border-black bg-[#f5f5f5]">
              <div className="border-b border-black p-3 bg-[#1D2B3A] text-white flex items-center justify-between">
                <h2 className="font-black text-sm uppercase">
                  POLYMARKET POSITIONS {positions.length > 0 && `(${positions.length})`}
                </h2>
                <button
                  onClick={handleFetchPositions}
                  disabled={isLoadingPositions}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 text-white font-mono text-[10px] uppercase hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingPositions ? 'animate-spin' : ''}`} />
                  {isLoadingPositions ? 'LOADING...' : 'REFRESH'}
                </button>
              </div>

              <div className="p-4">
                {/* Loading State */}
                {isLoadingPositions && positions.length === 0 && (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-violet-500 mx-auto mb-3" />
                    <p className="font-mono text-xs text-neutral-500 uppercase">
                      Loading positions...
                    </p>
                  </div>
                )}

                {/* Error State */}
                {positionsError && positions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="font-mono text-xs text-red-500 mb-3">{positionsError}</p>
                    <button
                      onClick={handleFetchPositions}
                      className="px-4 py-2 bg-black text-white font-mono text-xs uppercase hover:bg-neutral-800 transition-colors"
                    >
                      TRY AGAIN
                    </button>
                  </div>
                )}

                {/* Empty State */}
                {!isLoadingPositions && !positionsError && positions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="font-mono text-xs opacity-60 uppercase mb-2">
                      No active positions
                    </p>
                    <p className="font-mono text-[10px] opacity-40 uppercase">
                      Your Polymarket positions will appear here
                    </p>
                  </div>
                )}

                {/* Positions Grid */}
                {positions.length > 0 && (
                  <div className="space-y-2">
                    {positions.map((position) => (
                      <PositionCard
                        key={`${position.asset}-${position.conditionId}`}
                        position={position}
                        onSell={handleSell}
                      />
                    ))}
                  </div>
                )}

                {/* Summary Stats */}
                {positions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-neutral-300">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-xs text-neutral-500 mb-1">TOTAL VALUE</div>
                        <div className="font-mono font-bold">
                          ${positions.reduce((sum, p) => sum + p.currentValue, 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-neutral-500 mb-1">TOTAL P&L</div>
                        <div className={`font-mono font-bold ${
                          positions.reduce((sum, p) => sum + p.cashPnl, 0) >= 0
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }`}>
                          {positions.reduce((sum, p) => sum + p.cashPnl, 0) >= 0 ? '+' : ''}
                          ${positions.reduce((sum, p) => sum + p.cashPnl, 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-neutral-500 mb-1">AVG P&L %</div>
                        <div className={`font-mono font-bold ${
                          positions.reduce((sum, p) => sum + p.percentPnl, 0) / positions.length >= 0
                            ? 'text-emerald-600'
                            : 'text-red-600'
                        }`}>
                          {positions.reduce((sum, p) => sum + p.percentPnl, 0) / positions.length >= 0 ? '+' : ''}
                          {(positions.reduce((sum, p) => sum + p.percentPnl, 0) / positions.length).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Missions Kanban */}
        {filteredCards.length > 0 && (
          <div className="border border-black bg-[#f5f5f5]">
            <div className="border-b border-black p-3 bg-black text-white">
              <h2 className="font-black text-sm uppercase">MISSIONS</h2>
            </div>
            <div className="p-4">
              <KanbanBoard cards={filteredCards} />
            </div>
          </div>
        )}

        {/* Empty State for Others tab when no missions */}
        {filteredCards.length === 0 && activeFilter === 'other' && (
          <div className="border border-black bg-[#f5f5f5]">
            <div className="p-8 text-center">
              <p className="font-mono text-xs opacity-60 uppercase">
                NO MISSIONS FOUND
              </p>
            </div>
          </div>
        )}

        {/* First-run empty state — no missions, and either not on prediction-market tab or no positions */}
        {filteredCards.length === 0 && activeFilter !== 'other' && !(showPositions && positions.length > 0) && (
          <div className="border border-black bg-[#f5f5f5]">
            <div className="border-b border-black p-3 bg-black text-white">
              <h2 className="font-black text-sm uppercase">Get started</h2>
            </div>
            <div className="p-6 sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-wider opacity-60 mb-5">
                You have no active missions yet. Start with one of these:
              </p>
              <div className="space-y-2">
                <Link
                  href="/defai?prompt=Swap%20100%20USDC%20to%20WETH%20on%20Base"
                  className="flex items-center justify-between border border-black bg-white px-4 py-3 hover:bg-black hover:text-white transition-colors group"
                >
                  <span className="font-mono text-[12px] font-bold uppercase tracking-wider">
                    Swap USDC via DELPHI
                  </span>
                  <span className="font-mono text-[10px] opacity-60 group-hover:opacity-100">
                    →
                  </span>
                </Link>
                <Link
                  href="/markets"
                  className="flex items-center justify-between border border-black bg-white px-4 py-3 hover:bg-black hover:text-white transition-colors group"
                >
                  <span className="font-mono text-[12px] font-bold uppercase tracking-wider">
                    Browse prediction markets
                  </span>
                  <span className="font-mono text-[10px] opacity-60 group-hover:opacity-100">
                    →
                  </span>
                </Link>
                <Link
                  href="/defai?prompt=Show%20me%20the%20best%20Morpho%20vault%20yields%20on%20Base"
                  className="flex items-center justify-between border border-black bg-white px-4 py-3 hover:bg-black hover:text-white transition-colors group"
                >
                  <span className="font-mono text-[12px] font-bold uppercase tracking-wider">
                    Deposit to a Morpho vault
                  </span>
                  <span className="font-mono text-[10px] opacity-60 group-hover:opacity-100">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Right Side: Analytics Sidebar - only show for Prediction Market filter */}
      {showAnalytics && (
        <div className="w-[220px] flex-shrink-0 hidden lg:block">
          <AnalyticsSidebarWrapper address={address} positions={positions} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
