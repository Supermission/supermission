export type TradeSource = 'polymarket' | 'hyperliquid' | 'defi' | 'agent';
export type TradeSide = 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'CLOSE' | 'REDEEM' | 'SWAP';
export type TimeRange = 'today' | '7d' | '30d' | 'all';
export type SourceFilter = 'all' | 'markets' | 'perps' | 'swaps' | 'agents';
export type ViewMode = 'list' | 'card';

export interface UnifiedTrade {
  id: string;
  source: TradeSource;
  side: TradeSide;
  timestamp: number;
  title: string;
  subtitle: string;
  amount: number;
  price: number | null;
  size: number | null;
  pnl: number | null;
  leverage: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  liquidationPrice: number | null;
  agentName: string | null;
  marketUrl: string | null;
  txHash: string | null;
  tokenIn: string | null;
  tokenOut: string | null;
  chainId: number | null;
  status: 'confirmed' | 'pending' | 'failed' | null;
}

export interface TradeActivityStats {
  totalTrades: number;
  totalVolume: number;
  winRate: number;
  totalPnl: number;
  bestTrade: number;
  worstTrade: number;
}
