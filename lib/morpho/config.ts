// lib/morpho/config.ts

export const MORPHO_GRAPHQL_ENDPOINT = 'https://api.morpho.org/graphql';
export const MORPHO_BLUE_BASE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const;
export const BASE_CHAIN_ID = 8453;

// Known MetaMorpho V2 USDC + WETH vaults on Base (verified via GraphQL API)
export const MORPHO_VAULTS = [
  {
    address: '0x050cE30b927Da55177A4914EC73480238BAD56f0' as const,
    name: 'Gauntlet USDC Prime',
    asset: 'USDC',
    assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
    assetDecimals: 6,
    curator: 'Gauntlet',
  },
  {
    address: '0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9' as const,
    name: 'Steakhouse Prime Instant',
    asset: 'USDC',
    assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
    assetDecimals: 6,
    curator: 'Steakhouse Financial',
  },
  {
    address: '0xbeeff7aE5E00Aae3Db302e4B0d8C883810a58100' as const,
    name: 'Steakhouse High Yield Instant',
    asset: 'USDC',
    assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
    assetDecimals: 6,
    curator: 'Steakhouse Financial',
  },
  {
    address: '0x1deEfABEe758AAbdC29a542B24ca3b75aFD56765' as const,
    name: 'Gauntlet USDC Frontier',
    asset: 'USDC',
    assetAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
    assetDecimals: 6,
    curator: 'Gauntlet',
  },
  {
    address: '0xFeFeC33668E22677c4762d0853d56245a800ff08' as const,
    name: 'Gauntlet WETH Balanced',
    asset: 'WETH',
    assetAddress: '0x4200000000000000000000000000000000000006' as const,
    assetDecimals: 18,
    curator: 'Gauntlet',
  },
  {
    address: '0xbeef00f0A818894a2Cf111644A5098421611100E' as const,
    name: 'Steakhouse Prime Instant ETH',
    asset: 'WETH',
    assetAddress: '0x4200000000000000000000000000000000000006' as const,
    assetDecimals: 18,
    curator: 'Steakhouse Financial',
  },
] as const;

export type MorphoVaultConfig = (typeof MORPHO_VAULTS)[number];
