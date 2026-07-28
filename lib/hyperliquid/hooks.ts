'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { useHyperliquidStore } from './store';
import { fetchCandleSnapshot } from './client';
import type { CandleData } from './types';
import type { CandleInterval } from './constants';
import { pctChange, roundToTickSize, stripTrailingZeros, truncateToDecimals } from './utils';
import { supabase } from '@/lib/supabase/client';

// ─── useHLMarkets ───────────────────────────────────────────────────────────

interface UseHLMarketsOpts {
  category?: string;
  sort?: string;
  search?: string;
}

export function useHLMarkets(opts?: UseHLMarketsOpts) {
  const markets = useHyperliquidStore((s) => s.markets);
  const isLoading = useHyperliquidStore((s) => s.isLoadingMarkets);
  const error = useHyperliquidStore((s) => s.marketsError);
  const initializeMarkets = useHyperliquidStore((s) => s.initializeMarkets);
  const startPriceUpdates = useHyperliquidStore((s) => s.startPriceUpdates);
  const stopPriceUpdates = useHyperliquidStore((s) => s.stopPriceUpdates);

  // Initialise once on first mount
  useEffect(() => {
    initializeMarkets();
    startPriceUpdates();
    return () => {
      stopPriceUpdates();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let arr = Object.values(markets);

    // Category filter
    if (opts?.category && opts.category !== 'All') {
      arr = arr.filter((m) => m.category === opts.category);
    }

    // Search filter — fuzzy match on coin symbol
    if (opts?.search) {
      const q = opts.search.toUpperCase();
      arr = arr.filter((m) => m.coin.toUpperCase().includes(q));
    }

    // Sort
    const sortKey = opts?.sort || 'Volume';
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'Volume':
          return parseFloat(b.dayNtlVlm) - parseFloat(a.dayNtlVlm);
        case '24h Change': {
          const aChg = pctChange(parseFloat(a.midPx), parseFloat(a.prevDayPx));
          const bChg = pctChange(parseFloat(b.midPx), parseFloat(b.prevDayPx));
          return Math.abs(bChg) - Math.abs(aChg);
        }
        case 'Funding':
          return (
            Math.abs(parseFloat(b.funding)) -
            Math.abs(parseFloat(a.funding))
          );
        case 'OI':
          return (
            parseFloat(b.openInterest) * parseFloat(b.markPx) -
            parseFloat(a.openInterest) * parseFloat(a.markPx)
          );
        case 'Price':
          return parseFloat(b.midPx) - parseFloat(a.midPx);
        default:
          return parseFloat(b.dayNtlVlm) - parseFloat(a.dayNtlVlm);
      }
    });

    return arr;
  }, [markets, opts?.category, opts?.search, opts?.sort]);

  return { markets: filtered, isLoading, error };
}

// ─── useHLOrderbook ─────────────────────────────────────────────────────────

