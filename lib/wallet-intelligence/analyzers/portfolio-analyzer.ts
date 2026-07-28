/**
 * Portfolio Analyzer
 * Calculates diversification score, concentration risk, and rebalancing suggestions
 */

import type {
  TokenBalance,
  NFTCollection,
  DeFiPosition,
  ChainData,
  PortfolioAnalysis,
} from '../types';
import { calculateStablecoinRatio } from '../enrichers/token-enricher';
import type { SupportedChain } from '../types';

/**
 * Calculate Herfindahl-Hirschman Index (HHI) for diversification
 * HHI ranges from 0 to 10,000:
 * - Below 1,500: Highly diversified
 * - 1,500-2,500: Moderately diversified
 * - Above 2,500: Highly concentrated
 */
function calculateHHI(holdings: Array<{ valueUSD: number }>): number {
  const totalValue = holdings.reduce((sum, h) => sum + h.valueUSD, 0);

  if (totalValue === 0) return 0;

  const hhi = holdings.reduce((sum, holding) => {
    const marketShare = (holding.valueUSD / totalValue) * 100;
    return sum + marketShare ** 2;
  }, 0);

  return Math.round(hhi);
}

/**
 * Convert HHI to a 0-100 diversification score
 * Higher score = better diversification
 */
function hhiToDiversificationScore(hhi: number): number {
  if (hhi === 0) return 0;
  if (hhi >= 10000) return 0; // Completely concentrated

  // Invert HHI to score: 0 HHI = 100 score, 10000 HHI = 0 score
  // Use logarithmic scale for better distribution
  const score = Math.max(0, 100 - (hhi / 100));
  return Math.round(score);
}

/**
 * Determine concentration risk level
 */
function determineConcentrationRisk(hhi: number): 'high' | 'medium' | 'low' {
  if (hhi >= 2500) return 'high';
  if (hhi >= 1500) return 'medium';
  return 'low';
}

/**
 * Get top holdings by percentage of portfolio
 */
function getTopHoldings(
  tokens: TokenBalance[],
  nfts: NFTCollection[],
  defi: DeFiPosition[],
  nativeBalances: Array<{ chain: string; valueUSD: number }>,
  limit: number = 3
): Array<{ asset: string; percentageOfPortfolio: number; valueUSD: number }> {
  const totalValue =
    tokens.reduce((sum, t) => sum + t.balanceUSD, 0) +
    nfts.reduce((sum, n) => sum + (n.estimatedValue || 0), 0) +
    defi.reduce((sum, d) => sum + d.valueUSD, 0) +
    nativeBalances.reduce((sum, n) => sum + n.valueUSD, 0);

  if (totalValue === 0) return [];

  // Combine all holdings
  const allHoldings: Array<{ asset: string; valueUSD: number }> = [];

  // Add tokens
  tokens.forEach((token) => {
    allHoldings.push({ asset: token.symbol, valueUSD: token.balanceUSD });
  });

  // Add native balances
  nativeBalances.forEach((native) => {
    allHoldings.push({ asset: native.chain, valueUSD: native.valueUSD });
  });

  // Add NFT collections
  nfts.forEach((nft) => {
    if (nft.estimatedValue) {
      allHoldings.push({ asset: `${nft.name} NFTs`, valueUSD: nft.estimatedValue });
    }
  });

  // Add DeFi positions
  defi.forEach((position) => {
    allHoldings.push({
      asset: `${position.protocol} ${position.asset}`,
      valueUSD: position.valueUSD,
    });
  });

  // Sort by value and take top N
  return allHoldings
    .sort((a, b) => b.valueUSD - a.valueUSD)
    .slice(0, limit)
    .map((holding) => ({
      asset: holding.asset,
      percentageOfPortfolio: (holding.valueUSD / totalValue) * 100,
      valueUSD: holding.valueUSD,
    }));
}

/**
 * Calculate chain distribution
 */
function getChainDistribution(
  chains: ChainData[]
): Array<{ chain: string; percentageOfPortfolio: number; valueUSD: number }> {
  const totalValue = chains.reduce((sum, chain) => sum + chain.totalValueUSD, 0);

  if (totalValue === 0) return [];

  return chains
    .map((chain) => ({
      chain: chain.chainName,
      percentageOfPortfolio: (chain.totalValueUSD / totalValue) * 100,
      valueUSD: chain.totalValueUSD,
    }))
    .sort((a, b) => b.valueUSD - a.valueUSD);
}

/**
 * Analyze portfolio diversification and concentration
 */
