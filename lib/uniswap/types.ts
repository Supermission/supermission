export type SupportedChainId = number;

export interface TokenInfo {
  address: string;
  chainId: number;
  decimals: number;
  symbol: string;
  name: string;
  logoURI?: string;
}

export interface UniswapQuoteParams {
  tokenIn: string;
  tokenOut: string;
  amount: string; // raw units (wei)
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  chainId: SupportedChainId;
  swapper: string; // taker address
  slippageTolerance?: number; // basis points, e.g. 50 = 0.5%
}

export interface UniswapQuoteResponse {
  quote: {
    methodParameters: {
      calldata: string;
      value: string;
      to: string;
    };
    quote: string; // output amount raw
    quoteDecimals: string; // output amount formatted
    quoteGasAdjusted: string;
    gasEstimate: string;
    gasEstimateUSD: string;
    route: SwapRoute[][];
    routeString: string;
    blockNumber: string;
    priceImpact?: number;
  };
  routing: string;
  permitData?: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    values: Record<string, unknown>;
  };
}

export interface SwapRoute {
  type: string;
  address: string;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  fee?: string;
  amountIn?: string;
  amountOut?: string;
}

export interface NormalizedQuoteResponse {
  ok: boolean;
  source: string;
  chainId: number;
  toChainId?: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountOutFormatted?: string;
  priceImpact?: number;
  gasEstimate?: string;
  gasEstimateUSD?: string;
  fromAmountUSD?: string;
  toAmountUSD?: string;
  route?: string;
  methodParameters?: {
    calldata: string;
    value: string;
    to: string;
  };
  permitData?: Record<string, unknown>;
  /** The address the taker should approve (for allowance-holder flow) */
  spender?: string;
  rawQuote?: unknown;
  error?: string;
}

export const SUPPORTED_CHAIN_IDS: SupportedChainId[] = [
  1,      // Ethereum
  8453,   // Base
  137,    // Polygon
  42161,  // Arbitrum
  10,     // Optimism
  43114,  // Avalanche
  56,     // BSC
];

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  43114: 'Avalanche',
  56: 'BSC',
};

export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

export const WRAPPED_NATIVE: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',   // WETH
  8453: '0x4200000000000000000000000000000000000006', // WETH (Base)
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',  // WMATIC
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH (Arbitrum)
  10: '0x4200000000000000000000000000000000000006',    // WETH (Optimism)
  43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
  56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',   // WBNB
};
