import { create } from 'zustand';
import type {
  PerpsMetaResponse,
  MarketData,
  OrderbookData,
  AssetPosition,
  FrontendOpenOrder,
  MarginSummary,
  UserFill,
  TradeData,
  Level,
} from './types';
import {
  fetchMetaAndAssetCtxs,
  fetchAllMids,
  fetchClearinghouseState,
  fetchOpenOrders,
  fetchFrontendOpenOrders,
  fetchUserFills,
  createHLWebSocket,
  hlSubscribe,
  hlUnsubscribe,
  fetchSpotMetaAndAssetCtxs,
} from './client';
import { getCategoryForCoin } from './utils';

// ─── Store shape ────────────────────────────────────────────────────────────

interface HyperliquidState {
  // Markets
  markets: Record<string, MarketData>;
  meta: PerpsMetaResponse | null;
  spotMeta: import('./client').SpotMeta | null;
  isLoadingMarkets: boolean;
  marketsError: string | null;

  // Orderbook
  orderbook: OrderbookData;
  orderbookCoin: string | null;

  // User
  positions: AssetPosition[];
  openOrders: FrontendOpenOrder[];
  marginSummary: MarginSummary | null;
  userFills: UserFill[];
  isAuthenticated: boolean;
  walletAddress: string | null;

  // Trades
  recentTrades: TradeData[];

  // WebSocket refs (not serialised)
  _ws: WebSocket | null;
  _wsSubscriptions: Set<string>;
  _reconnectTimer: ReturnType<typeof setTimeout> | null;
  _reconnectAttempt: number;
  _stopRequested: boolean;

  // Connection health — observable for UI
  wsStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  lastMessageAt: number | null;

  // Actions
  initializeMarkets: () => Promise<void>;
  startPriceUpdates: () => void;
  stopPriceUpdates: () => void;
  subscribeOrderbook: (coin: string) => void;
  unsubscribeOrderbook: () => void;
  subscribeTrades: (coin: string) => void;
  unsubscribeTrades: () => void;
  addOptimisticPosition: (pos: AssetPosition) => void;
  fetchUserState: (address: string) => Promise<void>;
  setWalletAddress: (address: string | null) => void;
  cleanup: () => void;
}

// ─── Store implementation ───────────────────────────────────────────────────

