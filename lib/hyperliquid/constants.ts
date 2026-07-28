import { httpRpcUrl } from '@/lib/rpc/endpoints';

export const HL_API_URL =
  process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz';

export const HL_WS_URL =
  process.env.NEXT_PUBLIC_HYPERLIQUID_WS_URL || 'wss://api.hyperliquid.xyz/ws';

export const ARB_RPC_URL = httpRpcUrl('arbitrum');

export const HL_EVM_RPC_URL =
  process.env.NEXT_PUBLIC_QUICKNODE_HYPERLIQUID_RPC || '';

export const BUILDER_ADDRESS =
  process.env.NEXT_PUBLIC_SUPERMISSION_BUILDER_ADDRESS || '';

/** Builder fee in basis-points sent with each order — 0.03% */
export const BUILDER_FEE = 30;

/** Category tags for filtering the market grid */
export const ASSET_CATEGORIES: Record<string, string[]> = {
  'Layer 1': ['BTC', 'ETH', 'SOL', 'AVAX', 'DOT', 'ATOM', 'NEAR', 'SUI', 'APT', 'SEI', 'TIA', 'TON', 'HBAR', 'XRP', 'ADA', 'XLM', 'ALGO', 'ICP'],
  'Layer 2': ['ARB', 'OP', 'POL', 'STRK', 'MANTA', 'BLAST', 'ZK', 'LINEA', 'SCROLL', 'BASE'],
  DeFi: ['AAVE', 'UNI', 'MKR', 'CRV', 'DYDX', 'SNX', 'COMP', 'SUSHI', 'PENDLE', 'JUP', 'MORPHO', 'EIGEN', 'ONDO', 'ENA'],
  Meme: ['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'MEME', 'TURBO', 'POPCAT', 'PNUT', 'BRETT', 'FARTCOIN', 'MOODENG', 'GOAT', 'CHILLGUY', 'PENGU', 'PURR', 'MEW'],
  AI: ['FET', 'RNDR', 'RENDER', 'TAO', 'AR', 'AKT', 'VIRTUAL', 'AIXBT', 'GRIFFAIN', 'ZEREBRO', 'IO', 'GRASS'],
  Gaming: ['AXS', 'SAND', 'MANA', 'GALA', 'IMX', 'PRIME', 'PIXEL', 'NXPC'],
  Stocks: ['TSLA', 'NVDA', 'GOOGL', 'AAPL', 'SPY', 'AMZN', 'META', 'QQQ', 'MSFT', 'ORCL'],
  RWA: ['PAXG', 'ONDO', 'MORPHO', 'USUAL', 'RESOLV'],
  Infra: ['HYPE', 'LINK', 'PYTH', 'TIA', 'KAITO', 'W', 'ZRO', 'LAYER'],
};

export const DEFAULT_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type CandleInterval = (typeof DEFAULT_INTERVALS)[number];

/** Hyperliquid funds every 8 hours */
export const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;
