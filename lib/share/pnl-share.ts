/**
 * Utilities for generating shareable PnL card links.
 */

export interface ShareablePnLData {
  market: string;
  position: string;    // outcome label — "YES", "NO", "SRH", "CSK", etc.
  entryPrice: number;  // cents (32 = 32¢)
  currentPrice: number;
  pnlPercent: number;
  date: string;        // e.g. "Mar 28, 2026"
  slug?: string;       // market slug for linking back
  bg?: string;         // background image path (optional)
}

/** Build the relative path for a PnL share card */
export function buildPnLSharePath(data: ShareablePnLData): string {
  const params = new URLSearchParams({
    market: data.market,
    pos: data.position,
    entry: String(data.entryPrice),
    current: String(data.currentPrice),
    pnl: String(data.pnlPercent),
    date: data.date,
  });
  if (data.slug) params.set('slug', data.slug);
  if (data.bg) params.set('bg', data.bg);
  return `/share/pnl?${params.toString()}`;
}

/** Build share data from a Polymarket position object */
export function positionToShareData(position: {
  title: string;
  outcome: string;
  avgPrice: number;
  curPrice: number;
  percentPnl: number;
  slug?: string;
}): ShareablePnLData {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    market: position.title,
    position: position.outcome,
    entryPrice: Math.round(position.avgPrice * 100),
    currentPrice: Math.round(position.curPrice * 100),
    pnlPercent: position.percentPnl,
    date,
    slug: position.slug,
  };
}

/** Build share data from a trade history entry */
export function tradeToShareData(trade: {
  marketQuestion: string;
  outcome: string;
  price: number;
  condition_id?: string;
}, currentPrice: number): ShareablePnLData {
  const entryPrice = Math.round(trade.price * 100);
  const currentCents = Math.round(currentPrice * 100);
  const pnlPercent = entryPrice > 0
    ? ((currentCents - entryPrice) / entryPrice) * 100
    : 0;

  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    market: trade.marketQuestion,
    position: trade.outcome || 'Unknown',
    entryPrice,
    currentPrice: currentCents,
    pnlPercent,
    date,
  };
}