export const useHyperliquidStore = create<HyperliquidState>((set, get) => ({
  // ── Initial state ──
  markets: {},
  meta: null,
  spotMeta: null,
  isLoadingMarkets: false,
  marketsError: null,

  orderbook: { bids: [], asks: [] },
  orderbookCoin: null,

  positions: [],
  openOrders: [],
  marginSummary: null,
  userFills: [],
  isAuthenticated: false,
  walletAddress: null,

  recentTrades: [],

  _ws: null,
  _wsSubscriptions: new Set(),
  _reconnectTimer: null,
  _reconnectAttempt: 0,
  _stopRequested: false,

  wsStatus: 'idle',
  lastMessageAt: null,

  // ── initializeMarkets ──
  initializeMarkets: async () => {
    const { isLoadingMarkets } = get();
    if (isLoadingMarkets) return;

    set({ isLoadingMarkets: true, marketsError: null });

    try {
      const [metaAndCtxs, allMids, spotData] = await Promise.all([
        fetchMetaAndAssetCtxs(),
        fetchAllMids(),
        fetchSpotMetaAndAssetCtxs().catch((e) => { console.warn('[HL] Spot fetch failed:', e); return null; }),
      ]);

      const [meta, assetCtxs] = metaAndCtxs;
      const record: Record<string, MarketData> = {};

      // Add perp markets
      meta.universe.forEach((asset, idx) => {
        const ctx = assetCtxs[idx];
        if (!ctx) return;
        const mid = allMids[asset.name] || ctx.markPx || '0';

        record[asset.name] = {
          coin: asset.name,
          name: asset.name,
          szDecimals: asset.szDecimals,
          maxLeverage: asset.maxLeverage,
          funding: ctx.funding,
          openInterest: ctx.openInterest,
          prevDayPx: ctx.prevDayPx,
          dayNtlVlm: ctx.dayNtlVlm,
          markPx: ctx.markPx,
          midPx: mid,
          oraclePx: ctx.oraclePx,
          premium: ctx.premium,
          category: getCategoryForCoin(asset.name),
          marketType: 'perp' as const,
        };
      });

      console.log(`[HL] Loaded ${Object.keys(record).length} perp markets`);

      // Add spot markets (skip if fetch failed)
      if (spotData) {
        try {
          const [spotMeta, spotCtxs] = spotData;
          const tokenMap: Record<number, string> = {};
          for (const t of spotMeta.tokens) {
            tokenMap[t.index] = t.name;
          }

          spotMeta.universe.forEach((pair, idx) => {
            const ctx = spotCtxs[idx];
            if (!ctx || !ctx.midPx) return;
            // Use the base token name (first token in the pair)
            const baseTokenIdx = pair.tokens[0];
            const baseName = tokenMap[baseTokenIdx];
            if (!baseName || baseName === 'USDC') return;
            // Skip if already exists as a perp (perps take priority)
            if (record[baseName]) return;
            const spotKey = `${baseName}-SPOT`;

            const baseToken = spotMeta.tokens.find(t => t.index === baseTokenIdx);
            record[spotKey] = {
              coin: baseName,
              name: baseName,
              szDecimals: baseToken?.szDecimals ?? 2,
              maxLeverage: 1,
              funding: '0',
              openInterest: '0',
              prevDayPx: ctx.prevDayPx || '0',
              dayNtlVlm: ctx.dayNtlVlm || '0',
              markPx: ctx.markPx || '0',
              midPx: ctx.midPx || '0',
              oraclePx: '0',
              premium: '0',
              category: getCategoryForCoin(baseName),
              marketType: 'spot' as const,
            };
          });
          const spotCount = Object.values(record).filter(m => m.marketType === 'spot').length;
          console.log(`[HL] Loaded ${spotCount} spot markets`);
        } catch (spotErr) {
          console.warn('[HL] Spot parsing failed:', spotErr);
        }
      }

      set({ markets: record, meta, spotMeta: spotData ? spotData[0] : null, isLoadingMarkets: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load markets';
      set({
        marketsError: message,
        isLoadingMarkets: false,
      });
    }
  },

  // ── WebSocket price updates ──
  startPriceUpdates: () => {
    const state = get();
    if (state._ws) return; // already running

    set({ _stopRequested: false, wsStatus: 'connecting' });

    const connect = () => {
      try {
        const ws = createHLWebSocket();

        ws.onopen = () => {
          set({ _reconnectAttempt: 0, wsStatus: 'connected', lastMessageAt: Date.now() });
          hlSubscribe(ws, { type: 'allMids' });
          get()._wsSubscriptions.add('allMids');
        };

        ws.onmessage = (event) => {
          set({ lastMessageAt: Date.now() });
          try {
            const msg = JSON.parse(event.data);
            if (msg.channel === 'allMids' && msg.data?.mids) {
              const mids: Record<string, string> = msg.data.mids;
              set((prev) => {
                const updated = { ...prev.markets };
                for (const [coin, price] of Object.entries(mids)) {
                  if (updated[coin]) {
                    updated[coin] = { ...updated[coin], midPx: price };
                  }
                }
                return { markets: updated };
              });
            }

            // Orderbook updates
            if (msg.channel === 'l2Book' && msg.data) {
              const levels = msg.data.levels as [
                { px: string; sz: string; n: number }[],
                { px: string; sz: string; n: number }[],
              ];
              if (levels && levels.length === 2) {
                set({
                  orderbook: {
                    bids: levels[0] as Level[],
                    asks: levels[1] as Level[],
                  },
                });
              }
            }

            // Recent trades
            if (msg.channel === 'trades' && Array.isArray(msg.data)) {
              set((prev) => ({
                recentTrades: [...msg.data, ...prev.recentTrades].slice(0, 50),
              }));
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          const stopped = get()._stopRequested;
          set({ _ws: null, wsStatus: stopped ? 'disconnected' : 'reconnecting' });
          if (stopped) return;
          // Reconnect with exponential backoff
          const attempt = get()._reconnectAttempt;
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          const timer = setTimeout(() => {
            if (get()._stopRequested) return;
            set({ _reconnectAttempt: attempt + 1 });
            connect();
          }, delay);
          set({ _reconnectTimer: timer });
        };

        ws.onerror = () => {
          ws.close();
        };

        set({ _ws: ws });
      } catch {
        // WebSocket creation can throw in SSR — silently ignore
        set({ wsStatus: 'disconnected' });
      }
    };

    connect();
  },

  stopPriceUpdates: () => {
    const { _ws, _reconnectTimer } = get();
    set({ _stopRequested: true });
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_ws) {
      try {
        _ws.close();
      } catch {
        // ignore
      }
    }
    set({
      _ws: null,
      _reconnectTimer: null,
      _wsSubscriptions: new Set(),
      wsStatus: 'idle',
    });
  },

  // ── Orderbook ──
  subscribeOrderbook: (coin: string) => {
    const { _ws, orderbookCoin } = get();
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;

    // Unsubscribe from previous coin
    if (orderbookCoin) {
      hlUnsubscribe(_ws, { type: 'l2Book', coin: orderbookCoin });
    }

    hlSubscribe(_ws, { type: 'l2Book', coin });
    set({ orderbookCoin: coin, orderbook: { bids: [], asks: [] } });
  },

  unsubscribeOrderbook: () => {
    const { _ws, orderbookCoin } = get();
    if (_ws && _ws.readyState === WebSocket.OPEN && orderbookCoin) {
      hlUnsubscribe(_ws, { type: 'l2Book', coin: orderbookCoin });
    }
    set({ orderbookCoin: null, orderbook: { bids: [], asks: [] } });
  },

  // ── Trades ──
  subscribeTrades: (coin: string) => {
    const { _ws } = get();
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
    hlSubscribe(_ws, { type: 'trades', coin });
    set({ recentTrades: [] });
  },

  unsubscribeTrades: () => {
    const { _ws } = get();
    // We can't unsub without knowing the coin — clearing state is sufficient
    // since the WS will be torn down on page navigation anyway
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      // Trades unsub handled on cleanup
    }
    set({ recentTrades: [] });
  },

  // ── Optimistic position injection ──
  addOptimisticPosition: (pos: AssetPosition) => {
    const existing = get().positions;
    const idx = existing.findIndex(p => p.position.coin === pos.position.coin);
    if (idx >= 0) {
      // Merge into existing position (add sizes)
      const old = existing[idx];
      const oldSize = parseFloat(old.position.szi);
      const newSize = parseFloat(pos.position.szi);
      const combinedSize = oldSize + newSize;
      if (combinedSize === 0) {
        // Position fully closed — remove it
        set({ positions: existing.filter((_, i) => i !== idx) });
      } else {
        const updated = [...existing];
        updated[idx] = {
          position: {
            ...old.position,
            szi: combinedSize.toString(),
          },
        };
        set({ positions: updated });
      }
    } else {
      set({ positions: [...existing, pos] });
    }
  },

  // ── User state ──
  fetchUserState: async (address: string) => {
    try {
      const [clearinghouse, orders, fills] = await Promise.all([
        fetchClearinghouseState(address),
        fetchFrontendOpenOrders(address).catch(() => fetchOpenOrders(address)),
        fetchUserFills(address),
      ]);

      set({
        positions: clearinghouse.assetPositions,
        marginSummary: clearinghouse.marginSummary,
        openOrders: orders,
        userFills: fills,
        isAuthenticated: true,
      });
    } catch {
      // Silently fail — user might not have HL account
    }
  },

  setWalletAddress: (address: string | null) => {
    set({
      walletAddress: address,
      isAuthenticated: !!address,
      // Clear user data when disconnecting
      ...(address
        ? {}
        : {
            positions: [],
            openOrders: [],
            marginSummary: null,
            userFills: [],
          }),
    });
  },

  // ── Cleanup ──
  cleanup: () => {
    const { stopPriceUpdates } = get();
    stopPriceUpdates();
    set({
      markets: {},
      meta: null,
      orderbook: { bids: [], asks: [] },
      orderbookCoin: null,
      positions: [],
      openOrders: [],
      marginSummary: null,
      userFills: [],
      recentTrades: [],
      isAuthenticated: false,
      walletAddress: null,
    });
  },
}));
