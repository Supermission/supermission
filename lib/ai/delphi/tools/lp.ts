/**
 * Uniswap V3 LP executors: prepare/execute, positions, remove liquidity,
 * collect fees, performance & IL analytics.
 */

import { resolveToken, sortTokenPair } from '@/lib/uniswap/token-registry';
import { suggestLPRange } from '@/lib/uniswap/range-optimizer';
import { getUserPositions } from '@/lib/uniswap/pool-manager';
import { getAggregatedPrice } from '@/lib/price-aggregator/multi-source';
import { subgraphQuery } from '@/lib/uniswap/price-client';
import { fetchTimeout, getBaseUrl } from './shared';

// ---------------------------------------------------------------------------
// prepare_uniswap_lp — resolve tokens, fetch pool, compute range, return LP params
// ---------------------------------------------------------------------------

export async function executePrepareUniswapLP(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet before providing liquidity.' };
  }

  const token0Symbol = args.token0Symbol as string;
  const token1Symbol = args.token1Symbol as string;
  const amount0Input = args.amount0 as string | undefined;
  const amount1Input = args.amount1 as string | undefined;
  const feeTier = (args.feeTier as number) || 3000;
  const riskLevel = (args.riskLevel as 'conservative' | 'moderate' | 'aggressive') || 'moderate';

  if (!token0Symbol || !token1Symbol) {
    return { error: 'Missing token symbols. Provide token0Symbol and token1Symbol.' };
  }

  if (!amount0Input && !amount1Input) {
    return { error: 'Provide at least one token amount (amount0 or amount1).' };
  }

  // Resolve tokens
  const tokenA = resolveToken(token0Symbol);
  const tokenB = resolveToken(token1Symbol);
  if (!tokenA) return { error: `Unknown token: ${token0Symbol}. Supported: WETH, USDC, USDbC, DAI, cbETH, AERO, DEGEN, USDT, WBTC` };
  if (!tokenB) return { error: `Unknown token: ${token1Symbol}. Supported: WETH, USDC, USDbC, DAI, cbETH, AERO, DEGEN, USDT, WBTC` };

  // Sort tokens (Uniswap convention: token0.address < token1.address)
  const [sorted0, sorted1] = sortTokenPair(tokenA, tokenB);
  const userOrderSwapped = sorted0.symbol !== tokenA.symbol;

  try {
    // Fetch pool detail
    const { signal, clear } = fetchTimeout(15_000);
    const res = await fetch(
      `${getBaseUrl()}/api/defi/pools/detail?token0=${sorted0.symbol}&token1=${sorted1.symbol}&fee=${feeTier}&chainId=8453`,
      { signal }
    );
    clear();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.error || `No pool found for ${sorted0.symbol}/${sorted1.symbol} at ${feeTier / 10000}% fee tier` };
    }

    const poolData = await res.json();
    if (!poolData.ok) return { error: poolData.error || 'Pool data fetch failed' };

    // Compute range
    const range = await suggestLPRange({
      token0: sorted0.symbol,
      token1: sorted1.symbol,
      chainId: 8453,
      riskLevel,
      currentTick: poolData.currentTick,
      currentPrice: poolData.currentPrice,
      tickSpacing: poolData.tickSpacing,
    });

    // Calculate amounts — if only one amount provided, estimate the other from current price
    let amt0: string;
    let amt1: string;

    if (userOrderSwapped) {
      // User said token0Symbol=B, token1Symbol=A, but sorted is [A, B]
      // amount0Input corresponds to sorted1, amount1Input corresponds to sorted0
      const userAmt0 = amount0Input; // user's "token0" = sorted1
      const userAmt1 = amount1Input; // user's "token1" = sorted0
      if (userAmt0 && userAmt1) {
        amt0 = userAmt1; // sorted0 amount
        amt1 = userAmt0; // sorted1 amount
      } else if (userAmt0) {
        // User gave amount for sorted1, compute sorted0
        amt1 = userAmt0;
        amt0 = (parseFloat(userAmt0) * poolData.currentPrice).toFixed(sorted0.decimals > 6 ? 6 : sorted0.decimals);
      } else {
        // User gave amount for sorted0, compute sorted1
        amt0 = userAmt1!;
        amt1 = (parseFloat(userAmt1!) / poolData.currentPrice).toFixed(sorted1.decimals > 6 ? 6 : sorted1.decimals);
      }
    } else {
      if (amount0Input && amount1Input) {
        amt0 = amount0Input;
        amt1 = amount1Input;
      } else if (amount0Input) {
        amt0 = amount0Input;
        // price = token1/token0 ratio, so amount1 = amount0 / price (since price is token0 in terms of token1)
        amt1 = (parseFloat(amount0Input) / poolData.currentPrice).toFixed(sorted1.decimals > 6 ? 6 : sorted1.decimals);
      } else {
        amt1 = amount1Input!;
        amt0 = (parseFloat(amount1Input!) * poolData.currentPrice).toFixed(sorted0.decimals > 6 ? 6 : sorted0.decimals);
      }
    }

    // Compute display prices for the range
    const lowerPrice = poolData.currentPrice * Math.pow(1.0001, range.lowerTick - poolData.currentTick);
    const upperPrice = poolData.currentPrice * Math.pow(1.0001, range.upperTick - poolData.currentTick);

    return {
      lp: {
        token0Address: sorted0.address,
        token1Address: sorted1.address,
        token0Symbol: sorted0.symbol,
        token1Symbol: sorted1.symbol,
        token0Decimals: sorted0.decimals,
        token1Decimals: sorted1.decimals,
        fee: feeTier,
        tickLower: range.lowerTick,
        tickUpper: range.upperTick,
        amount0: amt0,
        amount1: amt1,
        lowerPrice: lowerPrice.toFixed(4),
        upperPrice: upperPrice.toFixed(4),
        currentPrice: poolData.currentPrice.toFixed(4),
        estimatedAPR: range.estimatedAPR,
        ilRisk: range.ilRisk,
        poolAddress: poolData.poolAddress,
        rangeRationale: range.rationale,
      },
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to prepare LP position' };
  }
}

