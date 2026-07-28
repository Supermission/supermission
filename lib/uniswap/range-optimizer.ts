import type { SupportedChainId } from './types';

export interface RangeSuggestion {
  lowerTick: number;
  upperTick: number;
  lowerPrice: string;
  upperPrice: string;
  rationale: string;
  estimatedAPR: number;
  ilRisk: 'low' | 'medium' | 'high';
  confidence: number; // 0-1
}

export interface RangeParams {
  token0: string;
  token1: string;
  chainId: SupportedChainId;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  currentTick?: number;
  currentPrice?: number;
  tickSpacing?: number;
}

/** Snap a tick to the nearest valid tick aligned to tickSpacing */
export function snapToTickSpacing(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Suggest an LP range based on historical price data and volatility.
 * Uses a simple heuristic based on risk level:
 *   - Conservative: wide range (50% around current price)
 *   - Moderate: medium range (25% around current price)
 *   - Aggressive: tight range (10% around current price)
 */
export async function suggestLPRange(params: RangeParams): Promise<RangeSuggestion> {
  const { riskLevel, currentTick, currentPrice, tickSpacing } = params;

  // Use current tick or default
  const tick = currentTick || 0;
  const price = currentPrice || 1;
  const spacing = tickSpacing || 60; // default for 0.3% pools

  // Range multipliers by risk level
  const config = {
    conservative: { tickRange: 20000, aprMultiplier: 0.6, ilRisk: 'low' as const, confidence: 0.8 },
    moderate: { tickRange: 10000, aprMultiplier: 1.0, ilRisk: 'medium' as const, confidence: 0.6 },
    aggressive: { tickRange: 4000, aprMultiplier: 1.8, ilRisk: 'high' as const, confidence: 0.4 },
  }[riskLevel];

  // Snap ticks to tickSpacing alignment
  const lowerTick = snapToTickSpacing(tick - config.tickRange, spacing);
  const upperTick = snapToTickSpacing(tick + config.tickRange, spacing);

  // Price from tick: price = 1.0001^tick
  const lowerPrice = (price * Math.pow(1.0001, lowerTick - tick)).toFixed(6);
  const upperPrice = (price * Math.pow(1.0001, upperTick - tick)).toFixed(6);

  const rationales = {
    conservative: `Wide range covering ~${(config.tickRange / 100).toFixed(0)}% price movement in either direction. Lower capital efficiency but minimal risk of going out of range. Best for volatile pairs or hands-off LPing.`,
    moderate: `Balanced range covering ~${(config.tickRange / 100).toFixed(0)}% price movement. Good trade-off between capital efficiency and range coverage. Suitable for most pairs with moderate volatility.`,
    aggressive: `Tight range covering ~${(config.tickRange / 100).toFixed(0)}% price movement. High capital efficiency and fee income, but requires active management. Best for stable pairs or active LPs.`,
  };

  return {
    lowerTick,
    upperTick,
    lowerPrice,
    upperPrice,
    rationale: rationales[riskLevel],
    estimatedAPR: 15 * config.aprMultiplier, // Base estimate, would be refined with real data
    ilRisk: config.ilRisk,
    confidence: config.confidence,
  };
}
