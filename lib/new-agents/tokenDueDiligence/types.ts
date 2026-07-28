export type ChainName =
  | "ETH_MAINNET"
  | "BASE_MAINNET"
  | "BSC_MAINNET"
  | "POLYGON_MAINNET"
  | "ARBITRUM_MAINNET"
  | "OPTIMISM_MAINNET"
  | "SONIC_MAINNET"
  | "MONAD_MAINNET"
  | "SOLANA_MAINNET";

export type Recommendation = "BUY" | "HOLD" | "SELL" | "AVOID";
export type MarketTrend = "UPTREND" | "DOWNTREND" | "SIDEWAYS";
export type VolatilityLevel = "LOW" | "MEDIUM" | "HIGH";
export type MomentumStrength = "WEAK" | "MODERATE" | "STRONG";
export type QualityLevel = "LOW" | "MEDIUM" | "HIGH";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface TokenIdentity {
  name: string;
  symbol: string;
  chain: ChainName;
  address: string;
  logo?: string;
  description?: string;
  website?: string;
  socials?: {
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
  verified: boolean;
  category?: string;
}

export interface Verdict {
  overall: RiskLevel;
  confidence: number; // 0 → 1
  recommendation: {
    trade: Recommendation;
    invest: Recommendation;
  };
  summary: string;
  keyFactors: string[];
}

export interface PriceData {
  current: number;
  currency: "USD";
  percentChange: {
    "1h"?: number;
    "24h"?: number;
    "7d"?: number;
    "30d"?: number;
    "60d"?: number;
    "90d"?: number;
  };
  volume24h: number;
  marketCap?: number;
  fdv?: number;
  lastUpdated: string;
}

export interface MarketHealth {
  trend: MarketTrend;
  volatility: VolatilityLevel;
  momentum: MomentumStrength;
  avgVolumePerMinUsd: number;
  volumeQuality: QualityLevel;
}

export interface Tokenomics {
  totalSupply: number;
  circulatingSupply?: number;
  maxSupply?: number;
  fdvToMarketCapRatio?: number;
  isMintable: boolean;
  burnedSupplyPercent?: number;
  inflationRisk: RiskLevel;
}

export interface HolderAnalysis {
  count: number;
  top10Percent: number;
  top50Percent: number;
  creatorPercent: number;
  contractHolderPercent: number;
  giniCoefficient?: number;
  nakamotoCoefficient?: number;
  concentrationRisk: RiskLevel;
}

export interface LiquidityAnalysis {
  totalUsd: number;
  dexCount: number;
  primaryDex?: string;
  lpLockedPercent?: number;
  lpHolderCount: number;
  liquidityRisk: RiskLevel;
}

export interface MarketSnapshot {
  hasMarketData: boolean;
  avgVolumeUsdPerMin: number;
  liquidityQuality: "LOW" | "MEDIUM" | "HIGH";
  volatility: "LOW" | "MEDIUM" | "HIGH";
  trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";
  manipulationRisk: "LOW" | "MEDIUM" | "HIGH";
  signals: {
    lowLiquidity?: boolean;
    highVolatility?: boolean;
    highHolderConcentration?: boolean;
  };
}

export interface RiskSummary {
  overall: RiskLevel;
  scamRisk: RiskLevel;
  rugRisk: RiskLevel;
  liquidityRisk: RiskLevel;
  manipulationRisk: RiskLevel;
}

export interface DataSources {
  identity?: "CoinGecko" | "1inch";
  price?: "1inch";
  security?: "GoPlus";
  ohlcv?: "CoinDesk";
}

export interface SecurityAnalysis {
  isHoneypot: boolean;
  buyTaxPercent?: number;
  sellTaxPercent?: number;
  canMint: boolean;
  canPauseTransfers: boolean;
  canChangeOwnership: boolean;
  hiddenOwner: boolean;
  proxyContract: boolean;
  selfDestruct: boolean;
  openSource: boolean;
  securityScore: number; // 0 → 100
}

// New interface to track data availability
export interface DataAvailability {
  identity: boolean;
  price: boolean;
  security: boolean;
  ohlcv: boolean;
}

export interface TokenDueDiligenceResponse {
  token: TokenIdentity;
  verdict: Verdict;
  price: PriceData | undefined;
  market: MarketHealth;
  tokenomics: Tokenomics;
  holders: HolderAnalysis;
  liquidity: LiquidityAnalysis;
  security: SecurityAnalysis | undefined;
  marketSnapshot: MarketSnapshot;
  risk: RiskSummary;
  sources: DataSources;
  dataAvailability: DataAvailability;  // New field
  failedSources?: string[];  // New field to track failures
  lastUpdated: string; // ISO timestamp
}