import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { resolveToken, sortTokenPair } from '@/lib/uniswap/token-registry';
import {
  UNISWAP_V3_FACTORY,
  UniswapV3FactoryABI,
  UniswapV3PoolABI,
} from '@/lib/uniswap/abis';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

const baseClient = createPublicClient({
  chain: base,
  transport: http(httpRpcUrl('base')),
});

/**
 * GET /api/defi/pools/detail?token0=WETH&token1=USDC&fee=3000&chainId=8453
 * Returns on-chain pool data: currentTick, sqrtPriceX96, tickSpacing, currentPrice.
 */
export async function GET(req: NextRequest) {
  const token0Symbol = req.nextUrl.searchParams.get('token0');
  const token1Symbol = req.nextUrl.searchParams.get('token1');
  const fee = Number(req.nextUrl.searchParams.get('fee') || 3000);
  const chainId = Number(req.nextUrl.searchParams.get('chainId') || 8453);

  if (!token0Symbol || !token1Symbol) {
    return NextResponse.json({ ok: false, error: 'Missing token0 or token1 symbol' }, { status: 400 });
  }

  if (chainId !== 8453) {
    return NextResponse.json({ ok: false, error: 'Only Base (8453) supported for pool detail' }, { status: 400 });
  }

  const tokenA = resolveToken(token0Symbol);
  const tokenB = resolveToken(token1Symbol);

  if (!tokenA) {
    return NextResponse.json({ ok: false, error: `Unknown token: ${token0Symbol}` }, { status: 400 });
  }
  if (!tokenB) {
    return NextResponse.json({ ok: false, error: `Unknown token: ${token1Symbol}` }, { status: 400 });
  }

  // Sort by address (Uniswap convention)
  const [sorted0, sorted1] = sortTokenPair(tokenA, tokenB);

  try {
    // 1. Get pool address from factory
    const poolAddress = await baseClient.readContract({
      address: UNISWAP_V3_FACTORY,
      abi: UniswapV3FactoryABI,
      functionName: 'getPool',
      args: [sorted0.address, sorted1.address, fee],
    });

    if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
      // Try other fee tiers if requested one doesn't exist
      const otherFees = [500, 3000, 10000].filter(f => f !== fee);
      for (const altFee of otherFees) {
        const altPool = await baseClient.readContract({
          address: UNISWAP_V3_FACTORY,
          abi: UniswapV3FactoryABI,
          functionName: 'getPool',
          args: [sorted0.address, sorted1.address, altFee],
        });
        if (altPool && altPool !== '0x0000000000000000000000000000000000000000') {
          return NextResponse.json({
            ok: false,
            error: `No pool for fee tier ${fee / 10000}%. A pool exists at ${altFee / 10000}% fee tier.`,
            suggestedFee: altFee,
          }, { status: 404 });
        }
      }
      return NextResponse.json({ ok: false, error: `No pool found for ${sorted0.symbol}/${sorted1.symbol} at any fee tier` }, { status: 404 });
    }

    // 2. Read slot0 and tickSpacing from pool
    const [slot0, tickSpacing] = await Promise.all([
      baseClient.readContract({
        address: poolAddress,
        abi: UniswapV3PoolABI,
        functionName: 'slot0',
      }),
      baseClient.readContract({
        address: poolAddress,
        abi: UniswapV3PoolABI,
        functionName: 'tickSpacing',
      }),
    ]);

    const sqrtPriceX96 = slot0[0];
    const currentTick = slot0[1];

    // 3. Compute human-readable price from sqrtPriceX96
    // price = (sqrtPriceX96 / 2^96)^2 adjusted for decimals
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    const rawPrice = sqrtPrice * sqrtPrice;
    const decimalAdjustment = 10 ** (sorted0.decimals - sorted1.decimals);
    const currentPrice = rawPrice * decimalAdjustment;

    return NextResponse.json({
      ok: true,
      poolAddress,
      token0: sorted0,
      token1: sorted1,
      fee,
      currentTick: Number(currentTick),
      sqrtPriceX96: sqrtPriceX96.toString(),
      currentPrice,
      tickSpacing: Number(tickSpacing),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (err: any) {
    console.error('[Pool Detail API] Error:', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch pool data' }, { status: 500 });
  }
}
