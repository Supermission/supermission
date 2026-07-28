/**
 * DeFi Enricher
 * Detects lending, borrowing, liquidity, and staking positions
 */

import { type Address } from 'viem';
import { getQuickNodeClient } from '../../quicknode/client';
import { DEFI_PROTOCOLS } from '../../quicknode/config';
import type { SupportedChain, DeFiPosition, TokenBalance } from '../types';

// Known protocol tokens (aTokens, cTokens, LP tokens)
const PROTOCOL_TOKEN_PATTERNS = {
  aave: /^a[A-Z]+$/, // aUSDC, aETH, etc.
  compound: /^c[A-Z]+$/, // cUSDC, cETH, etc.
  uniswap: /UNI-V[234]-LP|UNI-V4/, // Uniswap LP tokens (v2, v3, v4)
  uniswapV4: /^UNI-V4-|^UV4-/, // Uniswap v4 position tokens
  quickswap: /QUICK-LP/, // QuickSwap LP tokens
};

/**
 * Detect if token is a protocol token (aToken, cToken, LP token)
 */
function detectProtocolToken(symbol: string): {
  isProtocol: boolean;
  protocol?: string;
  type?: 'lending' | 'liquidity';
} {
  // Aave aTokens
  if (PROTOCOL_TOKEN_PATTERNS.aave.test(symbol)) {
    return { isProtocol: true, protocol: 'Aave', type: 'lending' };
  }

  // Compound cTokens
  if (PROTOCOL_TOKEN_PATTERNS.compound.test(symbol)) {
    return { isProtocol: true, protocol: 'Compound', type: 'lending' };
  }

  // Uniswap v4 position tokens
  if (PROTOCOL_TOKEN_PATTERNS.uniswapV4.test(symbol)) {
    return { isProtocol: true, protocol: 'Uniswap v4', type: 'liquidity' };
  }

  // Uniswap LP tokens (v2/v3/v4)
  if (PROTOCOL_TOKEN_PATTERNS.uniswap.test(symbol)) {
    return { isProtocol: true, protocol: 'Uniswap', type: 'liquidity' };
  }

  // QuickSwap LP tokens
  if (PROTOCOL_TOKEN_PATTERNS.quickswap.test(symbol)) {
    return { isProtocol: true, protocol: 'QuickSwap', type: 'liquidity' };
  }

  return { isProtocol: false };
}

/**
 * Extract underlying asset from protocol token
 * e.g., aUSDC -> USDC, cETH -> ETH
 */
function extractUnderlyingAsset(symbol: string, protocol: string): string {
  if (protocol === 'Aave' && symbol.startsWith('a')) {
    return symbol.substring(1);
  }

  if (protocol === 'Compound' && symbol.startsWith('c')) {
    return symbol.substring(1);
  }

  // For LP tokens, keep the full symbol
  return symbol;
}

/**
 * Detect DeFi positions from token balances
 */
export function detectDeFiPositions(
  chain: SupportedChain,
  tokens: TokenBalance[]
): DeFiPosition[] {
  const positions: DeFiPosition[] = [];

  tokens.forEach((token) => {
    const detection = detectProtocolToken(token.symbol);

    if (detection.isProtocol && detection.protocol && detection.type) {
      const underlyingAsset = extractUnderlyingAsset(token.symbol, detection.protocol);

      positions.push({
        protocol: detection.protocol,
        type: detection.type,
        asset: underlyingAsset,
        amount: token.balanceFormatted,
        valueUSD: token.balanceUSD,
        healthFactor: undefined, // Would require contract call
        apr: undefined, // Would require protocol-specific API
      });
    }
  });

  return positions;
}

/**
 * Calculate total DeFi position value
 */
export function calculateTotalDeFiValue(positions: DeFiPosition[]): number {
  return positions.reduce((sum, position) => sum + position.valueUSD, 0);
}

/**
 * Get unique protocols used
 */
export function getUniqueProtocols(positions: DeFiPosition[]): string[] {
  const protocols = new Set(positions.map((p) => p.protocol));
  return Array.from(protocols);
}

/**
 * Detect if wallet is a DeFi power user
 * Criteria: Has positions in 2+ protocols OR total DeFi value > $1000
 */
export function isDeFiPowerUser(positions: DeFiPosition[]): boolean {
  const uniqueProtocols = getUniqueProtocols(positions);
  const totalValue = calculateTotalDeFiValue(positions);

  return uniqueProtocols.length >= 2 || totalValue >= 1000;
}

/**
 * Calculate lending vs liquidity distribution
 */
export function getDeFiDistribution(positions: DeFiPosition[]): {
  lending: number;
  liquidity: number;
  borrowing: number;
  staking: number;
} {
  const distribution = {
    lending: 0,
    liquidity: 0,
    borrowing: 0,
    staking: 0,
  };

  positions.forEach((position) => {
    distribution[position.type] += position.valueUSD;
  });

  return distribution;
}

/**
 * Generate DeFi activity summary
 */
export function generateDeFiSummary(positions: DeFiPosition[]): string {
  if (positions.length === 0) {
    return 'No DeFi positions detected';
  }

  const protocols = getUniqueProtocols(positions);
  const totalValue = calculateTotalDeFiValue(positions);
  const distribution = getDeFiDistribution(positions);

  const parts: string[] = [];

  // Protocol engagement
  if (protocols.length === 1) {
    parts.push(`Active on ${protocols[0]}`);
  } else {
    parts.push(`Active across ${protocols.length} protocols (${protocols.join(', ')})`);
  }

  // Position types
  const activeTypes: string[] = [];
  if (distribution.lending > 0) activeTypes.push('lending');
  if (distribution.liquidity > 0) activeTypes.push('liquidity provision');
  if (distribution.borrowing > 0) activeTypes.push('borrowing');
  if (distribution.staking > 0) activeTypes.push('staking');

  if (activeTypes.length > 0) {
    parts.push(`engaged in ${activeTypes.join(' and ')}`);
  }

  // Total value
  parts.push(`with $${totalValue.toFixed(2)} in positions`);

  return parts.join(', ');
}

/**
 * Get top DeFi positions by value
 */
export function getTopDeFiPositions(
  positions: DeFiPosition[],
  limit: number = 5
): DeFiPosition[] {
  return [...positions].sort((a, b) => b.valueUSD - a.valueUSD).slice(0, limit);
}
