'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { useMarket } from '@/lib/hooks/use-market';
import { useSSEPrices } from '@/lib/hooks/use-sse-prices';
import { useEmbeddedAddress } from '@/lib/hooks/use-embedded-address';
import { useWatchlist } from '@/lib/hooks/use-watchlist';
import { useTradeExecution } from '@/lib/hooks/use-trade-execution';
import { useTradeHandlers } from '@/lib/hooks/use-trade-handlers';
import { usePolymarketPositions } from '@/lib/hooks/dashboard/usePolymarketPositions';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';
import { WORKER_API } from '@/lib/config/worker';
import type { MarketCatalogItem, LivePrices } from '@/lib/types/market';
import { getMarketAssetTag, getMarketTimeframeTag, ASSET_TAG_STYLES, TIMEFRAME_TAG_STYLE } from '@/lib/types/market';

import { PriceChart } from '@/components/markets/PriceChart';
import { SignalPanel } from '@/components/markets/SignalPanel';
import OrderBookLadder from '@/components/markets/OrderBookLadder';
import SpreadIndicator from '@/components/markets/SpreadIndicator';
import LimitOrderForm from '@/components/markets/LimitOrderForm';
import OpenOrdersPanel from '@/components/markets/OpenOrdersPanel';
import TopHoldersPanel from '@/components/markets/TopHoldersPanel';
import { PolymarketAvailable } from '@/components/markets/PolymarketAvailable';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";

/* ─── formatters ─── */
function formatVolume(v: number | undefined | null): string {
  if (v == null) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatTimeLeft(endDate: string | null): string {
  if (!endDate) return '--';
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

/* ─── inline icons (functional buttons only) ─── */
function BookmarkIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return filled ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 3a2 2 0 00-2 2v16l9-4 9 4V5a2 2 0 00-2-2H5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BackArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className || ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
    </svg>
  );
}