// ---------------------------------------------------------------------------
// execute_uniswap_lp — confirm flag gate before auto-execution on the frontend
// ---------------------------------------------------------------------------

export function executeExecuteUniswapLP(args: Record<string, any>) {
  if (args.confirmed !== true) {
    return { error: 'LP execution not confirmed. User must type yes or go to confirm.' };
  }
  return { lpExecution: { confirmed: true } };
}

// ---------------------------------------------------------------------------
// get_lp_positions — fetch user's Uniswap V3 positions
// ---------------------------------------------------------------------------

export async function executeGetLPPositions(walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet.' };
  }

  try {
    const positions = await getUserPositions(walletAddress, 8453);
    if (positions.length === 0) {
      return { positions: [], message: 'No active LP positions found on Base.' };
    }

    return {
      positions: positions.map(p => ({
        tokenId: p.tokenId,
        pair: `${p.pool.token0Symbol}/${p.pool.token1Symbol}`,
        feeTier: `${(p.pool.fee / 10000).toFixed(2)}%`,
        inRange: p.inRange,
        liquidity: p.liquidity,
        token0Amount: `${p.token0Amount} ${p.pool.token0Symbol}`,
        token1Amount: `${p.token1Amount} ${p.pool.token1Symbol}`,
        feesAccrued: `${p.feeToken0} ${p.pool.token0Symbol} + ${p.feeToken1} ${p.pool.token1Symbol}`,
        tickLower: p.tickLower,
        tickUpper: p.tickUpper,
        currentTick: p.currentTick,
      })),
      count: positions.length,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch LP positions' };
  }
}

// ---------------------------------------------------------------------------
// prepare_remove_liquidity — prepare removal confirmation
// ---------------------------------------------------------------------------

