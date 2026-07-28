/**
 * Market-data executors: prices, TWAP, trending tokens, smart-money flows,
 * top-traded volumes, pool listings, large swaps, pool-fee analytics.
 */

import { getAggregatedPrice } from '@/lib/price-aggregator/multi-source';
import { getTrendingTokens, getSmartMoneyNetflows, getSmartMoneyHoldings } from '@/lib/nansen/client';
import { getHistoricalHourly, subgraphQuery, SYMBOL_TO_ADDRESS } from '@/lib/uniswap/price-client';
import { ADDRESS_TO_SYMBOL, formatCompact, resolveTokenAddress } from './shared';

// ---------------------------------------------------------------------------
// get_token_price — multi-source aggregator (CoinGecko, Chainlink, etc.)
// ---------------------------------------------------------------------------

export async function executeGetTokenPrice(args: Record<string, unknown>) {
  const tokenSymbol = args.tokenSymbol as string | undefined;
  const tokenAddress = args.tokenAddress as string | undefined;
  const chainId = (args.chainId as number) || 8453;

  // Resolve symbol: prefer explicit symbol, then look up from address
  let symbol = tokenSymbol?.toUpperCase();
  if (!symbol && tokenAddress) {
    symbol = ADDRESS_TO_SYMBOL[tokenAddress.toLowerCase()];
  }
  // WETH = ETH price
  if (symbol === 'WETH') symbol = 'ETH';

  if (!symbol) {
    return { error: 'Could not determine token symbol. Provide tokenSymbol (e.g. "ETH", "USDC") for price lookup.' };
  }

  try {
    const result = await getAggregatedPrice(symbol, chainId);
    return {
      token: tokenSymbol || tokenAddress,
      symbol,
      chainId,
      priceUSD: result.median,
      confidence: result.confidence,
      sources: result.sources.map(s => ({ source: s.source, price: s.price })),
    };
  } catch {
    return { error: 'Price lookup failed. Use your own knowledge for approximate price or tell user to try again.' };
  }
}

// ---------------------------------------------------------------------------
// get_token_twap — time-weighted average price from hourly subgraph data
// ---------------------------------------------------------------------------

export async function executeGetTokenTwap(args: Record<string, unknown>) {
  const symbol = (args.symbol as string)?.toUpperCase();
  const period = (args.period as string) || '24h';

  if (!symbol) return { error: 'Missing required parameter: symbol' };

  const limit = period === '7d' ? 168 : 24;

  const chainId = 8453;

  try {
    let hourlyData: Array<{ close: number }>;

    try {
      hourlyData = await getHistoricalHourly(symbol, chainId, limit);
    } catch {
      // Fallback: resolve address via subgraph and query directly
      const addr = await resolveTokenAddress(symbol, chainId);
      if (!addr) return { error: `Could not find token ${symbol} on Base` };

      const data = await subgraphQuery<{
        tokenHourDatas: Array<{ periodStartUnix: number; open: string; high: string; low: string; close: string }>;
      }>(chainId, `{
        tokenHourDatas(first: ${limit}, orderBy: periodStartUnix, orderDirection: desc, where: { token: "${addr}" }) {
          periodStartUnix open high low close
        }
      }`);
      const rawHourly = (data as any).tokenHourDatas || [];
      hourlyData = rawHourly.map((d: any) => ({ close: parseFloat(d.close) }));
    }

    if (!hourlyData || hourlyData.length === 0) {
      return { error: `No historical data found for ${symbol} on Base.` };
    }

    const closes = hourlyData.map((p) => p.close);
    const twap = closes.reduce((sum, c) => sum + c, 0) / closes.length;
    const currentPrice = closes[closes.length - 1];
    const deviation = ((currentPrice - twap) / twap) * 100;

    return {
      symbol,
      period,
      twap: parseFloat(twap.toFixed(6)),
      currentPrice: parseFloat(currentPrice.toFixed(6)),
      deviation: parseFloat(deviation.toFixed(2)),
      dataPoints: hourlyData.length,
    };
  } catch (err: any) {
    return { error: err.message || `Failed to calculate TWAP for ${symbol}` };
  }
}

// ---------------------------------------------------------------------------
// get_trending_tokens — Nansen trending tokens by volume/smart money/price
// ---------------------------------------------------------------------------

