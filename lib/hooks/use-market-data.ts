import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getMarketBySlug } from '@/lib/new-agents/polymarketAgent/markets';
import type { PolymarketMarket } from '@/lib/new-agents/polymarketAgent/markets';

interface MarketDeal {
  id?: string;
  market_slug?: string;
  question?: string;
  clobTokenIds?: string | string[];
  clob_token_ids?: string | string[];
  outcomes?: string | string[];
  current_yes_price?: number;
  current_no_price?: number;
  volume?: number;
}

interface UseMarketDataProps {
  deal: MarketDeal | null | undefined;
  currentMarketIndex: number;
}

function buildFallbackMarket(deal: MarketDeal | null | undefined): PolymarketMarket | null {
  if (!deal?.clobTokenIds && !deal?.clob_token_ids) return null;
  try {
    const tokenIds = deal.clobTokenIds || deal.clob_token_ids;
    const parsedTokenIds = typeof tokenIds === 'string' ? JSON.parse(tokenIds) : tokenIds;
    const outcomes = deal.outcomes ? (typeof deal.outcomes === 'string' ? JSON.parse(deal.outcomes) : deal.outcomes) : ['Yes', 'No'];
    return {
      id: deal.id || 'deal',
      question: deal.question || '',
      clobTokenIds: parsedTokenIds,
      outcomePrices: [String(deal.current_yes_price ?? 0.5), String(deal.current_no_price ?? 0.5)],
      outcomes,
      volume: deal.volume || 0,
      active: true,
    };
  } catch {
    return null;
  }
}

function getTokenIds(deal: MarketDeal | null | undefined, marketData: PolymarketMarket | null | undefined): string[] {
  if (marketData?.clobTokenIds) {
    return marketData.clobTokenIds;
  }
  if (deal?.clobTokenIds || deal?.clob_token_ids) {
    try {
      const rawTokenIds = deal.clobTokenIds || deal.clob_token_ids;
      return typeof rawTokenIds === 'string' ? JSON.parse(rawTokenIds) : rawTokenIds || [];
    } catch (e) {
      console.error('[fetchLivePrices] Error parsing token IDs:', e);
    }
  }
  return [];
}

async function fetchLivePricesFromApi(tokenIds: string[]): Promise<{ yes: number; no: number } | null> {
  const [yesResponse, noResponse] = await Promise.all([
    fetch(`/api/proxy/polymarket?api=clob&path=/price&token_id=${encodeURIComponent(tokenIds[0])}&side=buy`),
    fetch(`/api/proxy/polymarket?api=clob&path=/price&token_id=${encodeURIComponent(tokenIds[1])}&side=buy`)
  ]);

  if (yesResponse.ok && noResponse.ok) {
    const yesData = await yesResponse.json();
    const noData = await noResponse.json();

    const newPrices = {
      yes: parseFloat(yesData.price || '0.5'),
      no: parseFloat(noData.price || '0.5')
    };

    console.log('[fetchLivePrices] ✅ Live prices:', newPrices);
    return newPrices;
  }

  console.warn('[fetchLivePrices] ⚠️ Failed to fetch live prices');
  return null;
}

export function useMarketData({ deal, currentMarketIndex }: UseMarketDataProps) {
  const queryClient = useQueryClient();

  const marketQueryKey = [
    'market-data',
    deal?.market_slug,
    deal?.id,
  ] as const;

  const { data: marketData = null, isLoading: loading } = useQuery<PolymarketMarket | null>({
    queryKey: marketQueryKey,
    queryFn: async () => {
      if (!deal?.market_slug) {
        return buildFallbackMarket(deal) ?? null;
      }

      try {
        const market = await getMarketBySlug(deal.market_slug);
        if (market) return market;
        return buildFallbackMarket(deal) ?? null;
      } catch (error) {
        console.error('[useMarketData] Failed to fetch market data:', error);
        return buildFallbackMarket(deal) ?? null;
      }
    },
  });

  // Serialize token IDs to a stable string to avoid re-fetch loops from new array references
  const tokenIdKey = JSON.stringify(getTokenIds(deal, marketData) ?? []);
  const livePricesQueryKey = ['live-prices', tokenIdKey, currentMarketIndex] as const;

  const { data: livePrices = null, isLoading: pricesLoading, refetch: refetchLivePrices } = useQuery<{ yes: number; no: number } | null>({
    queryKey: livePricesQueryKey,
    queryFn: async () => {
      const tokenIds = getTokenIds(deal, marketData);
      if (!tokenIds || tokenIds.length < 2) {
        console.warn('[fetchLivePrices] No token IDs available');
        return null;
      }
      return fetchLivePricesFromApi(tokenIds);
    },
  });

  const fetchLivePrices = useCallback(async () => {
    await refetchLivePrices();
  }, [refetchLivePrices]);

  const setMarketData = useCallback(
    (value: PolymarketMarket | null | ((prev: PolymarketMarket | null) => PolymarketMarket | null)) => {
      queryClient.setQueryData<PolymarketMarket | null>(marketQueryKey, (old) => {
        if (typeof value === 'function') return value(old ?? null);
        return value;
      });
    },
    [queryClient, marketQueryKey]
  );

  const setLivePrices = useCallback(
    (value: { yes: number; no: number } | null | ((prev: { yes: number; no: number } | null) => { yes: number; no: number } | null)) => {
      queryClient.setQueryData<{ yes: number; no: number } | null>(livePricesQueryKey, (old) => {
        if (typeof value === 'function') return value(old ?? null);
        return value;
      });
    },
    [queryClient, livePricesQueryKey]
  );

  return {
    marketData,
    loading,
    livePrices,
    pricesLoading,
    fetchLivePrices,
    setMarketData,
    setLivePrices
  };
}
