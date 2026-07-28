import type { SupportedChainId } from './types';

export interface CreatePoolParams {
  token0: string;
  token1: string;
  fee: number; // in hundredths of a bip (e.g., 3000 = 0.3%)
  tickSpacing: number;
  hookAddress?: string; // optional v4 hook
  initialPrice: string; // sqrtPriceX96 or human-readable
  chainId: SupportedChainId;
}

export interface CreatePoolResult {
  poolAddress: string;
  txHash: string;
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  hookAddress?: string;
}

// Standard fee tiers
export const FEE_TIERS = [
  { fee: 100, tickSpacing: 1, label: '0.01%', description: 'Best for very stable pairs' },
  { fee: 500, tickSpacing: 10, label: '0.05%', description: 'Best for stable pairs' },
  { fee: 3000, tickSpacing: 60, label: '0.30%', description: 'Best for most pairs' },
  { fee: 10000, tickSpacing: 200, label: '1.00%', description: 'Best for exotic pairs' },
];

/**
 * Create a new Uniswap v4 pool.
 * In production, this calls PoolManager.initialize() with the PoolKey.
 */
export async function createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
  // Ensure token0 < token1 (Uniswap convention)
  const [sortedToken0, sortedToken1] =
    params.token0.toLowerCase() < params.token1.toLowerCase()
      ? [params.token0, params.token1]
      : [params.token1, params.token0];

  console.log('[PoolCreator] Create pool:', {
    token0: sortedToken0,
    token1: sortedToken1,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
    hookAddress: params.hookAddress,
    chainId: params.chainId,
  });

  // TODO: Implement actual PoolManager.initialize() call
  // PoolKey = { currency0, currency1, fee, tickSpacing, hooks }
  // sqrtPriceX96 = calculated from initialPrice

  throw new Error('Pool creation is not yet available. Coming soon.');
}