export async function executePrepareRemoveLiquidity(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet.' };
  }

  const positionId = args.positionId as string;
  const percentage = (args.percentage as number) || 100;

  if (!positionId) return { error: 'Missing positionId' };
  if (percentage < 1 || percentage > 100) return { error: 'Percentage must be between 1 and 100' };

  try {
    // Fetch user's positions to verify ownership and get details
    const positions = await getUserPositions(walletAddress, 8453);
    const position = positions.find(p => p.tokenId === positionId);

    if (!position) {
      return { error: `Position #${positionId} not found or not owned by connected wallet.` };
    }

    if (BigInt(position.liquidity) === 0n) {
      return { error: `Position #${positionId} has no remaining liquidity. You may want to collect fees instead.` };
    }

    return {
      removal: {
        tokenId: position.tokenId,
        token0Symbol: position.pool.token0Symbol,
        token1Symbol: position.pool.token1Symbol,
        token0Decimals: position.pool.token0Decimals,
        token1Decimals: position.pool.token1Decimals,
        liquidity: position.liquidity,
        percentage,
        estimatedAmount0: position.token0Amount,
        estimatedAmount1: position.token1Amount,
        feeAmount0: position.feeToken0,
        feeAmount1: position.feeToken1,
        feeTier: `${(position.pool.fee / 10000).toFixed(2)}%`,
        inRange: position.inRange,
      },
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to prepare liquidity removal' };
  }
}

// ---------------------------------------------------------------------------
// collect_lp_fees — prepare fee collection confirmation
// ---------------------------------------------------------------------------

export async function executeCollectLPFees(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet.' };
  }

  const positionId = args.positionId as string;
  if (!positionId) return { error: 'Missing positionId' };

  try {
    const positions = await getUserPositions(walletAddress, 8453);
    const position = positions.find(p => p.tokenId === positionId);

    if (!position) {
      return { error: `Position #${positionId} not found or not owned by connected wallet.` };
    }

    return {
      collect: {
        tokenId: position.tokenId,
        token0Symbol: position.pool.token0Symbol,
        token1Symbol: position.pool.token1Symbol,
        feeAmount0: position.feeToken0,
        feeAmount1: position.feeToken1,
        feeTier: `${(position.pool.fee / 10000).toFixed(2)}%`,
      },
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to prepare fee collection' };
  }
}

// ---------------------------------------------------------------------------
// get_lp_position_analytics — LP performance, IL estimate, net PnL
// ---------------------------------------------------------------------------