export function useHLOrderbook(coin: string) {
  const orderbook = useHyperliquidStore((s) => s.orderbook);
  const subscribeOrderbook = useHyperliquidStore((s) => s.subscribeOrderbook);
  const unsubscribeOrderbook = useHyperliquidStore((s) => s.unsubscribeOrderbook);

  useEffect(() => {
    if (coin) subscribeOrderbook(coin);
    return () => {
      unsubscribeOrderbook();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin]);

  const spread = useMemo(() => {
    if (orderbook.asks.length === 0 || orderbook.bids.length === 0)
      return { spread: 0, spreadPct: 0 };
    const bestAsk = parseFloat(orderbook.asks[0].px);
    const bestBid = parseFloat(orderbook.bids[0].px);
    const s = bestAsk - bestBid;
    const mid = (bestAsk + bestBid) / 2;
    return { spread: s, spreadPct: mid > 0 ? (s / mid) * 100 : 0 };
  }, [orderbook]);

  return { bids: orderbook.bids, asks: orderbook.asks, ...spread };
}

// ─── useHLCandles ───────────────────────────────────────────────────────────

export function useHLCandles(coin: string, interval: CandleInterval) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const candlesRef = useRef<CandleData[]>([]);

  const intervalMs: Record<string, number> = {
    '1m': 60_000,
    '5m': 300_000,
    '15m': 900_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1d': 86_400_000,
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    candlesRef.current = [];

    const candleMs = intervalMs[interval] || 3_600_000;

    // Initial full fetch — ~300 candles
    const loadInitial = async () => {
      try {
        const endTime = Date.now();
        const startTime = endTime - candleMs * 300;
        const data = await fetchCandleSnapshot(coin, interval, startTime, endTime);
        if (!cancelled) {
          candlesRef.current = data;
          setCandles(data);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Poll for latest candles to keep chart real-time
    const pollLatest = async () => {
      try {
        const endTime = Date.now();
        // Fetch last 3 candles to catch any updates to the current candle
        const startTime = endTime - candleMs * 3;
        const latest = await fetchCandleSnapshot(coin, interval, startTime, endTime);
        if (cancelled || latest.length === 0) return;

        const prev = candlesRef.current;
        if (prev.length === 0) return;

        // Merge: replace/append candles by timestamp
        const map = new Map(prev.map((c) => [c.t, c]));
        for (const c of latest) map.set(c.t, c);
        const merged = Array.from(map.values()).sort((a, b) => a.t - b.t);
        candlesRef.current = merged;
        setCandles(merged);
      } catch {
        // silently ignore poll errors
      }
    };

    loadInitial();

    // Poll frequency: shorter intervals poll faster
    const pollMs = Math.max(5_000, Math.min(candleMs / 3, 15_000));
    const timer = window.setInterval(pollLatest, pollMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, interval]);

  return { candles, isLoading };
}

// ─── useHLPositions ─────────────────────────────────────────────────────────

export function useHLPositions() {
  const positions = useHyperliquidStore((s) => s.positions);
  const markets = useHyperliquidStore((s) => s.markets);

  return useMemo(
    () =>
      positions
        .filter((p) => parseFloat(p.position.szi) !== 0)
        .map((p) => {
          const entryPx = parseFloat(p.position.entryPx);
          const size = parseFloat(p.position.szi);
          const isLong = size > 0;
          const unrealizedPnl = parseFloat(p.position.unrealizedPnl);
          const pnlPct = parseFloat(p.position.returnOnEquity) * 100;
          const positionValue = parseFloat(p.position.positionValue);
          // Mark price = positionValue / abs(size), fallback to market data
          const absSize = Math.abs(size);
          const market = markets[p.position.coin];
          const markPx = absSize > 0 ? positionValue / absSize : (market ? parseFloat(market.markPx) : entryPx);
          const leverage = p.position.leverage?.value ?? null;
          const leverageType = p.position.leverage?.type ?? 'cross';
          const marginUsed = parseFloat(p.position.marginUsed || '0');
          const liqPx = p.position.liquidationPx ? parseFloat(p.position.liquidationPx) : null;

          return {
            ...p,
            markPx,
            entryPx,
            size,
            isLong,
            unrealizedPnl,
            pnlPct,
            positionValue,
            leverage,
            leverageType,
            marginUsed,
            liqPx,
          };
        }),
    [positions, markets],
  );
}

// ─── useHLOrders ────────────────────────────────────────────────────────────

export function useHLOrders() {
  return useHyperliquidStore((s) => s.openOrders);
}

// ─── usePositionTpSl ────────────────────────────────────────────────────────

/** Returns TP/SL trigger orders grouped by coin */
export function usePositionTpSl() {
  const openOrders = useHyperliquidStore((s) => s.openOrders);

  return useMemo(() => {
    const map: Record<string, { tp?: (typeof openOrders)[number]; sl?: (typeof openOrders)[number] }> = {};
    for (const order of openOrders) {
      // Detect TP/SL from multiple signals:
      // 1. Direct tpsl field (if present)
      // 2. orderType string containing "Take Profit" or "Stop"
      // 3. Must have triggerPx to be a trigger order
      let type: 'tp' | 'sl' | null = null;
      if (order.tpsl === 'tp' || order.tpsl === 'sl') {
        type = order.tpsl;
      } else if (order.triggerPx) {
        const ot = (order.orderType || '').toLowerCase();
        if (ot.includes('take profit')) type = 'tp';
        else if (ot.includes('stop')) type = 'sl';
      }
      if (type) {
        if (!map[order.coin]) map[order.coin] = {};
        map[order.coin][type] = order;
      }
    }
    return map;
  }, [openOrders]);
}

// ─── useHLConnectionStatus ──────────────────────────────────────────────────

/**
 * Observable Hyperliquid WS connection status. Renders in-sync with the store
 * and also ticks once per second so the "last updated Xs ago" label stays fresh
 * without requiring a fresh message event.
 */
export function useHLConnectionStatus() {
  const status = useHyperliquidStore((s) => s.wsStatus);
  const lastMessageAt = useHyperliquidStore((s) => s.lastMessageAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsSinceUpdate = lastMessageAt ? Math.max(0, Math.floor((now - lastMessageAt) / 1000)) : null;
  const isStale = secondsSinceUpdate !== null && secondsSinceUpdate > 30;

  return { status, secondsSinceUpdate, isStale };
}

// ─── useHLAccount ───────────────────────────────────────────────────────────

export function useHLAccount() {
  const marginSummary = useHyperliquidStore((s) => s.marginSummary);

  return useMemo(() => {
    if (!marginSummary)
      return {
        equity: 0,
        availableMargin: 0,
        marginUsed: 0,
        totalPnl: 0,
      };

    const equity = parseFloat(marginSummary.accountValue);
    const marginUsed = parseFloat(marginSummary.totalMarginUsed);
    const rawUsd = parseFloat(marginSummary.totalRawUsd);

    return {
      equity,
      availableMargin: equity - marginUsed,
      marginUsed,
      totalPnl: equity - rawUsd,
    };
  }, [marginSummary]);
}

// ─── useHLTrade ─────────────────────────────────────────────────────────────

export function useHLTrade() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = useHyperliquidStore((s) => s.meta);
  const spotMeta = useHyperliquidStore((s) => s.spotMeta);
  const markets = useHyperliquidStore((s) => s.markets);
  const fetchUserState = useHyperliquidStore((s) => s.fetchUserState);
  const walletAddress = useHyperliquidStore((s) => s.walletAddress);
  const { wallets } = useWallets();

  const getExchangeClient = useCallback(async () => {
    const embedded = wallets.find(w => w.walletClientType === 'privy');
    if (!embedded) throw new Error('No embedded wallet found. Please connect your wallet first.');

    const provider = await embedded.getEthereumProvider();

    const { ExchangeClient, HttpTransport } = await import('@nktkas/hyperliquid');
    const { createWalletClient, custom } = await import('viem');
    const { arbitrum } = await import('viem/chains');

    const walletClient = createWalletClient({
      account: embedded.address as `0x${string}`,
      chain: arbitrum,
      transport: custom(provider),
    });

    const transport = new HttpTransport();
    return new ExchangeClient({ wallet: walletClient, transport });
  }, [wallets]);

  const placeOrder = useCallback(async (params: {
    coin: string;
    isBuy: boolean;
    sz: number;
    limitPx: number;
    orderType: { limit: { tif: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket' } } | { trigger: { triggerPx: string; isMarket: boolean; tpsl: 'tp' | 'sl' } };
    reduceOnly?: boolean;
    leverage?: number;
  }) => {
    setError(null);
    setIsExecuting(true);
    try {
      if (!meta) throw new Error('Market metadata not loaded');

      // Determine if this is a spot or perp asset
      const marketEntry = Object.values(markets).find(m => m.coin === params.coin);
      const isSpotAsset = marketEntry?.marketType === 'spot';

      let assetIndex: number;
      let szDecimals: number;

      if (isSpotAsset) {
        if (!spotMeta) throw new Error('Spot metadata not loaded');
        const tokenMap: Record<number, string> = {};
        for (const t of spotMeta.tokens) {
          tokenMap[t.index] = t.name;
        }
        const spotIdx = spotMeta.universe.findIndex(pair => {
          const baseName = tokenMap[pair.tokens[0]];
          return baseName === params.coin;
        });
        if (spotIdx === -1) throw new Error(`Unknown spot asset: ${params.coin}`);
        assetIndex = 10000 + spotIdx;
        const baseToken = spotMeta.tokens.find(t => t.name === params.coin);
        szDecimals = baseToken?.szDecimals ?? 2;
      } else {
        const perpIdx = meta.universe.findIndex(a => a.name === params.coin);
        if (perpIdx === -1) throw new Error(`Unknown asset: ${params.coin}`);
        assetIndex = perpIdx;
        szDecimals = meta.universe[perpIdx].szDecimals ?? 0;
      }

      const exchangeClient = await getExchangeClient();

      // Set leverage if specified (perps only)
      if (!isSpotAsset && params.leverage && params.leverage > 1) {
        await exchangeClient.updateLeverage({
          asset: assetIndex,
          isCross: true,
          leverage: params.leverage,
        });
      }
      const priceStr = roundToTickSize(params.limitPx, szDecimals, isSpotAsset);
      if (parseFloat(priceStr) <= 0) throw new Error('Price is too small for this asset. Try a higher-priced token or larger order.');

      // Truncate size (not round) — matches Hyperliquid SDK behavior
      const sizeStr = truncateToDecimals(params.sz, szDecimals);
      if (parseFloat(sizeStr) <= 0) {
        const minSize = 1 / (10 ** szDecimals);
        const minUsd = minSize * params.limitPx;
        throw new Error(`Order too small. Minimum: ${minSize} ${params.coin} (~$${minUsd.toFixed(2)}). Try a larger amount.`);
      }

      // Format trigger price if this is a TP/SL order
      let orderType = params.orderType;
      if ('trigger' in orderType) {
        orderType = {
          trigger: {
            ...orderType.trigger,
            triggerPx: roundToTickSize(parseFloat(orderType.trigger.triggerPx), szDecimals, isSpotAsset),
          },
        };
      }

      // Standalone trigger orders use 'na'. 'normalTpsl'/'positionTpsl' are only
      // for batching a main order + TP/SL in a single request.
      // Place the order
      const result = await exchangeClient.order({
        orders: [{
          a: assetIndex,
          b: params.isBuy,
          p: priceStr,
          s: sizeStr,
          r: params.reduceOnly || false,
          t: orderType,
        }],
        grouping: 'na',
      });

      // Log trade to hyperion_trades (fire-and-forget)
      const orderTypeStr = 'limit' in params.orderType
        ? (params.orderType.limit.tif === 'Ioc' ? 'market' : params.orderType.limit.tif.toLowerCase())
        : params.orderType.trigger.tpsl;
      const hlResponse = result as Record<string, unknown>;
      // Envelope-level rejection: HL returns { status: 'err', response: '<msg>' }.
      // Without this the order was logged as pending + shown as success even
      // though nothing was placed.
      if (hlResponse?.status === 'err') {
        throw new Error(String(hlResponse.response ?? 'Order rejected by the exchange'));
      }
      const statuses = (hlResponse?.response as any)?.data?.statuses;
      const firstStatus = Array.isArray(statuses) ? statuses[0] : null;
      if (firstStatus?.error) {
        throw new Error(String(firstStatus.error));
      }
      const oid = firstStatus?.resting?.oid ?? firstStatus?.filled?.oid ?? null;
      const filled = !!firstStatus?.filled;
      (supabase as any).from('hyperion_trades').insert({
        user_id: walletAddress ?? 'unknown',
        wallet_address: walletAddress ?? '',
        coin: params.coin,
        side: params.isBuy ? 'buy' : 'sell',
        size: params.sz,
        price: params.limitPx,
        order_type: orderTypeStr,
        leverage: params.leverage ?? 1,
        status: filled ? 'filled' : 'pending',
        hl_order_id: oid ? String(oid) : null,
        hl_response: hlResponse,
        filled_at: filled ? new Date().toISOString() : null,
      }).then(({ error: dbErr }: { error: unknown }) => {
        if (dbErr) console.error('Failed to log trade:', dbErr);
      });

      // Optimistic position — only for opening orders that actually change
      // size. Trigger (SL/TP) and reduceOnly closers must NOT touch the
      // positions store, or they would cancel out the just-opened position
      // and cause a flicker between optimistic state and server state.
      const isTrigger = 'trigger' in params.orderType;
      const isReduceOnly = !!params.reduceOnly;
      if (!isTrigger && !isReduceOnly && !isSpotAsset) {
        const sizeStr = stripTrailingZeros(params.sz.toFixed(
          meta.universe.find(u => u.name === params.coin)?.szDecimals ?? 0
        ));
        const signedSize = params.isBuy ? parseFloat(sizeStr) : -parseFloat(sizeStr);
        const entryPx = params.limitPx;
        const positionValue = Math.abs(signedSize) * entryPx;
        const lev = params.leverage ?? 1;
        const marginUsed = positionValue / lev;
        const liqPx = params.isBuy
          ? entryPx - entryPx / lev
          : entryPx + entryPx / lev;

        useHyperliquidStore.getState().addOptimisticPosition({
          position: {
            coin: params.coin,
            szi: signedSize.toString(),
            entryPx: entryPx.toString(),
            positionValue: positionValue.toString(),
            unrealizedPnl: '0',
            returnOnEquity: '0',
            liquidationPx: liqPx.toString(),
            leverage: { type: 'cross', value: lev },
            marginUsed: marginUsed.toString(),
          },
        });
      }

      // Refresh positions from the API after a short delay so the exchange
      // has had time to register the fill. Refreshing immediately often
      // returns a snapshot that predates the order, which would then
      // overwrite our optimistic entry with empty data and blink the card
      // off-screen. Only the FINAL call in a multi-leg submit should
      // trigger this; callers can opt out by passing refreshAfter=false.
      if (walletAddress) {
        setTimeout(() => fetchUserState(walletAddress), 800);
      }

      return result;
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Order failed';
      const msgLower = msg.toLowerCase();
      // Friendly errors
      if (msg.includes('does not exist')) {
        msg = 'Deposit USDC to Hyperliquid first using the banner at the top of this page.';
      } else if (msgLower.includes('insufficient spot balance')) {
        msg = 'Insufficient spot balance. Transfer USDC to your Hyperliquid spot account to trade spot markets.';
      } else if (msgLower.includes('insufficient') || msgLower.includes('not enough')) {
        msg = 'Insufficient margin. Deposit more USDC to Hyperliquid.';
      } else if (msgLower.includes('minimum')) {
        msg = msg;
      }
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsExecuting(false);
    }
  }, [meta, spotMeta, markets, getExchangeClient, fetchUserState, walletAddress]);

  const cancelOrder = useCallback(async (coin: string, oid: number) => {
    setError(null);
    setIsExecuting(true);
    try {
      if (!meta) throw new Error('Market metadata not loaded');
      const cancelMarket = Object.values(markets).find(m => m.coin === coin);
      let assetIndex: number;
      if (cancelMarket?.marketType === 'spot' && spotMeta) {
        const tokenMap: Record<number, string> = {};
        for (const t of spotMeta.tokens) tokenMap[t.index] = t.name;
        const spotIdx = spotMeta.universe.findIndex(pair => tokenMap[pair.tokens[0]] === coin);
        if (spotIdx === -1) throw new Error(`Unknown spot asset: ${coin}`);
        assetIndex = 10000 + spotIdx;
      } else {
        const perpIdx = meta.universe.findIndex(a => a.name === coin);
        if (perpIdx === -1) throw new Error(`Unknown asset: ${coin}`);
        assetIndex = perpIdx;
      }

      const exchangeClient = await getExchangeClient();
      await exchangeClient.cancel({ cancels: [{ a: assetIndex, o: oid }] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cancel failed';
      setError(msg);
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [meta, spotMeta, markets, getExchangeClient]);

  const modifyOrder = useCallback(async (params: { coin: string; oid: number; newPx: number; newSz: number; isBuy: boolean }) => {
    setError(null);
    setIsExecuting(true);
    try {
      if (!meta) throw new Error('Market metadata not loaded');
      const modMarket = Object.values(markets).find(m => m.coin === params.coin);
      let assetIndex: number;
      if (modMarket?.marketType === 'spot' && spotMeta) {
        const tokenMap: Record<number, string> = {};
        for (const t of spotMeta.tokens) tokenMap[t.index] = t.name;
        const spotIdx = spotMeta.universe.findIndex(pair => tokenMap[pair.tokens[0]] === params.coin);
        if (spotIdx === -1) throw new Error(`Unknown spot asset: ${params.coin}`);
        assetIndex = 10000 + spotIdx;
      } else {
        const perpIdx = meta.universe.findIndex(a => a.name === params.coin);
        if (perpIdx === -1) throw new Error(`Unknown asset: ${params.coin}`);
        assetIndex = perpIdx;
      }

      const exchangeClient = await getExchangeClient();
      await exchangeClient.modify({
        oid: params.oid,
        order: {
          a: assetIndex,
          b: params.isBuy,
          p: String(params.newPx),
          s: String(params.newSz),
          r: false,
          t: { limit: { tif: 'Gtc' } },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Modify failed';
      setError(msg);
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [meta, spotMeta, markets, getExchangeClient]);

  const updateLeverage = useCallback(async (coin: string, leverage: number) => {
    setError(null);
    setIsExecuting(true);
    try {
      if (!meta) throw new Error('Market metadata not loaded');
      const assetIndex = meta.universe.findIndex(a => a.name === coin);
      if (assetIndex === -1) throw new Error(`Unknown asset: ${coin}`);

      const exchangeClient = await getExchangeClient();
      await exchangeClient.updateLeverage({
        asset: assetIndex,
        isCross: true,
        leverage,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Leverage update failed';
      setError(msg);
      throw err;
    } finally {
      setIsExecuting(false);
    }
  }, [meta, getExchangeClient]);

  return { placeOrder, cancelOrder, modifyOrder, updateLeverage, isExecuting, error };
}

// ─── useHLRecentTrades ──────────────────────────────────────────────────────

export function useHLRecentTrades(coin: string) {
  const recentTrades = useHyperliquidStore((s) => s.recentTrades);
  const subscribeTrades = useHyperliquidStore((s) => s.subscribeTrades);
  const unsubscribeTrades = useHyperliquidStore((s) => s.unsubscribeTrades);

  useEffect(() => {
    if (coin) subscribeTrades(coin);
    return () => {
      unsubscribeTrades();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin]);

  return recentTrades;
}
