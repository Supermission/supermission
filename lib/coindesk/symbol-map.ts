/**
 * CoinDesk Symbol Mapping
 * Maps token contract addresses and chain IDs to CoinDesk API symbols
 */

// Chain ID → native token CoinDesk symbol
const NATIVE_TOKEN_SYMBOLS: Record<number, string> = {
  1: 'ETH',      // Ethereum
  8453: 'ETH',   // Base
  137: 'MATIC',  // Polygon
  42161: 'ETH',  // Arbitrum
  56: 'BNB',     // BSC
  10: 'ETH',     // Optimism
};

// Token contract address (lowercase) → CoinDesk symbol
const TOKEN_ADDRESS_TO_SYMBOL: Record<string, string> = {
  // USDC
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'USDC', // Base
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 'USDC', // Polygon
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'USDC', // Polygon USDC.e
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC', // Ethereum
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'USDC', // Arbitrum
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'USDC', // BSC

  // USDT
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'USDT', // Polygon
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT', // Ethereum
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT', // Arbitrum
  '0x55d398326f99059ff775485246999027b3197955': 'USDT', // BSC

  // DAI
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 'DAI',  // Base
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': 'DAI',  // Polygon
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',  // Ethereum
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 'DAI',  // Arbitrum
  '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': 'DAI',  // BSC

  // WETH
  '0x4200000000000000000000000000000000000006': 'ETH',  // Base WETH
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 'ETH',  // Polygon WETH
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'ETH',  // Ethereum WETH
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'ETH',  // Arbitrum WETH
  '0x2170ed0880ac9a755fd29b2688956bd959f933f8': 'ETH',  // BSC ETH

  // WBTC
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'BTC',  // Polygon WBTC
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'BTC',  // Ethereum WBTC
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'BTC',  // Arbitrum WBTC

  // LINK
  '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39': 'LINK', // Polygon
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK', // Ethereum
  '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': 'LINK', // Arbitrum

  // AAVE
  '0xd6df932a45c0f255f85145f286ea0b292b21c90b': 'AAVE', // Polygon
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'AAVE', // Ethereum

  // UNI
  '0xb33eaad8d922b1083446dc23f610c2567fb5180f': 'UNI',  // Polygon
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',  // Ethereum

  // MATIC / POL (wrapped on other chains)
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'MATIC', // Polygon WMATIC

  // LSTs (priced ~ETH, CoinDesk may have specific feeds)
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'ETH',  // Base cbETH (~ETH)
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': 'ETH',  // Ethereum cbETH
  '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': 'ETH',  // Base wstETH (~ETH)
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': 'ETH',  // Ethereum wstETH
  '0xae78736cd615f374d3085123a210448e74fc6393': 'ETH',  // Ethereum rETH

  // Base-native tokens (CoinGecko fallback will handle pricing)
  '0x532f27101965dd16442e59d40670faf5ebb142e4': 'BRETT', // Base BRETT
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 'AERO',  // Base Aerodrome
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 'BTC',   // Base cbBTC
};

/**
 * Resolve a token address + chain ID to a CoinDesk symbol.
 * Returns null if the token is not mapped.
 */
export function resolveSymbol(
  tokenAddress: string,
  chainId: number
): string | null {
  // Check token address map first
  const symbol = TOKEN_ADDRESS_TO_SYMBOL[tokenAddress.toLowerCase()];
  if (symbol) return symbol;

  return null;
}

/**
 * Get the native token symbol for a chain.
 */
export function getNativeSymbol(chainId: number): string | null {
  return NATIVE_TOKEN_SYMBOLS[chainId] || null;
}

/**
 * Get all unique symbols from a list of token addresses + chain IDs.
 * Useful for batching CoinDesk API calls.
 */
export function resolveSymbols(
  tokens: Array<{ address: string; chainId: number }>
): Map<string, string> {
  const result = new Map<string, string>(); // address → symbol
  for (const { address, chainId } of tokens) {
    const symbol = resolveSymbol(address, chainId);
    if (symbol) {
      result.set(address.toLowerCase(), symbol);
    }
  }
  return result;
}
