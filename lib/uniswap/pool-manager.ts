import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import type { SupportedChainId } from './types';
import {
  NONFUNGIBLE_POSITION_MANAGER,
  NonfungiblePositionManagerABI,
  UniswapV3PoolABI,
  UniswapV3FactoryABI,
  UNISWAP_V3_FACTORY,
} from './abis';
import { BASE_TOKEN_REGISTRY } from './token-registry';
import { httpRpcUrlByChainId } from '@/lib/rpc/endpoints';

export interface PoolInfo {
  id: string;
  token0: { id: string; symbol: string; name: string; decimals: string };
  token1: { id: string; symbol: string; name: string; decimals: string };
  feeTier: string;
  tvlUSD: number;
  volumeUSD: number;
  estimatedAPR: number;
  token0Price: string;
  token1Price: string;
}

export interface UserLPPosition {
  id: string;
  tokenId: string;
  pool: {
    token0: string;
    token1: string;
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
    fee: number;
  };
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  token0Amount: string;
  token1Amount: string;
  feeToken0: string;
  feeToken1: string;
  inRange: boolean;
  currentTick: number;
}

const RPC_URLS: Record<number, string> = {
  8453: httpRpcUrlByChainId(8453),
  1: httpRpcUrlByChainId(1),
  137: httpRpcUrlByChainId(137),
};

// Reverse lookup: address → symbol/decimals
const ADDRESS_TO_TOKEN: Record<string, { symbol: string; decimals: number }> = {};
for (const [, token] of Object.entries(BASE_TOKEN_REGISTRY)) {
  ADDRESS_TO_TOKEN[token.address.toLowerCase()] = { symbol: token.symbol, decimals: token.decimals };
}

