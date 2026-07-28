import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WORKER_API } from '@/lib/config/worker';

export interface PolymarketPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  bidPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon: string;
  eventId: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome: string;
  oppositeAsset: string;
  endDate: string;
  negativeRisk: boolean;
}

export interface PortfolioPnlStats {
  /** Sum of realizedPnl across ALL positions (Polymarket's own calculation) */
  totalRealizedPnl: number;
  /** Sum of cashPnl (unrealized) across ALL positions */
  totalUnrealizedPnl: number;
  /** totalRealizedPnl + totalUnrealizedPnl */
  totalPnl: number;
  /** Sum of totalBought across ALL positions (total ever invested) */
  totalBought: number;
  /** totalPnl / totalBought * 100 */
  totalPnlPercent: number;
}

interface UsePolymarketPositionsResult {
  /** Merged view: API data + optimistic buys − sold IDs */
  positions: PolymarketPosition[];
  /** Set of conditionId:outcome keys that are optimistic (not yet confirmed by API) */
  optimisticKeys: Set<string>;
  /** Aggregate P&L stats from ALL positions (including resolved/lost ones) */
  pnlStats: PortfolioPnlStats;
  isLoading: boolean;
  error: string | null;
  refetch: (address: string) => Promise<void>;
  addOptimisticBuy: (position: PolymarketPosition) => void;
  markSold: (conditionId: string) => void;
}

/**
 * Normalize a raw Polymarket Data API position into our PolymarketPosition shape.
 * The API returns a mix of camelCase top-level fields and snake_case fields nested
 * inside an `asset` object. This function handles both so the rest of the app can
 * trust the interface without defensive fallbacks everywhere.
 */
interface RawPolymarketPosition {
  proxyWallet?: string;
  asset?: string | { token_id?: string; condition_id?: string; outcome?: string; neg_risk?: boolean };
  conditionId?: string;
  size?: string | number;
  avgPrice?: string | number;
  curPrice?: string | number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  slug?: string;
  icon?: string;
  eventId?: string;
  event_id?: string;
  eventSlug?: string;
  event_slug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  opposite_outcome?: string;
  oppositeAsset?: string;
  opposite_asset?: string;
  endDate?: string;
  end_date?: string;
  negativeRisk?: boolean;
  negative_risk?: boolean;
}

function normalizePosition(p: RawPolymarketPosition): PolymarketPosition {
  const assetObj = typeof p.asset === 'object' ? p.asset : undefined;
  const conditionId = assetObj?.condition_id || p.conditionId || '';
  const outcome = assetObj?.outcome || p.outcome || 'Yes';
  const size = typeof p.size === 'string' ? parseFloat(p.size) : (p.size || 0);
  const avgPrice = typeof p.avgPrice === 'string' ? parseFloat(p.avgPrice) : (p.avgPrice || 0);
  const curPrice = typeof p.curPrice === 'string' ? parseFloat(p.curPrice) : (p.curPrice || 0);

  return {
    proxyWallet: p.proxyWallet || '',
    asset: typeof p.asset === 'string' ? p.asset : (assetObj?.token_id || ''),
    conditionId,
    size,
    avgPrice,
    initialValue: p.initialValue || size * avgPrice,
    currentValue: p.currentValue || size * curPrice,
    cashPnl: p.cashPnl ?? 0,
    percentPnl: p.percentPnl ?? 0,
    totalBought: p.totalBought ?? 0,
    realizedPnl: p.realizedPnl ?? 0,
    percentRealizedPnl: p.percentRealizedPnl ?? 0,
    curPrice,
    bidPrice: curPrice,
    redeemable: p.redeemable ?? false,
    mergeable: p.mergeable ?? false,
    title: p.title || '',
    slug: p.slug || '',
    icon: p.icon || '',
    eventId: p.eventId || p.event_id || '',
    eventSlug: p.eventSlug || p.event_slug || '',
    outcome,
    outcomeIndex: p.outcomeIndex ?? (outcome.toLowerCase() === 'no' ? 1 : 0),
    oppositeOutcome: p.oppositeOutcome || p.opposite_outcome || '',
    oppositeAsset: p.oppositeAsset || p.opposite_asset || '',
    endDate: p.endDate || p.end_date || '',
    negativeRisk: assetObj?.neg_risk ?? p.negativeRisk ?? p.negative_risk ?? false,
  };
}

/**
 * Enrich positions with correct end_date from our worker API.
 * The Polymarket data API returns event-level end_dates which are wrong
 * for short-duration recurring markets (e.g. 15-min "Up or Down" crypto markets).
 * Our worker has the correct market-level endDate from the Gamma API.
 */