/* ─── section heading ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
      {children}
    </span>
  );
}

export default function MarketDetailClient() {
  const params = useParams<{ conditionId: string }>();
  const router = useRouter();
  const conditionId = params?.conditionId;

  const address = useEmbeddedAddress();
  const { data: market, isLoading, isError } = useMarket(conditionId);

  // Live YES/NO ticks + connection health for the status dot
  const sseIds = useMemo(() => (conditionId ? [conditionId] : []), [conditionId]);
  const { prices: ssePrices, isConnected } = useSSEPrices(sseIds);
  const sseLive = conditionId ? ssePrices[conditionId] : undefined;

  // Trade wiring — self-contained hooks instantiated on the page
  const gridPricesRef = useRef<Record<string, LivePrices>>({});
  const portfolioHooksRef = useRef<{ refetch: (addr: string) => Promise<void>; refreshHistory: () => void } | null>(null);
  const tradeExecution = useTradeExecution();
  const marketsForTrade = useMemo(() => (market ? [market] : []), [market]);
  const emptyMarkets = useMemo<MarketCatalogItem[]>(() => [], []);
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
    markets: marketsForTrade,
    watchlistMarkets: emptyMarkets,
    gridPricesRef,
    portfolioHooksRef,
  });

  // Feed live SSE prices into the ref that handleTrade reads for quoting
  useEffect(() => {
    if (conditionId && sseLive) {
      gridPricesRef.current = { ...gridPricesRef.current, [conditionId]: sseLive };
    }
  }, [conditionId, sseLive]);

  // Watchlist
  const { watchlist, toggle: rawToggle } = useWatchlist(address);
  const isWatched = conditionId ? watchlist.has(conditionId) : false;
  const toggleWatch = useCallback(() => {
    if (!conditionId) return;
    if (!address) { toast.error('Connect wallet to bookmark'); return; }
    rawToggle(conditionId);
  }, [conditionId, address, rawToggle]);

  // User position on this market (+ P&L)
  const { positions, refetch: refetchPositions, addOptimisticBuy, markSold } = usePolymarketPositions();
  useEffect(() => {
    portfolioHooksRef.current = {
      refetch: (addr: string) => refetchPositions(addr),
      refreshHistory: () => {},
    };
  }, [refetchPositions]);
  useEffect(() => { if (address) refetchPositions(address); }, [address, refetchPositions]);

  // Instant reflection of trades on THIS market, then an authoritative reconcile.
  //
  // On a confirmed fill, handleTrade (use-trade-handlers) dispatches
  // 'trade-completed'. We (a) optimistically update the on-page position via the
  // SAME three-layer usePolymarketPositions store the portfolio uses, then
  // (b) reconcile against the Polymarket Data API — which lags the CLOB fill by
  // a few seconds — with a small, bounded backoff poll.
  //
  // Why this is race-free: the optimistic layer lives in separate state and is
  // merged on top of API data; the hook auto-cleans an optimistic entry ONLY
  // once the API actually reflects the fill. So a stale refetch (API not caught
  // up yet) cannot wipe the instant update, and a real fill self-corrects to
  // exact numbers. Failed/partial-miss trades never dispatch 'trade-completed'
  // (handleTrade only fires it on success), so there is nothing to roll back.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const onTradeDone = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        side?: 'BUY' | 'SELL'; conditionId?: string; tokenId?: string; outcome?: string;
        shares?: number; price?: number; amount?: number; question?: string; slug?: string;
        eventId?: string; endDate?: string; outcomeIndex?: number; oppositeOutcome?: string;
      } | undefined;
      // Only react to trades on the market this page is showing.
      if (!detail?.conditionId || detail.conditionId !== conditionId) return;

      if (detail.side === 'BUY' && detail.tokenId) {
        // Optimistic position — appears instantly in "Your position".
        addOptimisticBuy({
          proxyWallet: address,
          asset: detail.tokenId,
          conditionId: detail.conditionId,
          size: detail.shares || 0,
          avgPrice: detail.price || 0,
          initialValue: detail.amount || 0,
          currentValue: detail.amount || 0,
          cashPnl: 0,
          percentPnl: 0,
          totalBought: detail.amount || 0,
          realizedPnl: 0,
          percentRealizedPnl: 0,
          curPrice: detail.price || 0,
          bidPrice: detail.price || 0,
          redeemable: false,
          mergeable: false,
          title: detail.question || market?.question || '',
          slug: detail.slug || market?.slug || '',
          icon: market?.icon || '',
          eventId: detail.eventId || market?.event_id || '',
          eventSlug: market?.event_slug || '',
          outcome: detail.outcome || 'Yes',
          outcomeIndex: detail.outcomeIndex ?? (detail.outcome?.toLowerCase() === 'no' ? 1 : 0),
          oppositeOutcome: detail.oppositeOutcome ?? (detail.outcome?.toLowerCase() === 'no' ? 'Yes' : 'No'),
          oppositeAsset: '',
          endDate: detail.endDate || market?.end_date || '',
          negativeRisk: false,
        });
      } else if (detail.side === 'SELL') {
        // Hide the position instantly; reconcile confirms it's gone.
        markSold(detail.conditionId);
      }

      // Authoritative reconcile — bounded backoff around the Data API settle lag.
      // Cheap (React Query dedupes) and self-terminating: once the API reflects
      // the fill, the optimistic entry auto-cleans and later refetches are no-ops.
      [1200, 3000, 6000].forEach((ms) => {
        timers.push(setTimeout(() => { if (!cancelled) refetchPositions(address); }, ms));
      });
    };

    window.addEventListener('trade-completed', onTradeDone);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('trade-completed', onTradeDone);
    };
  }, [
    address, conditionId, addOptimisticBuy, markSold, refetchPositions,
    market?.question, market?.slug, market?.icon, market?.event_id, market?.event_slug, market?.end_date,
  ]);

  const myPositions = useMemo(
    () => positions.filter(p => p.conditionId === conditionId && p.size > 0),
    [positions, conditionId],
  );

  // On-chain settlement tx hash per position asset, for the "view transaction"
  // link. CLOB buys/sells produce NO user-signed tx — our own trade records only
  // store the CLOB order id — so the authoritative per-fill hash comes from
  // Polymarket's activity feed (/trades → transactionHash). Keyed by asset
  // (clob token id), so it's immune to cross-market contamination even if the
  // upstream `market` filter is ignored. No hash found → no link (never faked).
  const [fillTxByAsset, setFillTxByAsset] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!address || !conditionId) return;
    let cancelled = false;
    const controller = new AbortController();

    const loadFills = async () => {
      try {
        const res = await fetch(
          `/api/proxy/polymarket?api=data&path=/trades&user=${encodeURIComponent(address)}&market=${encodeURIComponent(conditionId)}&limit=100`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        // Data API returns newest-first; keep the most recent fill per asset.
        const map: Record<string, string> = {};
        for (const t of data) {
          const asset: string = t.asset || t.asset_id || '';
          const hash: string = t.transactionHash || '';
          if (asset && hash && !map[asset]) map[asset] = hash;
        }
        if (!cancelled) setFillTxByAsset(map);
      } catch { /* non-critical — link simply won't render */ }
    };

    loadFills();
    // Re-pull after a settlement window so a just-made fill's hash appears.
    const onTradeDone = (e: Event) => {
      const cid = (e as CustomEvent).detail?.conditionId;
      if (cid === conditionId) setTimeout(loadFills, 6000);
    };
    window.addEventListener('trade-completed', onTradeDone);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener('trade-completed', onTradeDone);
    };
  }, [address, conditionId]);

  // Related markets by event_id
  const [relatedMarkets, setRelatedMarkets] = useState<MarketCatalogItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  useEffect(() => {
    if (!market?.event_id) { setRelatedMarkets([]); return; }
    const controller = new AbortController();
    setRelatedLoading(true);
    fetch(`${WORKER_API}/v1/events/${market.event_id}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        const all: MarketCatalogItem[] = data.localMarkets || [];
        setRelatedMarkets(all.filter(m => m.condition_id !== market.condition_id));
      })
      .catch(err => { if (err?.name !== 'AbortError') setRelatedMarkets([]); })
      .finally(() => setRelatedLoading(false));
    return () => controller.abort();
  }, [market?.event_id, market?.condition_id]);

  // ── Trade UI state (lifted so the rail renders once) ──
  const [tradeMode, setTradeMode] = useState<'market' | 'limit'>('market');
  const [selectedOutcome, setSelectedOutcome] = useState<'Yes' | 'No'>('Yes');
  const [amountStr, setAmountStr] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

  // Max = the user's Polymarket buying power (pUSD), floored to a whole dollar.
  const { polyPusd } = useUsdcBalances(address ?? undefined);
  const maxBuyingPower = Math.max(0, Math.floor(polyPusd || 0));

  const resetTradeSelection = useCallback(() => {
    setAmountStr('');
  }, []);

  const bumpAmount = useCallback((delta: number) => {
    setAmountStr(prev => String(Math.max(0, Math.round(((parseFloat(prev) || 0) + delta) * 100) / 100)));
  }, []);

  const handlePlace = useCallback((amount: number, outcome: 'Yes' | 'No') => {
    if (!market || !amount || amount < 1) return;
    const tokenIndex = outcome === 'Yes' ? 0 : 1;
    handleTrade({
      conditionId: market.condition_id,
      tokenId: market.clob_token_ids?.[tokenIndex] || '',
      side: 'BUY',
      outcome: market.outcomes?.[tokenIndex] || outcome,
      amount,
    });
    resetTradeSelection();
  }, [market, handleTrade, resetTradeSelection]);

  /* ── Loading / not-found ── */
  if (isLoading && !market) return <DetailSkeleton onBack={() => router.push('/markets')} />;
  if ((isError || !market) && !isLoading) return <NotFound onBack={() => router.push('/markets')} />;
  if (!market) return <DetailSkeleton onBack={() => router.push('/markets')} />;

  /* ── Derived prices (SSE live > catalog snapshot) ── */
  const hasLive = !!sseLive;
  const rawYes = hasLive ? (sseLive?.yes ?? null) : (market.outcome_prices?.[0] ?? null);
  const rawNo = hasLive ? (sseLive?.no ?? null) : (market.outcome_prices?.[1] ?? null);
  const hasPrices = rawYes !== null && rawNo !== null;
  const yesPrice = rawYes ?? 0;
  const noPrice = rawNo ?? 0;
  const yesPercent = yesPrice * 100;
  const noPercent = noPrice * 100;
  const yesPriceDisplay = yesPercent.toFixed(1);
  const noPriceDisplay = noPercent.toFixed(1);
  const outcomeLabels = market.outcomes || ['Yes', 'No'];
  const yesLabel = outcomeLabels[0] || 'Yes';
  const noLabel = outcomeLabels[1] || 'No';
  const isTradingYes = activeTradeId === `${market.condition_id}:${yesLabel}`;
  const isTradingNo = activeTradeId === `${market.condition_id}:${noLabel}`;
  const isTrading = isTradingYes || isTradingNo;
  const assetTag = getMarketAssetTag(market.question);
  const timeframeTag = getMarketTimeframeTag(market);
  const polymarketUrl = market.event_slug && market.slug && market.event_slug !== market.slug
    ? `https://polymarket.com/event/${market.event_slug}/${market.slug}`
    : `https://polymarket.com/event/${market.event_slug || market.slug}`;

  /* ── Trade rail (rendered once via grid placement) ── */
  const tradeBox = (
    <div className="rounded-[18px] border border-[#e5e7eb] bg-white overflow-hidden shadow-[0_14px_36px_0_rgba(0,0,0,0.10)]">
      {/* mode toggle */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-[12px] font-bold text-black uppercase tracking-wider">Trade</span>
        <div className="flex bg-[#f8fafc] p-0.5 rounded-[8px]">
          {(['market', 'limit'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => { setTradeMode(mode); resetTradeSelection(); }}
              className={`px-3 py-1 text-[10px] font-bold transition-all rounded-[6px] ${
                tradeMode === mode ? 'bg-black text-white' : 'text-black/35 hover:text-black/55'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {!hasPrices ? (
          <p className="py-6 text-center text-[11px] font-bold text-black/25">Trading unavailable — no price data</p>
        ) : tradeMode === 'market' ? (
          <>
            <AnimatePresence>
              {(() => {
                const isY = selectedOutcome === 'Yes';
                const price = isY ? yesPrice : noPrice;
                const priceDisp = isY ? yesPriceDisplay : noPriceDisplay;
                const label = isY ? yesLabel : noLabel;
                const amt = parseFloat(amountStr) || 0;
                const shares = price > 0 ? amt / price : 0;
                const toWin = shares;                 // $1 payout per share if correct
                const profit = toWin - amt;
                const canPlace = amt >= 1;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  >
                    <div className="rounded-[13px] bg-white border border-[#eef0f2] shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden">
                      {/* YES / NO toggle */}
                      <div className="flex gap-2.5 p-4 pb-0">
                        <button
                          onClick={() => setSelectedOutcome('Yes')}
                          className={`flex-1 py-4 rounded-[13px] text-[16px] font-bold transition-all duration-150 active:scale-[0.98] ${
                            isY
                              ? 'bg-emerald-500 text-white shadow-[0_6px_16px_rgba(16,185,129,0.35)]'
                              : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          <span className="flex items-center justify-center gap-2">{yesLabel}<span className={`font-mono tabular-nums ${isY ? 'text-white/75' : 'text-emerald-500/70'}`}>{yesPriceDisplay}¢</span></span>
                        </button>
                        <button
                          onClick={() => setSelectedOutcome('No')}
                          className={`flex-1 py-4 rounded-[13px] text-[16px] font-bold transition-all duration-150 active:scale-[0.98] ${
                            !isY
                              ? 'bg-rose-500 text-white shadow-[0_6px_16px_rgba(244,63,94,0.32)]'
                              : 'text-rose-500 bg-rose-50 hover:bg-rose-100'
                          }`}
                        >
                          <span className="flex items-center justify-center gap-2">{noLabel}<span className={`font-mono tabular-nums ${!isY ? 'text-white/75' : 'text-rose-400/70'}`}>{noPriceDisplay}¢</span></span>
                        </button>
                      </div>
                      <div className="p-4">
                        <div className="flex justify-end mb-3"><PolymarketAvailable /></div>
                        {/* amount */}
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-[#6b7280]" style={{ fontFamily: FONT }}>Amount</span>
                          <div className="flex items-baseline">
                            <span className="text-[20px] font-black text-black/30">$</span>
                            <input
                              type="number" inputMode="decimal" value={amountStr}
                              onChange={e => setAmountStr(e.target.value)}
                              placeholder="0" min="1"
                              className="w-[120px] text-right text-[26px] font-black font-mono tabular-nums bg-transparent focus:outline-none placeholder:text-black/15 text-black"
                            />
                          </div>
                        </div>
                        {/* steppers */}
                        <div className="flex items-center justify-end gap-1.5 mt-3 mb-4">
                          {[1, 10, 100].map(n => (
                            <button key={n} onClick={() => bumpAmount(n)}
                              className="px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-[#f4f5f7] text-black/70 hover:bg-[#e9ebee] active:scale-[0.95] transition-all">
                              +{n}
                            </button>
                          ))}
                          <button onClick={() => setAmountStr(String(maxBuyingPower))} disabled={maxBuyingPower < 1}
                            className="px-3.5 py-1.5 rounded-full text-[12px] font-bold bg-black/[0.06] text-black/80 hover:bg-black/10 active:scale-[0.95] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            Max
                          </button>
                        </div>
                        {/* to win */}
                        <div className="flex items-center justify-between py-3 border-t border-[#eef0f2] mb-3">
                          <div className="leading-tight">
                            <span className="block text-[13px] font-bold text-black" style={{ fontFamily: FONT }}>To Win</span>
                            <span className="block text-[10px] font-mono text-[#9ca3af] tabular-nums mt-0.5">Avg Price {priceDisp}¢</span>
                          </div>
                          <span className={`text-[24px] font-black font-mono tabular-nums ${isY ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {canPlace ? `$${toWin.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        {/* place */}
                        <button
                          onClick={() => handlePlace(amt, selectedOutcome)}
                          disabled={!canPlace || isTrading}
                          className={`w-full py-4 rounded-[12px] text-[15px] font-bold text-white transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 ${
                            !canPlace || isTrading ? 'bg-[#e5e7eb] !text-black/30 cursor-not-allowed'
                              : isY ? 'bg-emerald-500 hover:bg-emerald-600 shadow-[0_6px_18px_rgba(16,185,129,0.4)]'
                                    : 'bg-rose-500 hover:bg-rose-600 shadow-[0_6px_18px_rgba(244,63,94,0.35)]'
                          }`}
                        >
                          {isTrading ? (<><SpinnerIcon className="text-black/40" />Placing…</>) : canPlace ? `Place · $${amt}` : 'Enter an amount'}
                        </button>
                        {canPlace && (
                          <div className={`mt-2.5 flex items-center justify-center gap-3 rounded-[10px] py-2.5 ${isY ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                            <span className="text-[12.5px] font-mono font-bold tabular-nums text-black/70">{shares.toFixed(2)} shares</span>
                            <span className={`h-3.5 w-px ${isY ? 'bg-emerald-200' : 'bg-rose-200'}`} />
                            <span className={`text-[12.5px] font-mono font-bold tabular-nums ${isY ? 'text-emerald-600' : 'text-rose-500'}`}>+${profit.toFixed(2)} if correct</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </>
        ) : market.clob_token_ids?.[0] ? (
          <LimitOrderForm
            tokenId={market.clob_token_ids[0]}
            noTokenId={market.clob_token_ids[1]}
            conditionId={market.condition_id}
            outcomes={market.outcomes || ['Yes', 'No']}
          />
        ) : (
          <p className="text-[11px] text-[#9ca3af] text-center py-4">Limit orders unavailable for this market</p>
        )}
      </div>
    </div>
  );

  const positionBlock = myPositions.length > 0 && (
    <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
      <SectionLabel>Your position</SectionLabel>
      <div className="mt-3 space-y-2.5">
        {myPositions.map(p => {
          const up = p.cashPnl >= 0;
          const isNo = p.outcome.toLowerCase() === 'no';
          const txHash = fillTxByAsset[p.asset];
          const busy = sellingPosition === p.conditionId || redeemingPosition === p.conditionId;
          const canRedeem = p.redeemable;
          const onExit = () => {
            if (busy) return;
            if (canRedeem) {
              handleRedeemPosition({
                conditionId: p.conditionId,
                asset: p.asset || undefined,
                negativeRisk: p.negativeRisk ?? false,
                proxyWallet: p.proxyWallet || undefined,
                size: p.size,
                outcome: p.outcome,
              });
            } else {
              handleSellPosition({
                conditionId: p.conditionId,
                asset: p.asset,
                size: p.size,
                outcome: p.outcome,
                title: p.title || market.question,
                negativeRisk: p.negativeRisk ?? false,
                bidPrice: p.bidPrice,
                curPrice: p.curPrice,
              });
            }
          };
          return (
            <div key={p.asset} className="rounded-[12px] border border-[#e5e7eb] bg-[#f8fafc] p-3">
              {/* side + shares · current value */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center h-[21px] px-2 rounded-full text-[10px] font-bold uppercase tracking-wide ${isNo ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {p.outcome}
                  </span>
                  <span className="text-[13px] font-mono font-bold text-black tabular-nums">{p.size.toFixed(2)}</span>
                  <span className="text-[11px] font-medium text-[#9ca3af]">shares</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="block text-[14px] font-mono font-bold text-black tabular-nums leading-none">${p.currentValue.toFixed(2)}</span>
                  <span className="block text-[8px] font-semibold text-[#9ca3af] uppercase tracking-wider mt-1">Value</span>
                </div>
              </div>
              {/* avg cost · P&L */}
              <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono tabular-nums">
                <span className="text-[#6b7280]">Avg {(p.avgPrice * 100).toFixed(1)}¢</span>
                <span className={up ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                  {up ? '+' : ''}${p.cashPnl.toFixed(2)} · {up ? '+' : ''}{p.percentPnl.toFixed(1)}%
                </span>
              </div>
              {/* actions: exit position + view tx */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={onExit}
                  disabled={busy}
                  className={`flex-1 h-9 rounded-[10px] text-[12px] font-bold text-white transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                    busy
                      ? 'bg-[#e5e7eb] !text-black/30 cursor-not-allowed'
                      : canRedeem
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-rose-500 hover:bg-rose-600'
                  }`}
                >
                  {busy ? (<><SpinnerIcon className="text-black/40" />{canRedeem ? 'Redeeming…' : 'Selling…'}</>) : canRedeem ? 'Redeem' : 'Sell'}
                </button>
                {txHash && (
                  <a
                    href={`https://polygonscan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View transaction on Polygonscan"
                    title="View transaction on Polygonscan"
                    className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-[10px] border border-[#e5e7eb] text-black/40 hover:text-black hover:border-black/20 hover:bg-white transition-all"
                  >
                    <ExternalIcon />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const ordersBlock = (
    <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
      <OpenOrdersPanel conditionId={market.condition_id} />
    </div>
  );

  const statsBlock = (
    <div className="rounded-[16px] border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5"><SectionLabel>Market stats</SectionLabel></div>
      <div className="grid grid-cols-3 gap-px bg-[#e5e7eb] border-t border-[#e5e7eb]">
        <Stat label="Volume" value={formatVolume(market.volume)} />
        <Stat label="24h Vol" value={formatVolume(market.volume_24h)} />
        <Stat label="Liquidity" value={formatVolume(market.liquidity)} />
        <Stat label="Spread" value={`${(market.spread * 100).toFixed(2)}%`} />
        <Stat
          label="24h"
          value={`${market.price_change_24h > 0 ? '+' : ''}${(market.price_change_24h * 100).toFixed(2)}%`}
          valueColor={market.price_change_24h > 0 ? 'text-emerald-600' : market.price_change_24h < 0 ? 'text-rose-500' : 'text-black'}
        />
        <Stat label="Ends" value={formatTimeLeft(market.end_date)} />
      </div>
    </div>
  );

  const whalesBlock = (
    <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
      <TopHoldersPanel conditionId={market.condition_id} yesProbability={rawYes} />
    </div>
  );

  const rail = (
    <div className="space-y-4">
      {tradeBox}
      {statsBlock}
      {whalesBlock}
      {positionBlock}
      {ordersBlock}
    </div>
  );

  return (
    <div className="min-h-full pb-24 lg:pb-10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        {/* ── Breadcrumb / actions ── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push('/markets')}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[#9ca3af] hover:text-black transition-colors flex-shrink-0"
              style={{ fontFamily: FONT }}
            >
              <span className="flex items-center justify-center h-7 w-7 border border-[#e5e7eb] rounded-[8px] hover:border-black/20 hover:bg-[#f8fafc] transition-all">
                <BackArrow />
              </span>
              Markets
            </button>
            {market.categories?.[0] && (
              <>
                <span className="text-[#d1d5db] text-[11px]">·</span>
                <span className="text-[11px] font-semibold text-[#9ca3af] truncate" style={{ fontFamily: FONT }}>
                  {market.categories[0]}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleWatch}
              aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              className="h-8 w-8 flex items-center justify-center border border-[#e5e7eb] rounded-[8px] hover:border-black/20 hover:bg-[#f8fafc] transition-all"
            >
              <BookmarkIcon filled={isWatched} className={isWatched ? 'text-black' : 'text-black/25'} />
            </button>
            {(market.event_slug || market.slug) && (
              <a
                href={polymarketUrl} target="_blank" rel="noopener noreferrer"
                aria-label="View on Polymarket"
                className="h-8 w-8 flex items-center justify-center border border-[#e5e7eb] rounded-[8px] hover:border-black/20 hover:bg-[#f8fafc] text-black/40 hover:text-black transition-all"
              >
                <ExternalIcon />
              </a>
            )}
          </div>
        </div>

        {/* ── Split grid: everything rendered once, placed by column/row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_408px] gap-6">
          {/* HERO (order-1 / col1 row1) */}
          <section className="order-1 lg:col-start-1 lg:row-start-1 min-w-0">
            <div className="flex items-start gap-3">
              {market.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={market.icon} alt="" className="w-11 h-11 rounded-[10px] object-cover flex-shrink-0 bg-[#f8fafc] mt-0.5" />
              ) : null}
              <h1 className="text-[22px] sm:text-[26px] font-black leading-[1.2] text-black tracking-tight" style={{ fontFamily: FONT }}>
                {market.question}
              </h1>
            </div>

            {/* tags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {market.categories?.map(cat => (
                <span key={cat} className="text-[9px] font-semibold text-[#9ca3af] bg-[#f8fafc] px-2 py-[3px] rounded-md">{cat}</span>
              ))}
              {assetTag && (
                <span className={`text-[9px] font-semibold px-2 py-[3px] rounded-md ${ASSET_TAG_STYLES[assetTag] || 'text-[#9ca3af] bg-[#f8fafc]'}`}>{assetTag}</span>
              )}
              {timeframeTag && (
                <span className={`text-[9px] font-semibold px-2 py-[3px] rounded-md ${TIMEFRAME_TAG_STYLE}`}>{timeframeTag}</span>
              )}
              {market.is_trending && (
                <span className="text-[9px] font-semibold text-orange-600/80 bg-orange-50 px-2 py-[3px] rounded-md">Trending</span>
              )}
            </div>

            {market.description && (
              <p
                onClick={() => setDescExpanded(v => !v)}
                className={`mt-3 text-[13px] text-[#9ca3af] leading-relaxed cursor-pointer ${descExpanded ? '' : 'line-clamp-2'}`}
              >
                {market.description}
              </p>
            )}

            {/* live prob + chart */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Live probability */}
              <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4 flex flex-col">
                <div className="flex items-center gap-1.5 mb-4">
                  <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-[#d1d5db]'}`} />
                  <SectionLabel>{hasLive ? 'Live probability' : 'Last known'}</SectionLabel>
                </div>
                {hasPrices ? (
                  <>
                    <div className="grid grid-cols-2 gap-0">
                      <div className="pr-4 border-r border-[#e5e7eb]">
                        <span className="block text-[9px] font-bold text-emerald-600/50 mb-1">{yesLabel}</span>
                        <span className="text-[30px] font-mono font-black text-emerald-600 leading-none tabular-nums">
                          {yesPriceDisplay}<span className="text-[15px] font-bold text-emerald-500/50">¢</span>
                        </span>
                      </div>
                      <div className="pl-4">
                        <span className="block text-[9px] font-bold text-rose-500/50 mb-1">{noLabel}</span>
                        <span className="text-[30px] font-mono font-black text-rose-500 leading-none tabular-nums">
                          {noPriceDisplay}<span className="text-[15px] font-bold text-rose-400/50">¢</span>
                        </span>
                      </div>
                    </div>
                    <div className="mt-5 space-y-2">
                      <ProbBar percent={yesPercent} display={yesPriceDisplay} label={yesLabel} tone="yes" />
                      <ProbBar percent={noPercent} display={noPriceDisplay} label={noLabel} tone="no" delay={0.05} />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center py-6">
                    <span className="text-[10px] font-bold text-black/30">Price unavailable</span>
                  </div>
                )}
              </div>

              {/* Price chart */}
              <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
                <div className="mb-2"><SectionLabel>Price history</SectionLabel></div>
                {market.clob_token_ids?.[0] ? (
                  <PriceChart conditionId={market.condition_id} tokenId={market.clob_token_ids[0]} height={168} />
                ) : (
                  <div className="h-[168px] flex items-center justify-center">
                    <span className="text-[10px] font-bold text-black/30">No chart data</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* RAIL (order-2 / col2 spanning both rows, sticky) */}
          <aside className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20 lg:self-start">
            {rail}
          </aside>

          {/* REST (order-3 / col1 row2) */}
          <section className="order-3 lg:col-start-1 lg:row-start-2 min-w-0 space-y-6">
            {/* Order book depth */}
            {market.clob_token_ids?.[0] && (
              <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Order book depth</SectionLabel>
                  <SpreadIndicator tokenId={market.clob_token_ids[0]} />
                </div>
                <OrderBookLadder tokenId={market.clob_token_ids[0]} maxRows={8} />
              </div>
            )}

            {/* Signals — SignalPanel is self-styled and returns null when empty,
                so it collapses without leaving an empty card. Strip its trailing
                border/padding so it sits cleanly in the spaced stack. */}
            <div className="empty:hidden [&>[data-signal-panel]]:!border-b-0 [&>[data-signal-panel]]:!pb-0">
              <SignalPanel
                conditionId={market.condition_id}
                sourceArticleUrls={market.source_article_urls}
                marketAI={{
                  ai_sentiment: market.ai_sentiment,
                  ai_confidence: market.ai_confidence,
                  ai_summary: market.ai_summary,
                  favourite_outcome: market.favourite_outcome,
                }}
              />
            </div>

            {/* Related markets */}
            {(relatedMarkets.length > 0 || relatedLoading) && (
              <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <SectionLabel>Related markets</SectionLabel>
                  <span className="text-[9px] font-mono text-black/30 tabular-nums">{relatedMarkets.length}</span>
                </div>
                {relatedLoading ? (
                  <div className="flex items-center justify-center py-6"><SpinnerIcon className="text-black/20" /></div>
                ) : (
                  <div className="space-y-1.5">
                    {relatedMarkets.map(rm => {
                      const rmYes = rm.outcome_prices?.[0] ?? null;
                      const rmYesDisplay = rmYes !== null ? (rmYes * 100).toFixed(1) : '--';
                      return (
                        <button
                          key={rm.condition_id}
                          onClick={() => router.push(`/markets/${rm.condition_id}`)}
                          className="w-full text-left px-3 py-2.5 border border-[#e5e7eb] rounded-[12px] hover:border-black/15 hover:bg-[#f7f7f7] transition-all group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[11px] font-semibold leading-snug text-black/75 group-hover:text-black transition-colors flex-1">{rm.question}</p>
                            <div className="flex-shrink-0 text-right">
                              <span className="text-[13px] font-mono font-black text-emerald-600 tabular-nums">{rmYesDisplay}<span className="text-[10px] text-emerald-500/50">¢</span></span>
                              <span className="block text-[8px] font-bold text-black/30">Yes</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#e5e7eb]">
                            <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">VOL {formatVolume(rm.volume)}</span>
                            <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">24H {formatVolume(rm.volume_24h)}</span>
                            <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">LIQ {formatVolume(rm.liquidity)}</span>
                            <span className="text-[8px] font-mono font-bold text-black/30 tabular-nums">{formatTimeLeft(rm.end_date)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Polymarket footer link */}
            {(market.event_slug || market.slug) && (
              <a
                href={polymarketUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 border border-[#e5e7eb] rounded-[12px] text-[10px] font-bold text-[#9ca3af] hover:text-black hover:border-black transition-all"
              >
                View on Polymarket <ExternalIcon />
              </a>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── sub-components ─── */
function ProbBar({ percent, display, label, tone, delay = 0 }: { percent: number; display: string; label: string; tone: 'yes' | 'no'; delay?: number }) {
  const isYes = tone === 'yes';
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-[13px] font-bold tabular-nums w-[52px] text-right flex-shrink-0 ${isYes ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
        {display}%
      </span>
      <div className="flex-1 h-[10px] bg-[#f1f3f4] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isYes ? 'bg-emerald-500' : 'bg-rose-400'}`}
          initial={{ width: 0 }} animate={{ width: `${Math.max(percent, 1)}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
        />
      </div>
      <span className="text-[11px] font-semibold text-[#9ca3af] flex-shrink-0 truncate max-w-[70px]" style={{ fontFamily: FONT }}>{label}</span>
    </div>
  );
}

function Stat({ label, value, valueColor = 'text-black' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <span className="block text-[8px] font-semibold text-[#9ca3af] mb-0.5 uppercase tracking-wide">{label}</span>
      <span className={`font-mono text-[12px] font-bold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
}

/* ─── loading / empty states ─── */
function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] font-bold text-[#9ca3af] hover:text-black transition-colors mb-4" style={{ fontFamily: FONT }}>
        <span className="flex items-center justify-center h-7 w-7 border border-[#e5e7eb] rounded-[8px]"><BackArrow /></span>
        Markets
      </button>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_408px] gap-6">
        <div className="space-y-4">
          <div className="h-8 w-3/4 bg-[#f1f3f4] rounded-[8px] animate-pulse" />
          <div className="h-4 w-1/2 bg-[#f1f3f4] rounded-[8px] animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-40 bg-[#f8fafc] border border-[#e5e7eb] rounded-[16px] animate-pulse" />
            <div className="h-40 bg-[#f8fafc] border border-[#e5e7eb] rounded-[16px] animate-pulse" />
          </div>
          <div className="h-16 bg-[#f8fafc] border border-[#e5e7eb] rounded-[14px] animate-pulse" />
        </div>
        <div className="h-56 bg-[#f8fafc] border border-[#e5e7eb] rounded-[16px] animate-pulse" />
      </div>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-20 flex flex-col items-center justify-center text-center">
      <span className="text-[13px] font-bold text-black" style={{ fontFamily: FONT }}>Market not found</span>
      <p className="mt-1.5 text-[11px] text-[#9ca3af]">This market may have resolved or is no longer available.</p>
      <button onClick={onBack} className="mt-5 flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] rounded-[8px] text-[11px] font-bold text-[#9ca3af] hover:text-black hover:border-black transition-all" style={{ fontFamily: FONT }}>
        <BackArrow /> Back to Markets
      </button>
    </div>
  );
}
