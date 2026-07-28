/**
 * Comprehensive TypeScript types for Wallet Intelligence Agent
 * Supports multi-chain analysis with NFT, DeFi, and portfolio optimization
 */

// ============================================
// CHAIN CONFIGURATION
// ============================================

export type SupportedChain = 'base' | 'polygon' | 'ethereum' | 'arbitrum';

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
}

// ============================================
// TOKEN DATA
// ============================================

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string; // Raw balance as string
  balanceFormatted: string; // Human-readable balance
  balanceUSD: number;
  price?: number;
  logo?: string;
  isSpam?: boolean; // Detected scam/spam token
}

export interface TokenMetadata {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
  price?: number;
}

// ============================================
// NFT DATA
// ============================================

export interface NFTCollection {
  contractAddress: string;
  name: string;
  symbol?: string;
  tokenCount: number; // Number of NFTs owned in this collection
  floorPrice?: number; // In USD
  estimatedValue?: number; // floorPrice * tokenCount
  isBlueChip?: boolean; // Known high-value collection
  tokens: NFTToken[];
}

export interface NFTToken {
  tokenId: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

// ============================================
// DEFI DATA
// ============================================

export interface DeFiPosition {
  protocol: string; // e.g., "Aave", "Uniswap V3", "Compound"
  type: 'lending' | 'borrowing' | 'liquidity' | 'staking';
  asset: string; // Token symbol
  amount: string;
  valueUSD: number;
  healthFactor?: number; // For lending protocols
  apr?: number; // Annual percentage rate
}

// ============================================
// TRANSACTION DATA
// ============================================

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  blockNumber: number;
  status: 'success' | 'failed';
}

// ============================================
// SOCIAL IDENTITY
// ============================================

export interface SocialIdentity {
  ens?: string;
  lens?: string;
  farcaster?: string;
}

// ============================================
// CHAIN-SPECIFIC DATA
// ============================================

export interface ChainData {
  chainId: number;
  chainName: string;
  nativeBalance: string; // Raw balance
  nativeBalanceFormatted: string; // Human-readable
  nativeBalanceUSD: number;
  tokenBalances: TokenBalance[];
  nftCollections: NFTCollection[];
  defiPositions: DeFiPosition[];
  totalValueUSD: number; // Native + tokens + NFTs + DeFi
  transactionCount: number;
  lastActivity?: number; // Unix timestamp
}

// ============================================
// PORTFOLIO ANALYSIS
// ============================================

export interface PortfolioAnalysis {
  diversificationScore: number; // 0-100 (100 = perfectly diversified)
  concentrationRisk: 'high' | 'medium' | 'low';
  topHoldings: Array<{
    asset: string;
    percentageOfPortfolio: number;
    valueUSD: number;
  }>;
  stablecoinRatio: number; // 0-1 (percentage of portfolio in stablecoins)
  chainDistribution: Array<{
    chain: string;
    percentageOfPortfolio: number;
    valueUSD: number;
  }>;
}

// ============================================
// RISK ANALYSIS
// ============================================

export interface RiskAnalysis {
  overallScore: number; // 0-100 (0 = very risky, 100 = very safe)
  scamTokensDetected: number;
  dangerousApprovals: number;
  phishingRisk: 'high' | 'medium' | 'low';
  warnings: string[];
}

// ============================================
// BEHAVIOR ANALYSIS
// ============================================

export type WalletType =
  | 'whale'
  | 'institutional'
  | 'trader'
  | 'defi_power_user'
  | 'nft_collector'
  | 'casual'
  | 'dormant'
  | 'new';

export type ActivityLevel = 'very_high' | 'high' | 'medium' | 'low' | 'dormant';

export interface BehaviorAnalysis {
  walletType: WalletType;
  activityLevel: ActivityLevel;
  isWhale: boolean; // Portfolio > $100k
  isNFTCollector: boolean;
  isDefiUser: boolean;
  isTrader: boolean; // High transaction frequency
  crossChainActivity: boolean; // Active on multiple chains
}

// ============================================
// AI-GENERATED PROFILE
// ============================================

export interface AIProfile {
  walletType: WalletType;
  riskScore: number;
  activityLevel: ActivityLevel;
  estimatedPortfolioUSD: string;
  profile: {
    summary: string; // 2-3 sentence narrative
    characteristics: string[]; // Key traits
    likelyBehavior: string;
    notablePatterns: string[];
  };
  nftActivity: {
    isNFTCollector: boolean;
    behavior: 'holder' | 'flipper' | 'minter' | 'none';
    collectionPreference: 'blue-chip' | 'emerging' | 'mixed' | 'none';
  };
  defiActivity: {
    isDefiUser: boolean;
    estimatedProtocols: string[];
    activityPatterns: string;
  };
  portfolioInsights: {
    diversificationScore: number;
    concentrationRisk: 'high' | 'medium' | 'low';
    stablecoinRatio: number;
  };
  securityInsights: {
    scamTokensDetected: number;
    dangerousApprovals: number;
    phishingRisk: 'high' | 'medium' | 'low';
  };
  recommendations: Array<{
    category: 'security' | 'optimization' | 'diversification' | 'defi' | 'gas';
    priority: 'high' | 'medium' | 'low';
    action: string;
    reason: string;
  }>;
  warnings: string[];
}

// ============================================
// API REQUEST/RESPONSE
// ============================================

export interface WalletIntelligenceRequest {
  walletAddress: string;
  chains?: SupportedChain[]; // Subset of supported chains
  depth?: 'quick' | 'standard'; // quick=30s, standard=60s
  includeLLM?: boolean; // Default: true
}

export interface WalletIntelligenceResponse {
  success: boolean;
  agentId: string;
  paymentReceived?: string;
  missionId?: string;
  data: {
    walletAddress: string;
    socialIdentity: SocialIdentity;
    summary: {
      totalPortfolioUSD: number;
      totalChainsActive: number;
      totalTokens: number;
      totalNFTs: number;
      totalDeFiPositions: number;
      overallRiskScore: number;
    };
    chains: ChainData[];
    portfolioAnalysis: PortfolioAnalysis;
    riskAnalysis: RiskAnalysis;
    behaviorAnalysis: BehaviorAnalysis;
    aiProfile?: AIProfile; // Only if includeLLM=true
  };
  executionTimeMs: number;
}

// ============================================
// INTERNAL TYPES (for orchestration)
// ============================================

export interface EnrichedChainData extends ChainData {
  enrichmentStatus: 'complete' | 'partial' | 'failed';
  errors?: string[];
}

export interface OrchestratorResult {
  chains: EnrichedChainData[];
  aggregatedData: {
    totalValueUSD: number;
    allTokens: TokenBalance[];
    allNFTs: NFTCollection[];
    allDeFiPositions: DeFiPosition[];
  };
  executionTimeMs: number;
}
