/**
 * Behavior Analyzer
 * Classifies wallet type, activity level, and behavioral patterns
 */

import type {
  WalletType,
  ActivityLevel,
  BehaviorAnalysis,
  ChainData,
  TokenBalance,
  NFTCollection,
  DeFiPosition,
} from '../types';

/**
 * Classify wallet type based on portfolio composition and activity
 */
function classifyWalletType(
  totalValueUSD: number,
  tokenCount: number,
  nftCount: number,
  defiPositionCount: number,
  transactionCount: number,
  hasMultipleChains: boolean
): WalletType {
  // New wallet: Very little activity
  if (transactionCount < 5 && totalValueUSD < 100) {
    return 'new';
  }

  // Dormant: No recent activity (we don't have timestamps, so using value as proxy)
  if (transactionCount < 10 && totalValueUSD < 50) {
    return 'dormant';
  }

  // Whale: High portfolio value
  if (totalValueUSD >= 100000) {
    return 'whale';
  }

  // Institutional: Very high value + multi-chain + DeFi
  if (totalValueUSD >= 50000 && hasMultipleChains && defiPositionCount > 0) {
    return 'institutional';
  }

  // DeFi power user: Multiple DeFi positions
  if (defiPositionCount >= 3) {
    return 'defi_power_user';
  }

  // NFT collector: Significant NFT holdings
  if (nftCount >= 5 && nftCount > tokenCount) {
    return 'nft_collector';
  }

  // Trader: High transaction count relative to holdings
  if (transactionCount > 100 && tokenCount > 5) {
    return 'trader';
  }

  // Default: Casual user
  return 'casual';
}

/**
 * Determine activity level based on transaction count
 */
function determineActivityLevel(transactionCount: number): ActivityLevel {
  if (transactionCount >= 1000) return 'very_high';
  if (transactionCount >= 500) return 'high';
  if (transactionCount >= 100) return 'medium';
  if (transactionCount >= 10) return 'low';
  return 'dormant';
}

/**
 * Detect if wallet is a whale (> $100k portfolio)
 */
function isWhale(totalValueUSD: number): boolean {
  return totalValueUSD >= 100000;
}

/**
 * Detect if wallet is an NFT collector
 */
function isNFTCollector(nftCount: number, nftValueUSD: number): boolean {
  return nftCount >= 5 || nftValueUSD >= 5000;
}

/**
 * Detect if wallet is a DeFi user
 */
function isDefiUser(defiPositionCount: number): boolean {
  return defiPositionCount > 0;
}

/**
 * Detect if wallet is a trader (high activity)
 */
function isTrader(transactionCount: number, tokenCount: number): boolean {
  // High transaction count + diverse token holdings
  return transactionCount > 100 && tokenCount > 10;
}

/**
 * Detect cross-chain activity
 */
function hasCrossChainActivity(chains: ChainData[]): boolean {
  return chains.filter((chain) => chain.totalValueUSD > 0).length > 1;
}

/**
 * Main behavior analysis function
 */
export function analyzeBehavior(
  chains: ChainData[],
  aggregatedTokens: TokenBalance[],
  aggregatedNFTs: NFTCollection[],
  aggregatedDeFi: DeFiPosition[],
  totalValueUSD: number
): BehaviorAnalysis {
  // Calculate metrics
  const tokenCount = aggregatedTokens.length;
  const nftCount = aggregatedNFTs.reduce((sum, collection) => sum + collection.tokenCount, 0);
  const nftValueUSD = aggregatedNFTs.reduce(
    (sum, collection) => sum + (collection.estimatedValue || 0),
    0
  );
  const defiPositionCount = aggregatedDeFi.length;
  const transactionCount = chains.reduce((sum, chain) => sum + chain.transactionCount, 0);
  const crossChainActivity = hasCrossChainActivity(chains);

  // Classify wallet type
  const walletType = classifyWalletType(
    totalValueUSD,
    tokenCount,
    nftCount,
    defiPositionCount,
    transactionCount,
    crossChainActivity
  );

  // Determine activity level
  const activityLevel = determineActivityLevel(transactionCount);

  return {
    walletType,
    activityLevel,
    isWhale: isWhale(totalValueUSD),
    isNFTCollector: isNFTCollector(nftCount, nftValueUSD),
    isDefiUser: isDefiUser(defiPositionCount),
    isTrader: isTrader(transactionCount, tokenCount),
    crossChainActivity,
  };
}

/**
 * Generate behavioral insights text
 */
