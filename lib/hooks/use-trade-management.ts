import { useState, useCallback } from 'react';
import { getTokenIdForOutcome } from '@/lib/new-agents/polymarketAgent/markets';
import type { PolymarketMarket } from '@/lib/new-agents/polymarketAgent/markets';
import { toast } from 'sonner';

interface TradeDeal {
  clobTokenIds?: string | string[];
  clob_token_ids?: string | string[];
  current_yes_price?: number;
  current_no_price?: number;
  market_question?: string;
  question?: string;
}

interface UseTradeManagementProps {
  deal: TradeDeal | null | undefined;
  marketData: PolymarketMarket | null;
  livePrices: { yes: number; no: number } | null;
  onTrade?: (outcome: string, tokenId: string, price: number, question: string, side: 'BUY' | 'SELL') => void;
  initialUserPosition?: string | null;
  onPositionChange?: (position: string | null) => void;
}

export function useTradeManagement({
  deal,
  marketData,
  livePrices,
  onTrade,
  initialUserPosition,
  onPositionChange
}: UseTradeManagementProps) {
  const [showTradeInterface, setShowTradeInterface] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userPosition, setUserPosition] = useState<string | null>(initialUserPosition || null);

  const handleTrade = useCallback(async (outcome: string, action: 'BUY' | 'SELL' = 'BUY') => {
    try {
      if (showTradeInterface && selectedOutcome === outcome && tradeAction === action) {
        setShowTradeInterface(false);
        setSelectedOutcome(null);
        setTradeAction('BUY');
        setAmount('');
        return;
      }

      let tokenId = '';
      
      if (marketData) {
        tokenId = getTokenIdForOutcome(marketData, outcome);
      } else if (deal?.clobTokenIds || deal?.clob_token_ids) {
        try {
          const tokenIds = deal.clobTokenIds || deal.clob_token_ids;
          const parsedTokenIds = typeof tokenIds === 'string' ? JSON.parse(tokenIds) : tokenIds;
          if (Array.isArray(parsedTokenIds)) {
            const outcomeIdx = outcome.toLowerCase() === 'no' ? 1 : 0;
            tokenId = parsedTokenIds[outcomeIdx] || parsedTokenIds[0] || '';
          }
        } catch (parseError) {
          console.error('[handleTrade] Error parsing tokenIds:', parseError);
        }
      }

      let freshPrice = outcome === 'YES'
        ? (livePrices?.yes ?? deal?.current_yes_price ?? 0.5)
        : (livePrices?.no ?? deal?.current_no_price ?? 0.5);

      if (tokenId) {
        try {
          console.log('[handleTrade] 🔄 Fetching fresh price for:', { outcome, tokenId });
          const side = action.toLowerCase();
          const priceResponse = await fetch(
            `/api/proxy/polymarket?api=clob&path=/price&token_id=${encodeURIComponent(tokenId)}&side=${side}`
          );

          const priceData = await priceResponse.json().catch(() => ({}));
          if (priceResponse.ok) {
            freshPrice = parseFloat(priceData.price || freshPrice);
            console.log('[handleTrade] ✅ Fresh price:', freshPrice);
          } else {
            if (priceData?.error?.includes('does not exist') || priceResponse.status === 404) {
              toast.error('This market is no longer active on Polymarket');
              return;
            }
            console.warn('[handleTrade] ⚠️ Failed to fetch fresh price, using cached');
          }
        } catch (priceError) {
          console.error('[handleTrade] ❌ Error fetching price:', priceError);
          toast.warning('Using cached price - current market price may differ');
        }
      }

      setSelectedOutcome(outcome);
      setTradeAction(action);
      setShowTradeInterface(true);

      if (onTrade) {
        onTrade(outcome, tokenId, freshPrice, deal?.market_question || deal?.question || 'Prediction Market', action);
      }
    } catch (error) {
      console.error('[handleTrade] Error:', error);
    }
  }, [showTradeInterface, selectedOutcome, tradeAction, marketData, deal, livePrices, onTrade]);

  const handleCloseTrade = useCallback((tradeCompleted: boolean = false) => {
    if (tradeCompleted && selectedOutcome && tradeAction === 'BUY') {
      setUserPosition(selectedOutcome);
      onPositionChange?.(selectedOutcome);
    } else if (tradeCompleted && selectedOutcome && tradeAction === 'SELL') {
      setUserPosition(null);
      onPositionChange?.(null);
    }

    setShowTradeInterface(false);
    setSelectedOutcome(null);
    setTradeAction('BUY');
    setAmount('');
  }, [selectedOutcome, tradeAction, onPositionChange]);

  return {
    showTradeInterface,
    selectedOutcome,
    tradeAction,
    amount,
    isSubmitting,
    userPosition,
    setAmount,
    setIsSubmitting,
    setUserPosition,
    handleTrade,
    handleCloseTrade
  };
}