export async function executeGetTrendingTokens(args: Record<string, any>) {
  const traderTypeMap: Record<string, string> = { all: 'all', smart_money: 'sm', whale: 'whale' };
  const result = await getTrendingTokens({
    chains: args.chains || ['base', 'ethereum', 'polygon'],
    timeframe: args.timeframe || '24h',
    sortBy: args.sortBy || 'buy_volume',
    sortDirection: 'DESC',
    traderType: traderTypeMap[args.category || 'all'] || 'all',
    limit: Math.min(args.limit || 10, 25),
  });
  if ('error' in result) return { error: (result as any).error };
  const tokens = Array.isArray(result) ? result : [];
  return {
    trending: tokens.map((t: any) => ({
      symbol: t.token_symbol,
      chain: t.chain,
      price: t.price_usd,
      priceChange24h: t.price_change ? `${t.price_change > 0 ? '+' : ''}${t.price_change.toFixed(2)}%` : 'N/A',
      volume24h: t.volume,
      buyVolume: t.buy_volume,
      sellVolume: t.sell_volume,
      netflow: t.netflow,
      marketCap: t.market_cap_usd,
      traders: t.nof_traders,
      address: t.token_address,
    })),
    timeframe: args.timeframe || '24h',
    sortedBy: args.sortBy || 'buy_volume',
    category: args.category || 'all',
  };
}

// ---------------------------------------------------------------------------
// get_smart_money_moves — Nansen smart money netflows & holdings
// ---------------------------------------------------------------------------

