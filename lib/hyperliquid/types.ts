// ─── Hyperliquid API Response Types ─────────────────────────────────────────

/** Perpetuals metadata returned by { type: 'meta' } */
export interface PerpsMetaResponse {
  universe: {
    name: string;
    szDecimals: number;
    maxLeverage: number;
  }[];
}

/** Per-asset context returned alongside meta by { type: 'metaAndAssetCtxs' } */
export interface AssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
  impactPxs?: string[];
}

/** Combined market data used in the store — meta + live context + midPrice */
export interface MarketData {
  coin: string;
  name: string;
  szDecimals: number;
  maxLeverage: number;
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string;
  oraclePx: string;
  premium: string;
  category: string;
  marketType: 'perp' | 'spot';
}

/** Single price level in the order book */
export interface Level {
  px: string;
  sz: string;
  n: number;
}

/** Aggregated order book snapshot */
export interface OrderbookData {
  bids: Level[];
  asks: Level[];
}

/** A single position for an asset */
export interface AssetPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    liquidationPx: string | null;
    leverage: {
      type: string;
      value: number;
    };
    marginUsed: string;
  };
}

/** Margin summary for an account */
export interface MarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

/** Open order on the exchange */
export interface OpenOrder {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  orderType: string;
}

/** Frontend open order with trigger details (from frontendOpenOrders endpoint) */
export interface FrontendOpenOrder {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  orderType: string;
  triggerPx?: string;
  triggerCondition?: string;
  tpsl?: 'tp' | 'sl';
  reduceOnly?: boolean;
  isPositionTpsl?: boolean;
}

/** Historical fill for a user */
export interface UserFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  feeToken: string;
}

/** Candle data for charting */
export interface CandleData {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

/** Real-time trade */
export interface TradeData {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  hash: string;
}

/** Result returned after placing/modifying an order */
export interface OrderResult {
  status: string;
  response: {
    type: string;
    data?: {
      statuses: {
        resting?: { oid: number };
        filled?: { totalSz: string; avgPx: string; oid: number };
        error?: string;
      }[];
    };
  };
}

/** Full clearing house state for a user */
export interface ClearinghouseState {
  marginSummary: MarginSummary;
  crossMarginSummary: MarginSummary;
  assetPositions: AssetPosition[];
  crossMaintenanceMarginUsed: string;
  /** Actual withdrawable balance after locked margin + maintenance requirements. */
  withdrawable: string;
}
