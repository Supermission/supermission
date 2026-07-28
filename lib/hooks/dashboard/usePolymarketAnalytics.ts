import { useState, useCallback, useRef } from 'react';
import { PolymarketPosition } from './usePolymarketPositions';
import { AnalyticsData } from '@/lib/utils/dashboard/types';

interface PolymarketTrade {
  side: 'BUY' | 'SELL';
  conditionId: string;
  size: number;
  price: number;
}

interface UsePolymarketAnalyticsResult {
  analytics: AnalyticsData;
  isLoading: boolean;
  error: string | null;
  fetchAnalytics: (address: string, positions: PolymarketPosition[]) => Promise<void>;
}

const DEFAULT_ANALYTICS: AnalyticsData = {
  totalInvested: 0,
  totalProfit: 0,
  winRate: 0,
  executingCount: 0,
  completedCount: 0,
};

export function usePolymarketAnalytics(): UsePolymarketAnalyticsResult {
  const [analytics, setAnalytics] = useState<AnalyticsData>(DEFAULT_ANALYTICS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async (address: string, positions: PolymarketPosition[]) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const tradesRes = await fetch(
        `/api/proxy/polymarket?api=data&path=/trades&user=${encodeURIComponent(address)}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!tradesRes.ok) throw new Error(`Failed to fetch trades: ${tradesRes.status}`);

      const trades: PolymarketTrade[] = await tradesRes.json();

      // Total invested = total USDC spent on all BUY trades
      const totalInvested = trades
        .filter(t => t.side === 'BUY')
        .reduce((sum, t) => sum + t.size * t.price, 0);

      // Active conditionIds from positions
      const activeConditionIds = new Set(positions.map(p => p.conditionId));

      // Executing markets = unique conditionIds with active positions
      const executingCount = activeConditionIds.size;

      // All unique conditionIds from trades
      const allTradeConditionIds = new Set(trades.map(t => t.conditionId));

      // Completed markets = conditionIds in trades that are NOT in active positions
      const completedConditionIds = [...allTradeConditionIds].filter(
        id => !activeConditionIds.has(id)
      );
      const completedCount = completedConditionIds.length;

      // P&L for active positions (unrealized + realized)
      const activePnl = positions.reduce((sum, p) => sum + p.cashPnl, 0);

      // P&L for completed markets
      let completedPnl = 0;
      let winningMarkets = 0;

      for (const conditionId of completedConditionIds) {
        const marketTrades = trades.filter(t => t.conditionId === conditionId);
        const buyTotal = marketTrades
          .filter(t => t.side === 'BUY')
          .reduce((sum, t) => sum + t.size * t.price, 0);
        const sellTotal = marketTrades
          .filter(t => t.side === 'SELL')
          .reduce((sum, t) => sum + t.size * t.price, 0);
        const marketPnl = sellTotal - buyTotal;
        completedPnl += marketPnl;
        if (marketPnl > 0) winningMarkets++;
      }

      const totalProfit = activePnl + completedPnl;
      const winRate = completedCount > 0
        ? (winningMarkets / completedCount) * 100
        : 0;

      setAnalytics({
        totalInvested,
        totalProfit,
        winRate,
        executingCount,
        completedCount,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[usePolymarketAnalytics] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  return { analytics, isLoading, error, fetchAnalytics };
}