export function generateBehaviorInsights(
  analysis: BehaviorAnalysis,
  totalValueUSD: number
): {
  summary: string;
  characteristics: string[];
  likelyBehavior: string;
} {
  const characteristics: string[] = [];
  let likelyBehavior = '';

  // Build characteristics list
  if (analysis.isWhale) {
    characteristics.push('High-value wallet (whale)');
  }

  if (analysis.isDefiUser) {
    characteristics.push('Active DeFi participant');
  }

  if (analysis.isNFTCollector) {
    characteristics.push('NFT collector');
  }

  if (analysis.isTrader) {
    characteristics.push('Active trader');
  }

  if (analysis.crossChainActivity) {
    characteristics.push('Multi-chain user');
  }

  if (analysis.activityLevel === 'very_high' || analysis.activityLevel === 'high') {
    characteristics.push('Highly active');
  }

  // Determine likely behavior based on wallet type
  switch (analysis.walletType) {
    case 'whale':
      likelyBehavior =
        'Long-term holder with significant capital. Likely follows market trends closely and may influence smaller markets.';
      break;
    case 'institutional':
      likelyBehavior =
        'Professional entity or fund managing assets across chains. Focuses on risk-adjusted returns and diversification.';
      break;
    case 'defi_power_user':
      likelyBehavior =
        'Experienced DeFi user actively seeking yield opportunities. Comfortable with protocol complexity and smart contract risk.';
      break;
    case 'nft_collector':
      likelyBehavior =
        'NFT enthusiast who values digital collectibles. May be a holder, flipper, or supporter of specific communities.';
      break;
    case 'trader':
      likelyBehavior =
        'Active trader seeking short to medium-term gains. Frequently moves between positions and monitors markets closely.';
      break;
    case 'casual':
      likelyBehavior =
        'Casual crypto user exploring the ecosystem. May be learning about DeFi, NFTs, or holding long-term positions.';
      break;
    case 'dormant':
      likelyBehavior =
        'Inactive wallet with minimal recent activity. May be holding long-term or have abandoned the wallet.';
      break;
    case 'new':
      likelyBehavior =
        'New to crypto or this chain. Likely experimenting with small amounts while learning the ecosystem.';
      break;
  }

  // Generate summary
  const valueTier = totalValueUSD >= 100000 ? 'large' : totalValueUSD >= 10000 ? 'substantial' : totalValueUSD >= 1000 ? 'moderate' : 'small';
  const summary = `${analysis.walletType === 'new' ? 'New' : analysis.walletType === 'dormant' ? 'Dormant' : 'Active'} ${analysis.walletType.replace('_', ' ')} with ${valueTier} portfolio ($${totalValueUSD.toLocaleString()}). ` +
    `${analysis.activityLevel === 'very_high' || analysis.activityLevel === 'high' ? 'Highly engaged' : analysis.activityLevel === 'medium' ? 'Moderately active' : 'Limited activity'} ` +
    `${analysis.crossChainActivity ? 'across multiple chains' : 'on a single chain'}.`;

  return {
    summary,
    characteristics,
    likelyBehavior,
  };
}

/**
 * Detect notable behavioral patterns
 */
export function detectNotablePatterns(
  analysis: BehaviorAnalysis,
  chains: ChainData[],
  aggregatedDeFi: DeFiPosition[]
): string[] {
  const patterns: string[] = [];

  // Multi-chain sophistication
  if (analysis.crossChainActivity) {
    const activeChains = chains.filter((c) => c.totalValueUSD > 0).length;
    patterns.push(`Active on ${activeChains} chains (multi-chain user)`);
  }

  // DeFi engagement
  if (analysis.isDefiUser) {
    const protocols = new Set(aggregatedDeFi.map((p) => p.protocol));
    if (protocols.size > 1) {
      patterns.push(`Engaged with ${protocols.size} DeFi protocols`);
    }
  }

  // High-value concentration
  const chainWithMostValue = chains.reduce((prev, current) =>
    current.totalValueUSD > prev.totalValueUSD ? current : prev
  );
  const concentrationPct = (chainWithMostValue.totalValueUSD / chains.reduce((sum, c) => sum + c.totalValueUSD, 0)) * 100;
  if (concentrationPct > 90 && chains.length > 1) {
    patterns.push(`${concentrationPct.toFixed(0)}% of portfolio on ${chainWithMostValue.chainName}`);
  }

  // NFT activity
  if (analysis.isNFTCollector) {
    patterns.push('Active NFT collector');
  }

  // Trading activity
  if (analysis.isTrader) {
    patterns.push('Frequent trader (high transaction count)');
  }

  return patterns;
}