async function enrichEndDates(positions: PolymarketPosition[]): Promise<PolymarketPosition[]> {
  if (positions.length === 0) return positions;

  const conditionIds = positions.map(p => p.conditionId).filter(Boolean);
  if (conditionIds.length === 0) return positions;

  try {
    const res = await fetch(
      `${WORKER_API}/v1/markets?ids=${conditionIds.join(',')}&limit=100`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!res.ok) return positions;

    const data = await res.json();
    const marketMap = new Map<string, { endDate: string; clobTokenIds: string[] }>();
    for (const m of data.markets || []) {
      if (m.condition_id) {
        marketMap.set(m.condition_id, {
          endDate: m.end_date || '',
          clobTokenIds: m.clob_token_ids || [],
        });
      }
    }

    if (marketMap.size === 0) return positions;

    return positions.map(p => {
      const market = marketMap.get(p.conditionId);
      if (!market) return p;

      const updates: Partial<PolymarketPosition> = {};
      if (market.endDate) updates.endDate = market.endDate;

      // Resolve outcomeIndex from token_id position in clob_token_ids.
      // This is the only reliable method — outcome names can be team names,
      // not just 'Yes'/'No', so string matching is unreliable.
      if (market.clobTokenIds.length >= 2 && p.asset) {
        const tokenIdx = market.clobTokenIds.indexOf(p.asset);
        if (tokenIdx !== -1) updates.outcomeIndex = tokenIdx;
      }

      return Object.keys(updates).length > 0 ? { ...p, ...updates } : p;
    });
  } catch {
    // Non-critical — fall back to Polymarket's end_date
    return positions;
  }
}

/**
 * Three-layer position management:
 *   1. apiPositions — real data from Polymarket Data API
 *   2. optimisticBuys — injected instantly after buy, auto-cleaned when API catches up
 *   3. soldIds — hidden instantly after sell, auto-cleaned when API catches up
 *
 * The merged `positions` output = (apiPositions + optimisticBuys not yet in API) − soldIds
 */
const emptyPnlStats: PortfolioPnlStats = {
  totalRealizedPnl: 0,
  totalUnrealizedPnl: 0,
  totalPnl: 0,
  totalBought: 0,
  totalPnlPercent: 0,
};

/**
 * Fetches positions from Polymarket Data API, normalizes, filters active,
 * enriches end dates, and returns both active positions and P&L stats
 * computed from ALL positions (including resolved/zero-size).
 */
async function fetchPositions(
  address: string,
  signal: AbortSignal,
): Promise<{ active: PolymarketPosition[]; pnlStats: PortfolioPnlStats }> {
  const response = await fetch(
    `/api/proxy/polymarket?api=data&path=/positions&user=${encodeURIComponent(address)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch positions: ${response.status}`);
  }

  const data = await response.json();
  const allPositions = (data || []).map(normalizePosition);

  // Compute aggregate P&L stats from ALL positions (including resolved/lost)
  const totalRealizedPnl = allPositions.reduce((s: number, p: PolymarketPosition) => s + p.realizedPnl, 0);
  const totalUnrealizedPnl = allPositions.reduce((s: number, p: PolymarketPosition) => s + p.cashPnl, 0);
  const totalBought = allPositions.reduce((s: number, p: PolymarketPosition) => s + p.totalBought, 0);
  const totalPnl = totalRealizedPnl + totalUnrealizedPnl;

  const pnlStats: PortfolioPnlStats = {
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalPnl,
    totalBought,
    totalPnlPercent: totalBought > 0 ? (totalPnl / totalBought) * 100 : 0,
  };

  let active = allPositions.filter((p: PolymarketPosition) => p.size > 0);

  // Enrich positions with correct end_date from our worker API.
  active = await enrichEndDates(active);

  return { active, pnlStats };
}