export async function executeGetSmartMoneyMoves(args: Record<string, any>) {
  const view = args.view || 'netflows';
  const chains = args.chains || ['base', 'ethereum', 'polygon'];
  const limit = Math.min(args.limit || 10, 25);

  if (view === 'holdings') {
    const result = await getSmartMoneyHoldings({
      chains,
      sortBy: 'balance_24h_percent_change',
      sortDirection: 'DESC',
      limit,
      filters: { balance_24h_percent_change: { min: 5 }, value_usd: { min: 10000 } },
    });
    if ('error' in result) return { error: (result as any).error };
    const holdings = Array.isArray(result) ? result : [];
    return {
      smartMoney: {
        view: 'holdings',
        data: holdings.map((h: any) => ({
          symbol: h.token_symbol,
          chain: h.chain,
          valueHeld: h.value_usd,
          change24h: `${h.balance_24h_percent_change > 0 ? '+' : ''}${h.balance_24h_percent_change?.toFixed(1)}%`,
          holders: h.holders_count,
          marketCap: h.market_cap_usd,
          sectors: h.token_sectors,
          address: h.token_address,
        })),
      },
    };
  }

  // Default: netflows
  const timeframeField = `net_flow_${args.timeframe || '24h'}_usd`;
  const validFields = ['net_flow_1h_usd', 'net_flow_24h_usd', 'net_flow_7d_usd', 'net_flow_30d_usd'];
  const sortField = validFields.includes(timeframeField) ? timeframeField : 'net_flow_24h_usd';

  const result = await getSmartMoneyNetflows({
    chains,
    sortBy: sortField,
    sortDirection: 'DESC',
    limit,
  });
  if ('error' in result) return { error: (result as any).error };
  const netflows = Array.isArray(result) ? result : [];
  return {
    smartMoney: {
      view: 'netflows',
      timeframe: args.timeframe || '24h',
      data: netflows.map((n: any) => ({
        symbol: n.token_symbol,
        chain: n.chain,
        netFlow1h: n.net_flow_1h_usd,
        netFlow24h: n.net_flow_24h_usd,
        netFlow7d: n.net_flow_7d_usd,
        traderCount: n.trader_count,
        marketCap: n.market_cap_usd,
        sectors: n.token_sectors,
        address: n.token_address,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// get_top_traded_tokens — highest volume tokens from Uniswap subgraph
// ---------------------------------------------------------------------------

export async function executeGetTopTradedTokens(args: Record<string, unknown>) {
  const limit = Math.min(Math.max((args.limit as number) || 10, 1), 20);
  const period = (args.period as string) || '24h';

  const days = period === '7d' ? 7 : 1;
  const dateThreshold = Math.floor(Date.now() / 1000 / 86400) - days;

  try {
    const data = await subgraphQuery<{
      tokenDayDatas: Array<{
        token: { id: string; symbol: string; name: string };
        volumeUSD: string;
        totalValueLockedUSD: string;
        priceUSD: string;
        open: string;
        close: string;
      }>;
    }>(
      8453,
      `{
        tokenDayDatas(
          first: ${limit}
          orderBy: volumeUSD
          orderDirection: desc
          where: { date_gte: ${dateThreshold} }
        ) {
          token { id symbol name }
          volumeUSD
          totalValueLockedUSD
          priceUSD
          open
          close
        }
      }`
    );

    const tokenDayDatas = data.tokenDayDatas || [];

    if (tokenDayDatas.length === 0) {
      return { error: 'No trading data returned from the subgraph.' };
    }

    const tokens = tokenDayDatas.map((d) => {
      const open = parseFloat(d.open);
      const close = parseFloat(d.close);
      const changePct = open > 0 ? ((close - open) / open) * 100 : 0;

      return {
        symbol: d.token.symbol,
        name: d.token.name,
        address: d.token.id,
        volumeUSD: `$${formatCompact(parseFloat(d.volumeUSD))}`,
        priceUSD: parseFloat(d.priceUSD).toFixed(6),
        tvlUSD: `$${formatCompact(parseFloat(d.totalValueLockedUSD))}`,
        open: parseFloat(d.open).toFixed(6),
        close: parseFloat(d.close).toFixed(6),
        changePct: `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      };
    });

    return { tokens, count: tokens.length, period, chain: 'Base' };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch top traded tokens' };
  }
}

// ---------------------------------------------------------------------------
// find_new_pools — recently created Uniswap pools with real liquidity
// ---------------------------------------------------------------------------

export async function executeFindNewPools(args: Record<string, unknown>) {
  const hours = Math.min(Math.max((args.hours as number) || 48, 1), 168);
  const minTvl = (args.minTvl as number) || 5000;

  const timestampThreshold = Math.floor(Date.now() / 1000) - hours * 3600;

  try {
    const data = await subgraphQuery<{
      pools: Array<{
        id: string;
        token0: { id: string; symbol: string; name: string };
        token1: { id: string; symbol: string; name: string };
        feeTier: string;
        totalValueLockedUSD: string;
        volumeUSD: string;
        createdAtTimestamp: string;
        txCount: string;
      }>;
    }>(
      8453,
      `{
        pools(
          first: 20
          orderBy: createdAtTimestamp
          orderDirection: desc
          where: {
            createdAtTimestamp_gte: ${timestampThreshold}
            totalValueLockedUSD_gt: "${minTvl}"
          }
        ) {
          id
          token0 { id symbol name }
          token1 { id symbol name }
          feeTier
          totalValueLockedUSD
          volumeUSD
          createdAtTimestamp
          txCount
        }
      }`
    );

    const pools = data.pools || [];

    if (pools.length === 0) {
      return { pools: [], message: `No new pools with TVL > $${minTvl} found in the last ${hours} hours on Base.` };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const formatted = pools.map((p) => {
      const createdAt = parseInt(p.createdAtTimestamp);
      const agoHours = Math.floor((nowSec - createdAt) / 3600);
      const agoStr = agoHours < 1 ? '<1h ago' : agoHours < 24 ? `${agoHours}h ago` : `${Math.floor(agoHours / 24)}d ago`;

      return {
        pair: `${p.token0.symbol}/${p.token1.symbol}`,
        token0: { symbol: p.token0.symbol, name: p.token0.name, address: p.token0.id },
        token1: { symbol: p.token1.symbol, name: p.token1.name, address: p.token1.id },
        feeTier: `${parseInt(p.feeTier) / 10000}%`,
        tvlUSD: `$${formatCompact(parseFloat(p.totalValueLockedUSD))}`,
        volumeUSD: `$${formatCompact(parseFloat(p.volumeUSD))}`,
        txCount: parseInt(p.txCount),
        created: agoStr,
        poolAddress: p.id,
      };
    });

    return { pools: formatted, count: formatted.length, lookbackHours: hours, minTvl };
  } catch (err: any) {
    return { error: err.message || 'Failed to find new pools' };
  }
}

// ---------------------------------------------------------------------------
// get_recent_large_swaps — whale activity detection via subgraph
// ---------------------------------------------------------------------------

export async function executeGetRecentLargeSwaps(args: Record<string, unknown>) {
  const tokenInput = (args.token as string || '').trim();
  const minUsd = (args.minUsd as number) || 5000;
  const hours = Math.min(Math.max((args.hours as number) || 24, 1), 720); // default 24h, max 30 days

  if (!tokenInput) return { error: 'Missing token symbol or address' };

  const chainId = 8453;
  let tokenAddr: string | undefined;
  let resolvedSymbol = tokenInput.toUpperCase();

  // If input looks like an address, use it directly
  if (tokenInput.startsWith('0x') && tokenInput.length === 42) {
    tokenAddr = tokenInput.toLowerCase();
  } else {
    // Try hardcoded map first
    const chainMap = SYMBOL_TO_ADDRESS[chainId];
    tokenAddr = chainMap?.[resolvedSymbol] ? String(chainMap[resolvedSymbol]).toLowerCase() : undefined;

    // If not found, search subgraph with multiple case variants
    if (!tokenAddr) {
      const variants = [resolvedSymbol, tokenInput, tokenInput.toLowerCase()];
      for (const variant of variants) {
        try {
          const searchData = await subgraphQuery<{
            tokens: Array<{ id: string; symbol: string; volumeUSD: string }>;
          }>(chainId, `{ tokens(where: { symbol: "${variant}" }, first: 5, orderBy: volumeUSD, orderDirection: desc) { id symbol volumeUSD } }`);
          if (searchData.tokens && searchData.tokens.length > 0) {
            // Pick the one with highest volume (most likely the real token, not a fake)
            tokenAddr = searchData.tokens[0].id.toLowerCase();
            resolvedSymbol = searchData.tokens[0].symbol;
            break;
          }
        } catch { /* try next variant */ }
      }
    }
  }

  if (!tokenAddr) return { error: `Could not find token "${tokenInput}" on Base. Try providing the contract address instead.` };

  const threshold = Math.floor(Date.now() / 1000) - hours * 3600;

  try {
    // Find top pools containing this token (as token0 or token1)
    const [poolsAsToken0, poolsAsToken1] = await Promise.all([
      subgraphQuery<{
        pools: Array<{ id: string; token0: { symbol: string }; token1: { symbol: string } }>;
      }>(chainId, `{ pools(where: { token0: "${tokenAddr}" }, first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) { id token0 { symbol } token1 { symbol } } }`),
      subgraphQuery<{
        pools: Array<{ id: string; token0: { symbol: string }; token1: { symbol: string } }>;
      }>(chainId, `{ pools(where: { token1: "${tokenAddr}" }, first: 5, orderBy: totalValueLockedUSD, orderDirection: desc) { id token0 { symbol } token1 { symbol } } }`),
    ]);

    const allPools = [
      ...(poolsAsToken0.pools || []),
      ...(poolsAsToken1.pools || []),
    ];

    if (allPools.length === 0) {
      return { error: `No Uniswap pools found for ${resolvedSymbol} on Base` };
    }

    // Query swaps from each pool in parallel
    const swapPromises = allPools.map((pool) =>
      subgraphQuery<{
        swaps: Array<{
          timestamp: string;
          amountUSD: string;
          amount0: string;
          amount1: string;
          sender: string;
          origin: string;
          transaction: { id: string };
        }>;
      }>(
        chainId,
        `{ swaps(first: 20, orderBy: amountUSD, orderDirection: desc, where: { pool: "${pool.id}", timestamp_gte: ${threshold}, amountUSD_gte: "${minUsd}" }) { timestamp amountUSD amount0 amount1 sender origin transaction { id } } }`
      ).then((data) => ({
        poolId: pool.id,
        token0Symbol: pool.token0.symbol,
        token1Symbol: pool.token1.symbol,
        swaps: data.swaps || [],
      }))
    );

    const poolResults = await Promise.all(swapPromises);

    // Flatten and sort all swaps
    const allSwaps: Array<{
      timestamp: number;
      sizeUSD: number;
      direction: string;
      token0Symbol: string;
      token1Symbol: string;
      amount0: number;
      amount1: number;
      wallet: string;
      walletFull: string;
      txHash: string;
    }> = [];

    for (const pr of poolResults) {
      const isToken0 = pr.token0Symbol.toUpperCase() === resolvedSymbol;
      for (const swap of pr.swaps) {
        const amount0 = parseFloat(swap.amount0);
        // If the tracked token is token0: negative amount0 = sell, positive = buy
        // If the tracked token is token1: negative amount1 = sell, positive = buy
        let direction: string;
        if (isToken0) {
          direction = amount0 < 0 ? 'sell' : 'buy';
        } else {
          direction = parseFloat(swap.amount1) < 0 ? 'sell' : 'buy';
        }

        const wallet = swap.origin || swap.sender;
        allSwaps.push({
          timestamp: parseInt(swap.timestamp),
          sizeUSD: parseFloat(swap.amountUSD),
          direction,
          token0Symbol: pr.token0Symbol,
          token1Symbol: pr.token1Symbol,
          amount0: Math.abs(parseFloat(swap.amount0)),
          amount1: Math.abs(parseFloat(swap.amount1)),
          wallet: wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'unknown',
          walletFull: wallet || '',
          txHash: swap.transaction?.id || '',
        });
      }
    }

    // Sort by size descending, take top 20
    allSwaps.sort((a, b) => b.sizeUSD - a.sizeUSD);
    const topSwaps = allSwaps.slice(0, 20);

    return {
      token: resolvedSymbol,
      minUsd,
      hours,
      swapCount: topSwaps.length,
      swaps: topSwaps.map((s) => ({
        time: new Date(s.timestamp * 1000).toISOString(),
        direction: s.direction,
        sizeUSD: `$${formatCompact(s.sizeUSD)}`,
        pair: `${s.token0Symbol}/${s.token1Symbol}`,
        wallet: s.wallet,
        walletAddress: s.walletFull,
        txHash: s.txHash,
      })),
      summary: {
        totalSwaps: topSwaps.length,
        totalVolumeUSD: topSwaps.reduce((sum, s) => sum + s.sizeUSD, 0),
        buys: topSwaps.filter((s) => s.direction === 'buy').length,
        sells: topSwaps.filter((s) => s.direction === 'sell').length,
        buyVolumeUSD: topSwaps.filter((s) => s.direction === 'buy').reduce((sum, s) => sum + s.sizeUSD, 0),
        sellVolumeUSD: topSwaps.filter((s) => s.direction === 'sell').reduce((sum, s) => sum + s.sizeUSD, 0),
      },
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch large swaps' };
  }
}

// ---------------------------------------------------------------------------
// get_pool_fee_analytics — pool fee revenue and APR analysis
// ---------------------------------------------------------------------------

export async function executeGetPoolFeeAnalytics(args: Record<string, unknown>) {
  const token0Symbol = (args.token0 as string || '').toUpperCase();
  const token1Symbol = (args.token1 as string || '').toUpperCase();
  const feeTier = (args.feeTier as number) || 3000;
  const days = Math.min(Math.max((args.days as number) || 7, 1), 30);

  if (!token0Symbol || !token1Symbol) return { error: 'Missing token0 and token1 symbols' };

  const chainId = 8453;
  const [addr0, addr1] = await Promise.all([
    resolveTokenAddress(token0Symbol, chainId),
    resolveTokenAddress(token1Symbol, chainId),
  ]);

  if (!addr0) return { error: `Could not find token "${token0Symbol}" on Base. Try the contract address.` };
  if (!addr1) return { error: `Could not find token "${token1Symbol}" on Base. Try the contract address.` };

  try {
    // Find the pool with both tokens and matching fee tier
    const poolData = await subgraphQuery<{
      pools: Array<{
        id: string;
        token0: { symbol: string };
        token1: { symbol: string };
        feeTier: string;
        totalValueLockedUSD: string;
        volumeUSD: string;
      }>;
    }>(
      chainId,
      `{ pools(where: { token0_in: ["${addr0}", "${addr1}"], token1_in: ["${addr0}", "${addr1}"], feeTier: ${feeTier} }, first: 1) { id token0 { symbol } token1 { symbol } feeTier totalValueLockedUSD volumeUSD } }`
    );

    if (!poolData.pools || poolData.pools.length === 0) {
      return { error: `No ${token0Symbol}/${token1Symbol} pool found with ${feeTier / 10000}% fee tier on Base` };
    }

    const pool = poolData.pools[0];

    // Fetch poolDayDatas
    const dayData = await subgraphQuery<{
      poolDayDatas: Array<{
        date: number;
        volumeUSD: string;
        feesUSD: string;
        tvlUSD: string;
        liquidity: string;
      }>;
    }>(
      chainId,
      `{ poolDayDatas(first: ${days}, orderBy: date, orderDirection: desc, where: { pool: "${pool.id}" }) { date volumeUSD feesUSD tvlUSD liquidity } }`
    );

    const dailyData = (dayData.poolDayDatas || []).reverse(); // oldest first

    if (dailyData.length === 0) {
      return { error: 'No historical data available for this pool' };
    }

    const dailyMetrics = dailyData.map((d) => {
      const fees = parseFloat(d.feesUSD);
      const tvl = parseFloat(d.tvlUSD);
      const volume = parseFloat(d.volumeUSD);
      const dailyAPR = tvl > 0 ? (fees / tvl) * 365 * 100 : 0;

      return {
        date: new Date(d.date * 1000).toISOString().split('T')[0],
        feesUSD: `$${fees.toFixed(2)}`,
        volumeUSD: `$${formatCompact(volume)}`,
        tvlUSD: `$${formatCompact(tvl)}`,
        impliedAPR: `${dailyAPR.toFixed(2)}%`,
      };
    });

    const totalFees = dailyData.reduce((sum, d) => sum + parseFloat(d.feesUSD), 0);
    const totalVolume = dailyData.reduce((sum, d) => sum + parseFloat(d.volumeUSD), 0);
    const avgTvl = dailyData.reduce((sum, d) => sum + parseFloat(d.tvlUSD), 0) / dailyData.length;
    const avgAPR = avgTvl > 0 ? (totalFees / dailyData.length / avgTvl) * 365 * 100 : 0;

    return {
      pool: {
        pair: `${pool.token0.symbol}/${pool.token1.symbol}`,
        feeTier: `${parseInt(pool.feeTier) / 10000}%`,
        currentTVL: `$${formatCompact(parseFloat(pool.totalValueLockedUSD))}`,
        totalVolume: `$${formatCompact(parseFloat(pool.volumeUSD))}`,
      },
      period: {
        days: dailyData.length,
        totalFeesUSD: `$${totalFees.toFixed(2)}`,
        totalVolumeUSD: `$${formatCompact(totalVolume)}`,
        averageTVL: `$${formatCompact(avgTvl)}`,
        averageAPR: `${avgAPR.toFixed(2)}%`,
      },
      daily: dailyMetrics,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to fetch pool fee analytics' };
  }
}

// ---------------------------------------------------------------------------
// get_price_chart — OHLCV candles for inline chart rendering
// ---------------------------------------------------------------------------

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', WETH: 'weth', BTC: 'bitcoin', WBTC: 'wrapped-bitcoin',
  POL: 'matic-network', MATIC: 'matic-network', USDC: 'usd-coin',
  USDT: 'tether', DAI: 'dai', LINK: 'chainlink', UNI: 'uniswap',
  AAVE: 'aave', ARB: 'arbitrum', OP: 'optimism', SOL: 'solana',
  DOGE: 'dogecoin', SHIB: 'shiba-inu', PEPE: 'pepe', BONK: 'bonk',
};

export async function executeGetPriceChart(args: Record<string, unknown>) {
  const tokenInput = ((args.token as string) || '').trim().toUpperCase();
  const timeframe = (args.timeframe as string) || '7d';
  const days = timeframe === '30d' ? 30 : timeframe === '24h' ? 1 : 7;

  if (!tokenInput) return { error: 'Missing required parameter: token' };

  // Try CoinGecko OHLC for major tokens
  const geckoId = COINGECKO_IDS[tokenInput];
  if (geckoId) {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`,
        { next: { revalidate: 300 } }
      );
      if (res.ok) {
        const raw: [number, number, number, number, number][] = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const candles = raw.map(([time, open, high, low, close]) => ({
            time: Math.floor(time / 1000),
            open, high, low, close,
          }));
          return { symbol: tokenInput, timeframe, candles };
        }
      }
    } catch {
      // fall through to subgraph
    }
  }

  // Fallback: Uniswap V3 subgraph for Base tokens (address or known symbol)
  const chainId = 8453;
  const limit = days === 1 ? 24 : days === 7 ? 168 : 720;
  try {
    const addr = await resolveTokenAddress(tokenInput, chainId);
    if (!addr) return { error: `No chart data found for ${tokenInput}. Try a token address or a well-known symbol.` };

    const data = await subgraphQuery<{
      tokenHourDatas: Array<{ periodStartUnix: number; open: string; high: string; low: string; close: string }>;
    }>(chainId, `{
      tokenHourDatas(first: ${limit}, orderBy: periodStartUnix, orderDirection: desc, where: { token: "${addr.toLowerCase()}" }) {
        periodStartUnix open high low close
      }
    }`);

    const raw = (data as any).tokenHourDatas || [];
    if (!raw.length) return { error: `No chart data found for ${tokenInput} on Base.` };

    const candles = raw
      .reverse()
      .map((d: any) => ({
        time: d.periodStartUnix as number,
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
      }));

    return { symbol: tokenInput, timeframe, candles };
  } catch (err: any) {
    return { error: err.message || `Failed to fetch chart data for ${tokenInput}` };
  }
}
