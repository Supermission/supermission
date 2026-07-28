// lib/morpho/types.ts

/** A MetaMorpho vault on Base */
export interface MorphoVault {
  address: string;
  name: string;
  symbol: string;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  curator: string;
  apy: {
    net: number;   // net APY as decimal (0.045 = 4.5%)
    base: number;
    rewards: number;
  };
  tvl: number;           // total value locked in USD
  totalAssets: string;   // raw total assets in vault
  fee: number;           // performance fee as decimal (0.10 = 10%)
  allocations: MorphoAllocation[];
  metadata: {
    description?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    reasons?: string[];
  };
}

/** Allocation to a Morpho Blue market within a vault */
export interface MorphoAllocation {
  marketId: string;
  collateralAsset: {
    address: string;
    symbol: string;
  };
  loanAsset: {
    address: string;
    symbol: string;
  };
  lltv: number;
  supplyApy: number;
  allocationPercentage: number;
}

/** User position in a Morpho vault */
export interface MorphoPosition {
  vaultAddress: string;
  vaultName: string;
  asset: string;
  shares: string;
  assetsUsd: number;
  assetsFormatted: string;
  apy: number;
}

