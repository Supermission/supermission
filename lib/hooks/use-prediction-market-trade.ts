// use-prediction-market-trade.ts - Wrapper hook for prediction market trades
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useTradeExecution } from './use-trade-execution';
import { useApprovalLimit } from './use-approval-limit';

interface SelectedTrade {
  outcome: string;
  tokenId: string;
  price: number;
  question: string;
  side: 'BUY' | 'SELL';
  marketId?: string;
  endDate?: string;
  marketSlug?: string;
}

export function usePredictionMarketTrade() {
  const tradeExecution = useTradeExecution();
  const { maxApproval } = useApprovalLimit();

  // Trade modal state
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<SelectedTrade | null>(null);

  // Open modal and set selected trade
  const handleTradeClick = useCallback((
    outcome: string,
    tokenId: string,
    price: number,
    question: string,
    side: 'BUY' | 'SELL' = 'BUY',
    marketId?: string,
    endDate?: string,
    marketSlug?: string
  ) => {
    console.log('[usePredictionMarketTrade] Trade clicked:', { outcome, tokenId, price, side, marketId, endDate });
    setSelectedTrade({ outcome, tokenId, price, question, side, marketId, endDate, marketSlug });
    setIsTradeModalOpen(true);
  }, []);

  // Execute trade after user confirms amount
  const handleConfirmTrade = useCallback(async (amount: string) => {
    if (!selectedTrade) {
      toast.error('No trade selected');
      return;
    }

    console.log('[usePredictionMarketTrade] Confirming trade:', { amount, selectedTrade });

    // Only BUY trades go through tradeExecution
    // SELL trades should use usePolymarketClob directly
    if (selectedTrade.side === 'BUY') {
      await tradeExecution.executeTrade({
        tokenId: selectedTrade.tokenId,
        price: selectedTrade.price,
        size: amount,
        side: 'BUY',
        outcome: selectedTrade.outcome,
        question: selectedTrade.question,
        marketId: selectedTrade.marketId,
        endDate: selectedTrade.endDate,
        marketSlug: selectedTrade.marketSlug,
        maxApprovalUsdc: maxApproval,
      });
    } else {
      toast.error('SELL orders should use the Markets terminal');
    }
  }, [selectedTrade, tradeExecution]);

  // Reset everything
  const resetTrade = useCallback(() => {
    tradeExecution.reset();
    setIsTradeModalOpen(false);
    setSelectedTrade(null);
  }, [tradeExecution]);

  return {
    // Modal state
    isTradeModalOpen,
    setIsTradeModalOpen,
    selectedTrade,
    setSelectedTrade,

    // Actions
    handleTradeClick,
    handleConfirmTrade,
    reset: resetTrade,

    // Trade execution state
    progress: tradeExecution.progress,
    isTransferring: tradeExecution.isExecuting,
    isProcessing: tradeExecution.isExecuting,
  };
}