/**
 * Shared P&L calculation logic for admin panel.
 * Used by both the traders table route and the trader detail route
 * to ensure consistent numbers across the admin panel.
 *
 * IMPORTANT: Internal sell trades are recorded with price=0 and amount=shares
 * (the share count, NOT USDC value). This means we cannot derive actual sell
 * revenue from internal trade data alone. External Polymarket trades DO have
 * proper price data (price > 0).
 *
 * Strategy:
 * - For sells with price > 0 (external/Polymarket data): use real revenue
 * - For sells with price = 0 (internal): we don't know the sell price.
 *   Assume sold at buy price (break-even) for realized P&L.
 * - Unrealized P&L is always computed from (currentPrice - avgBuyPrice) × openShares
 */

export interface Trade {
  condition_id: string;
  side: string;
  outcome: string;
  amount: number | string;
  price: number | string;
  shares: number | string;
  created_at?: string;
}

export interface MarketInfo {
  condition_id: string;
  outcomes: string[];
  outcome_prices: number[];
  is_closed: boolean;
}

export interface PositionSummary {
  conditionId: string;
  outcome: string;
  buyShares: number;
  buyCost: number;
  sellShares: number;
  sellRevenue: number;
  openShares: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  currentPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  isClosed: boolean;
  isResolved: boolean;
  resolvedWinner: string | null;
  isWinner: boolean;
  isLoser: boolean;
}

export interface TraderPnlResult {
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
  totalInvested: number;
  roi: number;
  wins: number;
  losses: number;
  positions: PositionSummary[];
}

/**
 * Parse market catalog row into a normalized MarketInfo.
 * Handles JSON-string or array outcome_prices/outcomes.
 */
export function parseMarketInfo(m: any): MarketInfo {
  const outcomes: string[] = m.outcomes
    ? (typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes)
    : [];
  const outcome_prices: number[] = m.outcome_prices
    ? (typeof m.outcome_prices === 'string' ? JSON.parse(m.outcome_prices) : m.outcome_prices).map(Number)
    : [];
  return {
    condition_id: m.condition_id,
    outcomes,
    outcome_prices,
    is_closed: m.is_closed || false,
  };
}

/**
 * Determine if a market is resolved and who won.
 * A market is "resolved" if it's closed and one outcome price >= 0.95.
 */
export function getResolvedWinner(market: MarketInfo): string | null {
  if (!market.is_closed || market.outcomes.length === 0 || market.outcome_prices.length === 0) {
    return null;
  }
  let maxIdx = 0;
  for (let i = 1; i < market.outcome_prices.length; i++) {
    if (market.outcome_prices[i] > market.outcome_prices[maxIdx]) maxIdx = i;
  }
  return market.outcome_prices[maxIdx] >= 0.95 ? market.outcomes[maxIdx] : null;
}

/**
 * Get the current price for a specific outcome in a market.
 */
function getOutcomePrice(market: MarketInfo, outcome: string): number {
  const idx = market.outcomes.findIndex(
    (o) => o.toLowerCase() === outcome.toLowerCase()
  );
  if (idx < 0 || idx >= market.outcome_prices.length) return 0;
  return market.outcome_prices[idx];
}

/**
 * Compute P&L for a set of trades belonging to a single trader.
 * This is the single source of truth for P&L calculations in the admin panel.
 */