export function usePolymarketPositions(): UsePolymarketPositionsResult {
  const [address, setAddress] = useState<string>('');
  const [optimisticBuys, setOptimisticBuys] = useState<PolymarketPosition[]>([]);
  const [soldIds, setSoldIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['polymarket-positions', address],
    queryFn: ({ signal }) => fetchPositions(address, signal),
    enabled: !!address,
    retry: 2,
    // React Query uses the AbortController signal for cancellation on
    // unmount / key change, matching the old callerAbort pattern.
  });

  const apiPositions = query.data?.active ?? [];

  // Auto-clean optimistic state when API data arrives
  useEffect(() => {
    if (!query.data) return;
    const active = query.data.active;

    // Auto-clean optimistic buys: remove any that now exist in API data
    const apiKeys = new Set(active.map((p: PolymarketPosition) => `${p.conditionId}:${p.outcome}`));
    setOptimisticBuys(prev => {
      const next = prev.filter(o => !apiKeys.has(`${o.conditionId}:${o.outcome}`));
      return next.length === prev.length ? prev : next;
    });

    // Auto-clean soldIds: remove any conditionId no longer in API data (truly gone)
    const apiConditionIds = new Set(active.map((p: PolymarketPosition) => p.conditionId));
    setSoldIds(prev => {
      const next = new Set([...prev].filter(id => apiConditionIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [query.data]);

  // refetch(address) — update address state to trigger query, or re-trigger if same address
  const refetch = useCallback(async (addr: string) => {
    if (addr === address) {
      // Same address — invalidate to force refetch
      await queryClient.invalidateQueries({ queryKey: ['polymarket-positions', addr] });
    } else {
      // New address — setting state triggers the query automatically
      setAddress(addr);
    }
  }, [address, queryClient]);

  // Inject an optimistic position after buy — survives refetches until API catches up
  const addOptimisticBuy = useCallback((position: PolymarketPosition) => {
    setOptimisticBuys(prev => {
      const key = `${position.conditionId}:${position.outcome}`;
      const existing = prev.find(p => `${p.conditionId}:${p.outcome}` === key);
      if (existing) {
        return prev.map(p =>
          `${p.conditionId}:${p.outcome}` === key
            ? { ...p, size: p.size + position.size, initialValue: p.initialValue + position.initialValue, currentValue: p.currentValue + position.currentValue, totalBought: p.totalBought + position.totalBought }
            : p
        );
      }
      return [position, ...prev];
    });
  }, []);

  // Mark a position as sold — hidden instantly, survives refetches until API confirms gone
  const markSold = useCallback((conditionId: string) => {
    setSoldIds(prev => new Set([...prev, conditionId]));
  }, []);

  // Merged view: API + optimistic (not yet in API) − sold
  // For existing positions, merge optimistic shares ON TOP of API data
  const { positions, optimisticKeys } = useMemo(() => {
    const apiKeys = new Set(apiPositions.map(p => `${p.conditionId}:${p.outcome}`));
    const pendingOptimistic = optimisticBuys.filter(o => !apiKeys.has(`${o.conditionId}:${o.outcome}`));
    // Augment existing API positions with optimistic additional shares
    const augmentMap = new Map<string, PolymarketPosition>();
    for (const o of optimisticBuys) {
      const key = `${o.conditionId}:${o.outcome}`;
      if (apiKeys.has(key)) augmentMap.set(key, o);
    }
    const augmented = apiPositions.map(p => {
      const opt = augmentMap.get(`${p.conditionId}:${p.outcome}`);
      if (!opt) return p;
      // Add optimistic shares to the API position
      const newSize = p.size + opt.size;
      const newInitialValue = p.initialValue + opt.initialValue;
      const newCurrentValue = newSize * p.curPrice;
      const newCashPnl = newCurrentValue - newInitialValue;
      const newPercentPnl = newInitialValue > 0 ? (newCashPnl / newInitialValue) * 100 : 0;
      return { ...p, size: newSize, initialValue: newInitialValue, currentValue: newCurrentValue, cashPnl: newCashPnl, percentPnl: newPercentPnl, totalBought: p.totalBought + opt.totalBought };
    });
    const merged = [...augmented, ...pendingOptimistic];
    const filtered = merged.filter(p => !soldIds.has(p.conditionId));
    const optKeys = new Set([
      ...pendingOptimistic.map(o => `${o.conditionId}:${o.outcome}`),
      ...augmentMap.keys(),
    ]);
    return { positions: filtered, optimisticKeys: optKeys };
  }, [apiPositions, optimisticBuys, soldIds]);

  // P&L stats from query data
  const pnlStats = query.data?.pnlStats ?? emptyPnlStats;

  // Map error to string | null to match original API
  const error = query.error
    ? (query.error instanceof DOMException && query.error.name === 'AbortError'
        ? 'Request timed out — please try again'
        : query.error.message)
    : null;

  return {
    positions,
    optimisticKeys,
    pnlStats,
    isLoading: query.isLoading && query.fetchStatus === 'fetching',
    error,
    refetch,
    addOptimisticBuy,
    markSold,
  };
}
