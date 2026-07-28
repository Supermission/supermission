/**
 * Cross-agent redirect configuration.
 * Maps agent IDs to their routes, display names, and short descriptions.
 */

export interface AgentRedirectTarget {
  id: string;
  label: string;
  path: string;
  description: string;
}

export const AGENT_REDIRECT_MAP: Record<string, AgentRedirectTarget> = {
  delphi: {
    id: 'delphi',
    label: 'DELPHI',
    path: '/defai',
    description: 'DeFi operations — swaps, yields, LP, wallet analysis, token analysis',
  },
  oracle: {
    id: 'oracle',
    label: 'ORACLE',
    path: '/markets',
    description: 'Prediction market trading — search, signals, bets, portfolio',
  },
  hyperion: {
    id: 'hyperion',
    label: 'HYPERION',
    path: '/perps',
    description: 'Perpetual futures trading on Hyperliquid',
  },
  securo: {
    id: 'securo',
    label: 'SECURO',
    path: '/security',
    description: 'Smart contract security audits',
  },
  roro: {
    id: 'roro',
    label: 'RORO',
    path: '/roro',
    description: 'Stocks & options trading on Robinhood — quotes, fundamentals, portfolio, equity orders',
  },
};
