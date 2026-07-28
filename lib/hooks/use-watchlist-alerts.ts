import { useEffect, useRef, useCallback } from 'react';
import type { MarketCatalogItem } from '@/lib/types/market';

interface WatchlistAlertConfig {
  watchlist: Set<string>;
  livePricesRef: { current: Record<string, { yes: number; no: number }> };
  /** Market data for looking up questions by conditionId */
  markets?: MarketCatalogItem[];
  threshold?: number;
  interval?: number;
  enabled?: boolean;
}

/**
 * Watchlist price alerts — dispatches custom DOM events picked up by WatchlistAlertOverlay.
 * Uses refs for prices to avoid re-render cascades.
 */
export function useWatchlistAlerts({
  watchlist,
  livePricesRef,
  markets = [],
  threshold = 5,
  interval = 30000,
  enabled = true,
}: WatchlistAlertConfig) {
  const baselinePrices = useRef<Record<string, number>>({});
  const alertedRef = useRef<Set<string>>(new Set());

  const marketsRef = useRef<Map<string, string>>(new Map());

  // Build a question lookup map from markets
  useEffect(() => {
    const marketsMap = new Map<string, string>();
    for (const m of markets) {
      marketsMap.set(m.condition_id, m.question);
    }
    marketsRef.current = marketsMap;
  }, [markets]);

  // Clean up removed watchlist entries
  useEffect(() => {
    for (const id of Object.keys(baselinePrices.current)) {
      if (!watchlist.has(id)) {
        delete baselinePrices.current[id];
        alertedRef.current.delete(id);
      }
    }
  }, [watchlist]);

  const checkAlerts = useCallback(() => {
    if (!enabled || watchlist.size === 0) return;

    const livePrices = livePricesRef.current;

    for (const conditionId of watchlist) {
      const prices = livePrices[conditionId];
      if (!prices) continue;

      const currentYes = prices.yes;

      if (baselinePrices.current[conditionId] === undefined) {
        baselinePrices.current[conditionId] = currentYes;
        continue;
      }

      const baseline = baselinePrices.current[conditionId];
      const changePercent = Math.abs(currentYes - baseline) * 100;

      if (changePercent >= threshold && !alertedRef.current.has(conditionId)) {
        const direction = currentYes > baseline ? 'up' : 'down';
        const arrow = direction === 'up' ? '+' : '';
        const changeStr = `${arrow}${((currentYes - baseline) * 100).toFixed(1)}%`;
        const question = marketsRef.current.get(conditionId) || `Market ${conditionId.slice(0, 8)}...`;

        // Dispatch custom event for WatchlistAlertOverlay
        window.dispatchEvent(new CustomEvent('watchlist-alert', {
          detail: {
            id: `${conditionId}-${Date.now()}`,
            conditionId,
            question,
            direction,
            changeStr,
            currentPrice: currentYes,
          },
        }));

        alertedRef.current.add(conditionId);
        baselinePrices.current[conditionId] = currentYes;

        setTimeout(() => {
          alertedRef.current.delete(conditionId);
        }, interval * 2);
      }
    }
  }, [watchlist, livePricesRef, threshold, interval, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(checkAlerts, interval);
    return () => clearInterval(timer);
  }, [checkAlerts, interval, enabled]);
}