export function analyzePortfolio(
  chains: ChainData[],
  aggregatedTokens: TokenBalance[],
  aggregatedNFTs: NFTCollection[],
  aggregatedDeFi: DeFiPosition[]
): PortfolioAnalysis {
  // Get native balances from each chain
  const nativeBalances = chains.map((chain) => ({
    chain: chain.chainName,
    valueUSD: chain.nativeBalanceUSD,
  }));

  // Prepare all holdings for HHI calculation
  const allHoldings: Array<{ valueUSD: number }> = [
    ...aggregatedTokens.map((t) => ({ valueUSD: t.balanceUSD })),
    ...nativeBalances.map((n) => ({ valueUSD: n.valueUSD })),
    ...aggregatedNFTs.map((n) => ({ valueUSD: n.estimatedValue || 0 })),
    ...aggregatedDeFi.map((d) => ({ valueUSD: d.valueUSD })),
  ].filter((h) => h.valueUSD > 0);

  // Calculate HHI and diversification score
  const hhi = calculateHHI(allHoldings);
  const diversificationScore = hhiToDiversificationScore(hhi);
  const concentrationRisk = determineConcentrationRisk(hhi);

  // Get top holdings
  const topHoldings = getTopHoldings(
    aggregatedTokens,
    aggregatedNFTs,
    aggregatedDeFi,
    nativeBalances
  );

  // Calculate stablecoin ratio (average across chains)
  let totalStablecoinValue = 0;
  let totalTokenValue = 0;

  chains.forEach((chain) => {
    const chainTokens = chain.tokenBalances;
    const chainStablecoins = chainTokens.filter((token) =>
      token.symbol.match(/^(USDC|USDT|DAI|BUSD|FRAX|USDbC)$/i)
    );
    totalStablecoinValue += chainStablecoins.reduce((sum, t) => sum + t.balanceUSD, 0);
    totalTokenValue += chainTokens.reduce((sum, t) => sum + t.balanceUSD, 0);
  });

  const stablecoinRatio = totalTokenValue > 0 ? totalStablecoinValue / totalTokenValue : 0;

  // Get chain distribution
  const chainDistribution = getChainDistribution(chains);

  return {
    diversificationScore,
    concentrationRisk,
    topHoldings,
    stablecoinRatio,
    chainDistribution,
  };
}

/**
 * Generate portfolio optimization recommendations
 */
export function generateOptimizationRecommendations(
  analysis: PortfolioAnalysis,
  totalValueUSD: number
): Array<{
  category: 'optimization' | 'diversification';
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
}> {
  const recommendations: Array<{
    category: 'optimization' | 'diversification';
    priority: 'high' | 'medium' | 'low';
    action: string;
    reason: string;
  }> = [];

  // High concentration risk
  if (analysis.concentrationRisk === 'high' && totalValueUSD > 1000) {
    const topAsset = analysis.topHoldings[0];
    if (topAsset && topAsset.percentageOfPortfolio > 70) {
      recommendations.push({
        category: 'diversification',
        priority: 'high',
        action: `Reduce ${topAsset.asset} allocation from ${topAsset.percentageOfPortfolio.toFixed(0)}% to 60% or less`,
        reason: `Extreme concentration in a single asset increases risk. Aim for max 50-60% in any one holding.`,
      });
    }
  }

  // Moderate concentration risk
  if (analysis.concentrationRisk === 'medium' && totalValueUSD > 500) {
    recommendations.push({
      category: 'diversification',
      priority: 'medium',
      action: 'Consider diversifying into 2-3 additional assets',
      reason: `Portfolio is moderately concentrated (diversification score: ${analysis.diversificationScore}). Adding more positions can reduce risk.`,
    });
  }

  // Low stablecoin allocation (risky in volatile markets)
  if (analysis.stablecoinRatio < 0.1 && totalValueUSD > 1000) {
    recommendations.push({
      category: 'optimization',
      priority: 'medium',
      action: `Increase stablecoin allocation from ${(analysis.stablecoinRatio * 100).toFixed(0)}% to 10-20%`,
      reason: 'Low stablecoin allocation provides no downside protection. Consider 10-20% in USDC/DAI as a buffer.',
    });
  }

  // Very high stablecoin allocation (missing upside)
  if (analysis.stablecoinRatio > 0.7 && totalValueUSD > 500) {
    recommendations.push({
      category: 'optimization',
      priority: 'low',
      action: `Consider reducing stablecoin allocation from ${(analysis.stablecoinRatio * 100).toFixed(0)}% to 50-60%`,
      reason: 'High stablecoin allocation limits upside potential. Consider diversifying into blue-chip assets.',
    });
  }

  // Single chain (missing multi-chain opportunities)
  if (analysis.chainDistribution.length === 1 && totalValueUSD > 2000) {
    recommendations.push({
      category: 'diversification',
      priority: 'low',
      action: 'Explore opportunities on other chains (Ethereum, Arbitrum, BSC)',
      reason: 'Single-chain exposure limits opportunities. Bridging assets can unlock better yields and diversification.',
    });
  }

  // Perfect diversification (praise!)
  if (analysis.diversificationScore >= 80 && analysis.stablecoinRatio > 0.1 && analysis.stablecoinRatio < 0.4) {
    recommendations.push({
      category: 'optimization',
      priority: 'low',
      action: 'Portfolio is well-diversified - maintain current allocation',
      reason: `Excellent diversification score (${analysis.diversificationScore}) with balanced stablecoin allocation.`,
    });
  }

  return recommendations;
}
