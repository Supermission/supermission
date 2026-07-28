// lib/uniswap/token-registry.ts
// Static map of common Base tokens with addresses + decimals.
// Required because DeFiLlama pools API returns empty token addresses.

export interface BaseToken {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}

export const BASE_TOKEN_REGISTRY: Record<string, BaseToken> = {
  'WETH':  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  'USDC':  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
  'USDbC': { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6 },
  'DAI':   { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18 },
  'cbETH': { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', decimals: 18 },
  'AERO':  { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', decimals: 18 },
  'DEGEN': { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', decimals: 18 },
  'USDT':  { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', decimals: 6 },
  'WBTC':  { address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', symbol: 'WBTC', decimals: 8 },
};

export function resolveToken(symbol: string): BaseToken | null {
  return BASE_TOKEN_REGISTRY[symbol.toUpperCase()] || BASE_TOKEN_REGISTRY[symbol] || null;
}

export function sortTokenPair(a: BaseToken, b: BaseToken): [BaseToken, BaseToken] {
  // Uniswap convention: token0.address < token1.address
  return a.address.toLowerCase() < b.address.toLowerCase() ? [a, b] : [b, a];
}