export function computeTraderPnl(
  trades: Trade[],
  marketMap: Map<string, MarketInfo>,
): TraderPnlResult {
  // Build positions keyed by condition_id:outcome
  const posMap = new Map<string, {
    conditionId: string;
    outcome: string;
    buyShares: number;
    buyCost: number;
    sellShares: number;
    // Revenue from sells where we have actual price data (price > 0)
    knownSellRevenue: number;
    knownSellShares: number;
  }>();

  for (const t of trades) {
    const outcome = t.outcome || '';
    // Normalize to lowercase — trades record outcomes with inconsistent casing
    // (e.g. BUY as "YES", SELL as "Yes") which would split into separate positions.
    const normalizedOutcome = outcome.toLowerCase();
    const key = `${t.condition_id}:${normalizedOutcome}`;
    if (!posMap.has(key)) {
      posMap.set(key, {
        conditionId: t.condition_id,
        outcome: normalizedOutcome,
        buyShares: 0,
        buyCost: 0,
        sellShares: 0,
        knownSellRevenue: 0,
        knownSellShares: 0,
      });
    }
    const pos = posMap.get(key)!;
    const shares = Number(t.shares) || 0;
    const amount = Number(t.amount) || 0;
    const price = Number(t.price) || 0;

    if (t.side === 'BUY') {
      pos.buyShares += shares;
      pos.buyCost += amount; // amount = USDC spent for buys
    } else if (t.side === 'SELL') {
      pos.sellShares += shares;

      if (price > 0 && amount > 0) {
        // External/Polymarket trades have real price data.
        // For these, amount IS the USDC revenue.
        pos.knownSellRevenue += amount;
        pos.knownSellShares += shares;
      }
      // For internal sells (price=0): amount is just the share count, NOT USDC.
      // We skip these — no revenue data available.
    } else if (t.side === 'REDEEM') {
      // Redeems are effectively sells at resolution price ($1.00 for winners, $0 for losers)
      pos.sellShares += shares;
      if (price > 0 && amount > 0) {
        // Post-fix redeems (or legacy winners) with actual payout data
        pos.knownSellRevenue += amount;
        pos.knownSellShares += shares;
      }
      // For redeems with price=0/amount=0: either legacy or losing position.
      // Don't assume $1.00/share — let the per-position P&L loop use market
      // resolution data to determine the actual value.
    }
  }

  // Compute P&L per position
  const positions: PositionSummary[] = [];
  let totalRealized = 0;
  let totalUnrealized = 0;
  let totalInvested = 0;
  let wins = 0;
  let losses = 0;

  for (const [, pos] of posMap) {
    const market = marketMap.get(pos.conditionId);
    const isClosed = market?.is_closed || false;
    const currentPrice = market ? getOutcomePrice(market, pos.outcome) : 0;
    const resolvedWinner = market ? getResolvedWinner(market) : null;
    const isResolved = resolvedWinner !== null;

    const closedShares = Math.min(pos.buyShares, pos.sellShares);
    const openShares = pos.buyShares - closedShares;
    const avgBuyPrice = pos.buyShares > 0 ? pos.buyCost / pos.buyShares : 0;

    // Unknown-price sell shares = sold shares without price data
    const unknownSellShares = pos.sellShares - pos.knownSellShares;

    // Compute realized P&L from sells
    let realizedPnl = 0;
    let avgSellPrice = avgBuyPrice; // default: break-even assumption

    if (closedShares > 0) {
      if (pos.knownSellShares > 0) {
        // We have real price data for some/all sells
        const knownAvgSellPrice = pos.knownSellRevenue / pos.knownSellShares;

        if (unknownSellShares <= 0) {
          // ALL sells have known prices — straightforward
          avgSellPrice = knownAvgSellPrice;
        } else {
          // Mix of known and unknown sells.
          // Known sells: use real revenue.
          // Unknown sells: use market resolution if available, else break-even.
          let unknownSellPrice = avgBuyPrice; // default: break-even
          if (isResolved) {
            // Market resolved — winning outcome redeems at $1.00, losing at $0
            unknownSellPrice = pos.outcome.toLowerCase() === resolvedWinner!.toLowerCase() ? 1.0 : 0;
          }
          const unknownRevenue = unknownSellShares * unknownSellPrice;
          const totalRevenue = pos.knownSellRevenue + unknownRevenue;
          avgSellPrice = totalRevenue / pos.sellShares;
        }
        realizedPnl = (avgSellPrice - avgBuyPrice) * closedShares;
      } else {
        // NO sells have known prices (all internal with price=0).
        // Use market resolution if available, else assume break-even.
        if (isResolved) {
          avgSellPrice = pos.outcome.toLowerCase() === resolvedWinner!.toLowerCase() ? 1.0 : 0;
          realizedPnl = (avgSellPrice - avgBuyPrice) * closedShares;
        } else {
          avgSellPrice = avgBuyPrice;
          realizedPnl = 0;
        }
      }
    }

    // Unrealized P&L from remaining open shares
    let unrealizedPnl = 0;
    if (openShares > 0) {
      unrealizedPnl = (currentPrice - avgBuyPrice) * openShares;

      // For resolved/closed markets, all P&L is effectively realized
      if (isClosed) {
        realizedPnl += unrealizedPnl;
        unrealizedPnl = 0;
      }
    }

    totalRealized += realizedPnl;
    totalUnrealized += unrealizedPnl;
    totalInvested += pos.buyCost;

    // Win/loss tracking for resolved markets
    const isWinner = isResolved && pos.outcome.toLowerCase() === resolvedWinner!.toLowerCase() && pos.buyShares > 0;
    const isLoser = isResolved && pos.outcome.toLowerCase() !== resolvedWinner!.toLowerCase() && pos.buyShares > 0;
    if (isWinner) wins++;
    if (isLoser) losses++;

    // sellRevenue for display: use known revenue, or 0 if unknown
    const displaySellRevenue = pos.knownSellRevenue;

    positions.push({
      conditionId: pos.conditionId,
      outcome: pos.outcome,
      buyShares: round2(pos.buyShares),
      buyCost: round2(pos.buyCost),
      sellShares: round2(pos.sellShares),
      sellRevenue: round2(displaySellRevenue),
      openShares: round2(openShares),
      avgBuyPrice: round4(avgBuyPrice),
      avgSellPrice: round4(avgSellPrice),
      currentPrice,
      realizedPnl: round2(realizedPnl),
      unrealizedPnl: round2(unrealizedPnl),
      isClosed,
      isResolved,
      resolvedWinner,
      isWinner,
      isLoser,
    });
  }

  const netPnl = totalRealized + totalUnrealized;
  const roi = totalInvested > 0 ? (netPnl / totalInvested) * 100 : 0;

  return {
    realizedPnl: round2(totalRealized),
    unrealizedPnl: round2(totalUnrealized),
    netPnl: round2(netPnl),
    totalInvested: round2(totalInvested),
    roi: round2(roi),
    wins,
    losses,
    positions,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 || 0;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
