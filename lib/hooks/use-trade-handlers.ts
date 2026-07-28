'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { useUIStore } from '@/lib/store/ui';
import { WORKER_API } from '@/lib/config/worker';

/**
 * Resolve a price for a market when SSE hasn't streamed it yet.
 * 1) Poll the SSE ref for a short window — covers in-flight prime/connection.
 * 2) Fall back to a REST fetch of the worker's market endpoint, which returns
 *    `outcome_prices` populated from the same live cache.
 * Writes any resolved price back into gridPricesRef so downstream code reads it.
 */
async function resolveLivePrice(
  conditionId: string,
  ref: React.MutableRefObject<Record<string, LivePrices>>,
): Promise<LivePrices | null> {
  const POLL_MS = 100;
  const POLL_BUDGET_MS = 1500;
  const start = Date.now();
  while (Date.now() - start < POLL_BUDGET_MS) {
    const cached = ref.current[conditionId];
    if (cached && (cached.yes || cached.no)) return cached;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  try {
    const res = await fetch(`${WORKER_API}/v1/markets?ids=${encodeURIComponent(conditionId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const market = data?.markets?.[0];
    const prices = market?.outcome_prices;
    if (!Array.isArray(prices) || prices.length < 2) return null;
    const yes = Number(prices[0]);
    const no = Number(prices[1]);
    if (!yes && !no) return null;
    const resolved: LivePrices = { yes, no };
    ref.current = { ...ref.current, [conditionId]: resolved };
    return resolved;
  } catch {
    return null;
  }
}

interface ExecuteTradeParams {
  tokenId: string;
  price: number;
  size: string;
  side: 'BUY';
  outcome: string;
  question: string;
  marketId: string;
  endDate: string | undefined;
  marketSlug: string | undefined;
}

interface ExecuteSellParams {
  tokenId: string;
  size: number;
  outcome: string;
  question: string;
  marketId: string;
  negativeRisk: boolean;
}

interface ExecuteRedeemParams {
  conditionId: string;
  tokenId: string | undefined;
  negativeRisk: boolean;
  proxyWallet: string | undefined;
  shares: number;
  outcome: string;
}

interface SellablePosition {
  conditionId: string;
  asset: string;
  size: number;
  outcome: string;
  title: string;
  negativeRisk?: boolean;
  bidPrice?: number;
  curPrice?: number;
}

interface RedeemablePosition {
  conditionId: string;
  asset?: string;
  size?: number;
  outcome: string;
  negativeRisk?: boolean;
  proxyWallet?: string;
}

/** Shape of the response from executeTrade/executeSell (PostOrderResponse) */
interface FillResponse {
  averagePrice?: string;
  price?: string;
  filledSize?: string;
}

interface TradeExecutionFns {
  executeTrade: (params: ExecuteTradeParams) => Promise<unknown>;
  executeSell: (params: ExecuteSellParams) => Promise<unknown>;
  executeRedeem: (params: ExecuteRedeemParams) => Promise<unknown>;
  isExecuting: boolean;
}

interface PortfolioHooks {
  refetch: (addr: string) => Promise<void>;
  refreshHistory: () => void;
}

interface UseTradeHandlersParams {
  address: string | undefined;
  tradeExecution: TradeExecutionFns;
  markets: MarketCatalogItem[];
  watchlistMarkets: MarketCatalogItem[];
  gridPricesRef: React.MutableRefObject<Record<string, LivePrices>>;
  portfolioHooksRef: React.MutableRefObject<PortfolioHooks | null>;
}

// Shared AudioContext so sounds work even after async operations
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume();
  }
  return _audioCtx;
}

function playTradeSound(isBuy: boolean) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    if (isBuy) {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.15);
    }
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

function playRedeemSound() {
  try {
    const ctx = getAudioCtx();
    // Two-tone chime for redeem
    [0, 0.12].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 523 : 784, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {
    // Audio not available
  }
}

export function useTradeHandlers({
  address,
  tradeExecution,
  markets,
  watchlistMarkets,
  gridPricesRef,
  portfolioHooksRef,
}: UseTradeHandlersParams) {
  const { executeTrade, executeSell, executeRedeem, isExecuting } = tradeExecution;

  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);
  const [sellingPosition, setSellingPosition] = useState<string | null>(null);
  const [redeemingPosition, setRedeemingPosition] = useState<string | null>(null);

  // Lazy reconciliation: refetch when user switches to the portfolio tab,
  // or after a short delay if already on the portfolio tab (sell/redeem case)
  const needsReconciliation = useRef(false);
  const marketTab = useUIStore((s) => s.marketTab);

  useEffect(() => {
    if (marketTab === 'portfolio' && needsReconciliation.current && address) {
      needsReconciliation.current = false;
      portfolioHooksRef.current?.refetch(address);
      portfolioHooksRef.current?.refreshHistory();
    }
  }, [marketTab, address, portfolioHooksRef]);

  /** Schedule reconciliation — if already on portfolio tab, refetch after a short delay */
  const scheduleReconciliation = useCallback(() => {
    if (useUIStore.getState().marketTab === 'portfolio' && address) {
      // Already viewing portfolio — reconcile after 1s (data comes from our own Supabase)
      setTimeout(() => {
        portfolioHooksRef.current?.refetch(address);
        portfolioHooksRef.current?.refreshHistory();
      }, 1_000);
    } else {
      // Not on portfolio tab — will reconcile lazily when user switches
      needsReconciliation.current = true;
    }
  }, [address, portfolioHooksRef]);

  const handleTrade = useCallback(async (params: {
    conditionId: string;
    tokenId: string;
    side: 'BUY';
    outcome: string;
    amount: number;
  }) => {
    if (!address) { toast.error('Connect wallet to trade'); return; }
    if (isExecuting) { toast.error('Trade already in progress'); return; }

    const market = [...markets, ...watchlistMarkets].find(m => m.condition_id === params.conditionId);
    let ssePrice = gridPricesRef.current[params.conditionId];

    // We still need ssePrice to know which side of the book to quote — the
    // execution-time freshness check (executeTrade) is what actually catches
    // staleness; here we just need a starting price. If SSE hasn't streamed
    // this market yet (e.g. user clicked before subscription primed), wait
    // briefly and then fall back to a REST fetch from the worker.
    if (!ssePrice) {
      const resolved = await resolveLivePrice(params.conditionId, gridPricesRef);
      if (!resolved) {
        toast.error('Price unavailable — try again in a moment', {
          action: { label: 'Retry', onClick: () => { handleTrade(params); } },
        });
        return;
      }
      ssePrice = resolved;
    }

    // Find the outcome's index in the market's outcomes array to get the correct price.
    // outcomes: ["Chennai Super Kings", "Punjab Kings"], outcome_prices: [0.46, 0.55]
    // SSE yes/no maps to index 0/1.
    const outcomeIndex = market?.outcomes?.findIndex(
      (o: string) => o.toLowerCase() === params.outcome.toLowerCase()
    ) ?? -1;
    // Defensive: without this, a mismatched outcome falls through to the
    // YES-side ternary and buys the wrong token at the wrong price.
    if (outcomeIndex === -1) {
      toast.error('Outcome not found on this market');
      return;
    }
    const price = outcomeIndex === 1 ? ssePrice.no : ssePrice.yes;

    if (!price) {
      toast.error('Price unavailable — try again in a moment', {
        action: { label: 'Retry', onClick: () => { handleTrade(params); } },
      });
      return;
    }

    setActiveTradeId(`${params.conditionId}:${params.outcome}`);
    const toastId = toast.loading(`Buying ${params.outcome.toUpperCase()} for $${params.amount}...`);

    let success = false;
    let errorMsg = '';
    let fillResponse: FillResponse | undefined;

    try {
      const result = await Promise.race([
        executeTrade({
          tokenId: params.tokenId,
          price,
          size: String(params.amount),
          side: 'BUY',
          outcome: params.outcome,
          question: market?.question || 'Prediction Market',
          marketId: params.conditionId,
          endDate: market?.end_date || undefined,
          marketSlug: market?.slug || undefined,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Trade timed out. Please try again.')), 120_000)
        ),
      ]);
      fillResponse = (result as { response?: FillResponse })?.response as FillResponse | undefined;
      success = true;
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : 'Trade failed';
      console.error('[handleTrade] caught:', errorMsg);
    }

    toast.dismiss(toastId);

    if (success) {
      playTradeSound(true);
      toast.success(`Bought ${params.outcome.toUpperCase()}!`);

      // Use actual fill data from CLOB response when available, fall back to estimates
      const fillPrice = Number(fillResponse?.averagePrice) || Number(fillResponse?.price) || price;
      const fillShares = Number(fillResponse?.filledSize) || (fillPrice > 0 ? params.amount / fillPrice : 0);
      const fillAmount = fillShares * fillPrice;

      // Dispatch trade-completed with detail so PortfolioView can add optimistic entry
      window.dispatchEvent(new CustomEvent('trade-completed', {
        detail: {
          side: 'BUY',
          conditionId: params.conditionId,
          tokenId: params.tokenId,
          outcome: params.outcome,
          shares: fillShares,
          price: fillPrice,
          amount: fillAmount,
          question: market?.question || '',
          slug: market?.slug || '',
          eventId: market?.event_id || '',
          endDate: market?.end_date || '',
          outcomeIndex: market?.clob_token_ids?.indexOf(params.tokenId) ?? (params.outcome.toUpperCase() === 'YES' ? 0 : 1),
          oppositeOutcome: (() => {
            const tokenIdx = market?.clob_token_ids?.indexOf(params.tokenId) ?? -1;
            if (tokenIdx !== -1 && market?.outcomes) {
              const oppositeIdx = tokenIdx === 0 ? 1 : 0;
              return market.outcomes[oppositeIdx] || 'No';
            }
            return params.outcome.toUpperCase() === 'YES' ? 'No' : 'Yes';
          })(),
        },
      }));

      scheduleReconciliation();
    } else {
      if (errorMsg.includes('Insufficient USDC') || errorMsg.includes('Insufficient balance')) {
        toast.error(errorMsg + ' Deposit USDC to your wallet to trade.', { duration: 4000 });
      } else if (errorMsg.startsWith('Price moved from ')) {
        toast.error(errorMsg, { duration: 4000 });
      } else {
        toast.error(`Trade failed: ${errorMsg}`, { duration: 4000 });
      }
    }

    setActiveTradeId(null);
  }, [address, markets, watchlistMarkets, executeTrade, isExecuting, gridPricesRef, portfolioHooksRef]);

  const handleSellPosition = useCallback(async (position: SellablePosition) => {
    if (!address) { toast.error('Connect wallet to sell'); return; }
    if (isExecuting || sellingPosition) { toast.error('Trade already in progress'); return; }

    // No SSE-freshness guard here: sells don't pass a price to the CLOB —
    // executeSell fetches the live best bid via REST (checkSellLiquidity) at
    // execution time and surfaces NO_LIQUIDITY / LOW_LIQUIDITY when the book
    // is dead. Guarding on SSE would lock users out of closed/resolving
    // markets whose ticks have stopped but whose position still needs exit.
    const ssePrice = gridPricesRef.current[position.conditionId];

    setSellingPosition(position.conditionId);
    const toastId = toast.loading(`Selling ${position.outcome.toUpperCase()} position...`);

    let success = false;
    let errorMsg = '';
    let fillResponse: FillResponse | undefined;

    try {
      const result = await Promise.race([
        executeSell({
          tokenId: position.asset,
          size: position.size,
          outcome: position.outcome,
          question: position.title,
          marketId: position.conditionId,
          negativeRisk: position.negativeRisk ?? false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Sell timed out. Please try again.')), 120_000)
        ),
      ]);
      fillResponse = result as FillResponse | undefined;
      success = true;
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : 'Sell failed';
      errorMsg = errorMsg.replace(/^(NO_LIQUIDITY|LOW_LIQUIDITY): /, '');
      console.error('[handleSellPosition] caught:', errorMsg);
    }

    toast.dismiss(toastId);

    if (success) {
      playTradeSound(false);
      toast.success(`Sold ${position.outcome.toUpperCase()} position!`);

      // Use actual fill data from CLOB response when available
      const sellMarket = [...markets, ...watchlistMarkets].find(m => m.condition_id === position.conditionId);
      const sellOutcomeIndex = sellMarket?.outcomes?.findIndex(
        (o: string) => o.toLowerCase() === position.outcome.toLowerCase()
      ) ?? -1;
      const sseFallback = sellOutcomeIndex === 1
        ? (ssePrice?.no ?? 0)
        : (ssePrice?.yes ?? 0);
      const fallbackPrice = position.bidPrice || position.curPrice || sseFallback;
      const fillPrice = Number(fillResponse?.averagePrice) || Number(fillResponse?.price) || fallbackPrice;
      const fillShares = Number(fillResponse?.filledSize) || position.size;
      const fillAmount = fillShares * fillPrice;

      // Dispatch trade-completed with detail so PortfolioView can optimistically hide position
      window.dispatchEvent(new CustomEvent('trade-completed', {
        detail: {
          side: 'SELL',
          conditionId: position.conditionId,
          tokenId: position.asset,
          outcome: position.outcome,
          amount: fillAmount,
          price: fillPrice,
          shares: fillShares,
          question: position.title,
        },
      }));

      scheduleReconciliation();
    } else {
      toast.error(errorMsg, { duration: 4000 });
    }

    setSellingPosition(null);
  }, [address, executeSell, isExecuting, sellingPosition, portfolioHooksRef, gridPricesRef, markets, watchlistMarkets]);

  const handleRedeemPosition = useCallback(async (position: RedeemablePosition) => {
    if (!address) { toast.error('Connect wallet to redeem'); return; }
    if (isExecuting || redeemingPosition) { toast.error('Trade already in progress'); return; }

    setRedeemingPosition(position.conditionId);
    const toastId = toast.loading(`Redeeming ${position.outcome.toUpperCase()} position...`);

    let success = false;
    let errorMsg = '';
    let redeemResult: { txHash: string; actualPayout: number } | undefined;

    try {
      redeemResult = await (Promise.race([
        executeRedeem({
          conditionId: position.conditionId,
          tokenId: position.asset || undefined,
          negativeRisk: position.negativeRisk ?? false,
          proxyWallet: position.proxyWallet || undefined,
          shares: position.size || 0,
          outcome: position.outcome || 'Unknown',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redeem timed out. Please try again.')), 120_000)
        ),
      ]) as Promise<{ txHash: string; actualPayout: number }>);
      success = true;
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : 'Redeem failed';
      if (errorMsg.includes('SafeMath') || errorMsg.includes('subtraction overflow')) {
        errorMsg = 'This position may have already been redeemed. Try refreshing your portfolio.';
      }
      console.error('[handleRedeemPosition] caught:', errorMsg);
    }

    toast.dismiss(toastId);

    if (success) {
      const payout = redeemResult?.actualPayout ?? 0;
      const shares = position.size || 0;
      const payoutStr = payout > 0 ? `$${payout.toFixed(2)}` : 'verifying payout...';
      playRedeemSound();
      toast.success(`Redeemed ${position.outcome.toUpperCase()} position: ${payoutStr}`);

      // Dispatch as SELL so PortfolioView hides the position optimistically
      window.dispatchEvent(new CustomEvent('trade-completed', {
        detail: {
          side: 'SELL',
          conditionId: position.conditionId,
          tokenId: position.asset || '',
          outcome: position.outcome,
          amount: payout,
          price: shares > 0 ? payout / shares : 0,
          shares,
          question: '',
        },
      }));

      scheduleReconciliation();
    } else {
      toast.error(`Redeem failed: ${errorMsg}`, { duration: 4000 });
    }

    setRedeemingPosition(null);
  }, [address, executeRedeem, isExecuting, redeemingPosition, portfolioHooksRef]);

  return {
    handleTrade,
    handleSellPosition,
    handleRedeemPosition,
    activeTradeId,
    sellingPosition,
    redeemingPosition,
  };
}