const BASE_URL = typeof window !== 'undefined'
  ? ''
  : (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

export async function getPools(
  chainId: SupportedChainId,
  options?: { token0?: string; token1?: string; first?: number }
): Promise<PoolInfo[]> {
  const params = new URLSearchParams({ chainId: String(chainId) });
  if (options?.token0) params.set('token0', options.token0);
  if (options?.token1) params.set('token1', options.token1);
  if (options?.first) params.set('first', String(options.first));

  const res = await fetch(`${BASE_URL}/api/defi/pools?${params}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to fetch pools');
  return data.pools;
}

export async function getPoolInfo(
  chainId: SupportedChainId,
  token0: string,
  token1: string
): Promise<PoolInfo[]> {
  return getPools(chainId, { token0, token1 });
}

export async function getUserPositions(
  wallet: string,
  chainId: SupportedChainId
): Promise<UserLPPosition[]> {
  const rpcUrl = RPC_URLS[chainId];
  if (!rpcUrl) return [];

  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  try {
    // 1. Get number of positions owned
    const count = await client.readContract({
      address: NONFUNGIBLE_POSITION_MANAGER,
      abi: NonfungiblePositionManagerABI,
      functionName: 'balanceOf',
      args: [wallet as `0x${string}`],
    });

    const positionCount = Number(count);
    if (positionCount === 0) return [];

    // Cap at 20 to avoid excessive RPC calls
    const maxPositions = Math.min(positionCount, 20);

    // 2. Get all tokenIds
    const tokenIdPromises = [];
    for (let i = 0; i < maxPositions; i++) {
      tokenIdPromises.push(
        client.readContract({
          address: NONFUNGIBLE_POSITION_MANAGER,
          abi: NonfungiblePositionManagerABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [wallet as `0x${string}`, BigInt(i)],
        })
      );
    }
    const tokenIds = await Promise.all(tokenIdPromises);

    // 3. Get position data for each tokenId
    const positionPromises = tokenIds.map((tokenId) =>
      client.readContract({
        address: NONFUNGIBLE_POSITION_MANAGER,
        abi: NonfungiblePositionManagerABI,
        functionName: 'positions',
        args: [tokenId],
      })
    );
    const positions = await Promise.all(positionPromises);

    // 4. Filter out closed positions (liquidity = 0 and no fees owed)
    const activePositions: { tokenId: bigint; pos: typeof positions[0] }[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      // pos: [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowth0, feeGrowth1, tokensOwed0, tokensOwed1]
      const liquidity = pos[7];
      const tokensOwed0 = pos[10];
      const tokensOwed1 = pos[11];
      if (liquidity > 0n || tokensOwed0 > 0n || tokensOwed1 > 0n) {
        activePositions.push({ tokenId: tokenIds[i], pos });
      }
    }

    if (activePositions.length === 0) return [];

    // 5. Get current tick for each unique pool
    const poolKeys = new Map<string, { token0: `0x${string}`; token1: `0x${string}`; fee: number }>();
    for (const { pos } of activePositions) {
      const key = `${pos[2]}-${pos[3]}-${pos[4]}`;
      if (!poolKeys.has(key)) {
        poolKeys.set(key, { token0: pos[2] as `0x${string}`, token1: pos[3] as `0x${string}`, fee: Number(pos[4]) });
      }
    }

    const poolTicks = new Map<string, number>();
    const poolPromises = Array.from(poolKeys.entries()).map(async ([key, { token0, token1, fee }]) => {
      try {
        const poolAddress = await client.readContract({
          address: UNISWAP_V3_FACTORY,
          abi: UniswapV3FactoryABI,
          functionName: 'getPool',
          args: [token0, token1, fee],
        });
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          const slot0 = await client.readContract({
            address: poolAddress,
            abi: UniswapV3PoolABI,
            functionName: 'slot0',
          });
          poolTicks.set(key, Number(slot0[1]));
        }
      } catch {
        // Skip pools we can't read
      }
    });
    await Promise.all(poolPromises);

    // 6. Build result
    const result: UserLPPosition[] = [];
    for (const { tokenId, pos } of activePositions) {
      const token0Addr = (pos[2] as string).toLowerCase();
      const token1Addr = (pos[3] as string).toLowerCase();
      const fee = Number(pos[4]);
      const tickLower = Number(pos[5]);
      const tickUpper = Number(pos[6]);
      const liquidity = pos[7];
      const tokensOwed0 = pos[10];
      const tokensOwed1 = pos[11];

      const token0Meta = ADDRESS_TO_TOKEN[token0Addr] || { symbol: token0Addr.slice(0, 10), decimals: 18 };
      const token1Meta = ADDRESS_TO_TOKEN[token1Addr] || { symbol: token1Addr.slice(0, 10), decimals: 18 };

      const poolKey = `${pos[2]}-${pos[3]}-${pos[4]}`;
      const currentTick = poolTicks.get(poolKey) ?? 0;
      const inRange = currentTick >= tickLower && currentTick < tickUpper;

      // Compute approximate token amounts from liquidity + ticks
      const { amount0, amount1 } = computeTokenAmounts(
        liquidity,
        currentTick,
        tickLower,
        tickUpper,
        token0Meta.decimals,
        token1Meta.decimals,
      );

      result.push({
        id: tokenId.toString(),
        tokenId: tokenId.toString(),
        pool: {
          token0: pos[2] as string,
          token1: pos[3] as string,
          token0Symbol: token0Meta.symbol,
          token1Symbol: token1Meta.symbol,
          token0Decimals: token0Meta.decimals,
          token1Decimals: token1Meta.decimals,
          fee,
        },
        liquidity: liquidity.toString(),
        tickLower,
        tickUpper,
        token0Amount: amount0,
        token1Amount: amount1,
        feeToken0: formatTokenAmount(tokensOwed0, token0Meta.decimals),
        feeToken1: formatTokenAmount(tokensOwed1, token1Meta.decimals),
        inRange,
        currentTick,
      });
    }

    return result;
  } catch (err) {
    console.error('[PoolManager] getUserPositions error:', err);
    return [];
  }
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  const num = Number(raw) / (10 ** decimals);
  return num.toFixed(decimals > 6 ? 6 : decimals);
}

function computeTokenAmounts(
  liquidity: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  decimals0: number,
  decimals1: number,
): { amount0: string; amount1: string } {
  if (liquidity === 0n) return { amount0: '0', amount1: '0' };

  const sqrtPriceCurrent = Math.sqrt(1.0001 ** currentTick);
  const sqrtPriceLower = Math.sqrt(1.0001 ** tickLower);
  const sqrtPriceUpper = Math.sqrt(1.0001 ** tickUpper);

  const L = Number(liquidity);
  let amount0 = 0;
  let amount1 = 0;

  if (currentTick < tickLower) {
    // All token0
    amount0 = L * (1 / sqrtPriceLower - 1 / sqrtPriceUpper);
  } else if (currentTick >= tickUpper) {
    // All token1
    amount1 = L * (sqrtPriceUpper - sqrtPriceLower);
  } else {
    // In range — split
    amount0 = L * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper);
    amount1 = L * (sqrtPriceCurrent - sqrtPriceLower);
  }

  // Adjust for decimals (V3 math gives raw amounts)
  const fmt0 = (amount0 / (10 ** decimals0)).toFixed(decimals0 > 6 ? 6 : decimals0);
  const fmt1 = (amount1 / (10 ** decimals1)).toFixed(decimals1 > 6 ? 6 : decimals1);

  return { amount0: fmt0, amount1: fmt1 };
}