export async function executeGetLPPositionAnalytics(args: Record<string, unknown>, walletAddress: string | null) {
  const positionId = args.positionId as string | undefined;
  const wallet = (args.wallet as string) || walletAddress;

  if (!positionId && !wallet) {
    return { error: 'Provide a positionId or wallet address (or connect your wallet).' };
  }

  const chainId = 8453;

  try {
    let positions: Array<{
      id: string;
      owner: string;
      liquidity: string;
      depositedToken0: string;
      depositedToken1: string;
      collectedFeesToken0: string;
      collectedFeesToken1: string;
      token0: { id: string; symbol: string; decimals: string; derivedETH: string };
      token1: { id: string; symbol: string; decimals: string; derivedETH: string };
      pool: {
        id: string;
        token0Price: string;
        token1Price: string;
        feeTier: string;
        tick: string;
      };
      tickLower: { tickIdx: string };
      tickUpper: { tickIdx: string };
    }> = [];

    if (positionId) {
      const data = await subgraphQuery<{
        position: typeof positions[0] | null;
      }>(
        chainId,
        `{ position(id: "${positionId}") { id owner liquidity depositedToken0 depositedToken1 collectedFeesToken0 collectedFeesToken1 token0 { id symbol decimals derivedETH } token1 { id symbol decimals derivedETH } pool { id token0Price token1Price feeTier tick } tickLower { tickIdx } tickUpper { tickIdx } } }`
      );
      if (data.position) positions = [data.position];
    } else {
      const data = await subgraphQuery<{
        positions: typeof positions;
      }>(
        chainId,
        `{ positions(where: { owner: "${wallet!.toLowerCase()}", liquidity_gt: "0" }, first: 10, orderBy: liquidity, orderDirection: desc) { id owner liquidity depositedToken0 depositedToken1 collectedFeesToken0 collectedFeesToken1 token0 { id symbol decimals derivedETH } token1 { id symbol decimals derivedETH } pool { id token0Price token1Price feeTier tick } tickLower { tickIdx } tickUpper { tickIdx } } }`
      );
      positions = data.positions || [];
    }

    if (positions.length === 0) {
      return { error: positionId ? `Position #${positionId} not found` : 'No active LP positions found for this wallet' };
    }

    // Get ETH price for USD conversion
    let ethPriceUSD = 2000; // fallback
    try {
      const priceResult = await getAggregatedPrice('ETH', chainId);
      if (priceResult && priceResult.median > 0) ethPriceUSD = priceResult.median;
    } catch { /* use fallback */ }

    const analyzed = positions.map((pos) => {
      const currentTick = parseInt(pos.pool.tick);
      const tickLower = parseInt(pos.tickLower.tickIdx);
      const tickUpper = parseInt(pos.tickUpper.tickIdx);
      const inRange = currentTick >= tickLower && currentTick < tickUpper;

      const depositedToken0 = parseFloat(pos.depositedToken0);
      const depositedToken1 = parseFloat(pos.depositedToken1);
      const collectedFees0 = parseFloat(pos.collectedFeesToken0);
      const collectedFees1 = parseFloat(pos.collectedFeesToken1);

      // Current prices: token0Price = how much token1 per token0
      const token0PriceInToken1 = parseFloat(pos.pool.token0Price);

      // Token prices in USD via derivedETH
      const token0PriceUSD = parseFloat(pos.token0.derivedETH) * ethPriceUSD;
      const token1PriceUSD = parseFloat(pos.token1.derivedETH) * ethPriceUSD;

      // Deposited value at current prices (approximation since we don't have deposit-time prices)
      const depositedValueUSD = depositedToken0 * token0PriceUSD + depositedToken1 * token1PriceUSD;

      // Fees earned in USD
      const feesEarnedUSD = collectedFees0 * token0PriceUSD + collectedFees1 * token1PriceUSD;

      // Simplified Uniswap V3 IL approximation
      // IL ≈ 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
      const depositedValue0 = depositedToken0 * token0PriceUSD;
      const depositedValue1 = depositedToken1 * token1PriceUSD;
      const currentPrice = token0PriceInToken1;
      const entryPrice = depositedValue1 > 0 && depositedValue0 > 0
        ? depositedValue1 / depositedValue0
        : currentPrice;
      const priceRatio = entryPrice > 0 ? currentPrice / entryPrice : 1;
      const ilFactor = priceRatio > 0
        ? 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1
        : 0;
      const ilEstimateUSD = Math.abs(ilFactor) * (depositedValueUSD || 0);

      // Net PnL = fees earned - IL estimate
      const netPnLUSD = feesEarnedUSD - ilEstimateUSD;

      return {
        positionId: pos.id,
        pair: `${pos.token0.symbol}/${pos.token1.symbol}`,
        feeTier: `${parseInt(pos.pool.feeTier) / 10000}%`,
        inRange,
        liquidity: pos.liquidity,
        deposited: {
          token0: `${depositedToken0.toFixed(6)} ${pos.token0.symbol}`,
          token1: `${depositedToken1.toFixed(6)} ${pos.token1.symbol}`,
          valueUSD: `$${depositedValueUSD.toFixed(2)}`,
        },
        feesEarned: {
          token0: `${collectedFees0.toFixed(6)} ${pos.token0.symbol}`,
          token1: `${collectedFees1.toFixed(6)} ${pos.token1.symbol}`,
          valueUSD: `$${feesEarnedUSD.toFixed(2)}`,
        },
        impermanentLoss: {
          estimateUSD: `$${ilEstimateUSD.toFixed(2)}`,
          note: 'Approximate — exact IL requires deposit-time prices which are not stored on-chain.',
        },
        netPnL: {
          valueUSD: `$${netPnLUSD.toFixed(2)}`,
          note: 'Net PnL = fees earned. Full PnL including IL requires historical deposit prices.',
        },
        currentPrices: {
          token0USD: `$${token0PriceUSD.toFixed(4)}`,
          token1USD: `$${token1PriceUSD.toFixed(4)}`,
          ratio: `1 ${pos.token0.symbol} = ${token0PriceInToken1.toFixed(6)} ${pos.token1.symbol}`,
        },
        range: {
          lower: tickLower,
          upper: tickUpper,
          current: currentTick,
        },
      };
    });

    return {
      positions: analyzed,
      count: analyzed.length,
      wallet: wallet || 'N/A',
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to analyze LP position' };
  }
}
