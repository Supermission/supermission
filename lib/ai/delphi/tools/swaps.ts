/**
 * Swap/transfer executors: quote, prepare, compare routes, ERC-20/native transfer.
 */

import { subgraphQuery } from '@/lib/uniswap/price-client';
import {
  decodeHexString,
  fetchTimeout,
  formatCompact,
  getBaseUrl,
  resolveTokenAddress,
  RPC_URLS,
  TRANSFER_KNOWN_TOKENS,
} from './shared';
import { isEvmAddress, resolveChainFromAddress } from './resolve-chain';
import { byAddress } from '@/lib/tokens/registry';

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 8453: 'Base', 137: 'Polygon', 42161: 'Arbitrum', 4663: 'Robinhood',
};

/**
 * Work out the from/to chains for a swap. If the model already passed chain
 * ids we trust them; otherwise we auto-detect from any 0x token address (the
 * way Dexscreener does) so users never have to name the chain. Falls back to
 * Base only when nothing resolves.
 */
async function resolveSwapChains(args: Record<string, unknown>): Promise<{ fromChainId: number; toChainId: number }> {
  let fromChainId = (args.fromChainId as number) || 0;
  let toChainId = (args.toChainId as number) || 0;
  const fromToken = args.fromToken as string | undefined;
  const toToken = args.toToken as string | undefined;

  if (!fromChainId && isEvmAddress(fromToken)) {
    const r = await resolveChainFromAddress(fromToken);
    if (r.found && r.chainId) fromChainId = r.chainId;
  }
  if (!toChainId && isEvmAddress(toToken)) {
    const r = await resolveChainFromAddress(toToken);
    if (r.found && r.chainId) toChainId = r.chainId;
  }
  if (!fromChainId) fromChainId = toChainId || 8453;
  if (!toChainId) toChainId = fromChainId;
  return { fromChainId, toChainId };
}

// ---------------------------------------------------------------------------
// get_swap_quote — internal fetch to /api/defi/swap/quote
// ---------------------------------------------------------------------------

export async function executeGetSwapQuote(args: Record<string, unknown>, walletAddress: string | null) {
  const fromToken = args.fromToken as string;
  const toToken = args.toToken as string;
  const amount = args.amount as string;
  const slippage = (args.slippage as number) || 0.005;

  if (!fromToken || !toToken || !amount) {
    return { error: 'Missing required parameters: fromToken, toToken, amount' };
  }

  const { fromChainId, toChainId } = await resolveSwapChains(args);

  // Use connected wallet or a known valid dummy address for quote
  const taker = walletAddress || '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  // Determine decimals for fromToken
  const KNOWN_DECIMALS: Record<string, number> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC Base
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, // USDC Ethereum
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 6, // USDC Polygon
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // USDC Arbitrum
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 6, // USDT Ethereum
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 6, // USDC Optimism
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6, // USDT Polygon
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6, // USDT Arbitrum
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': 6, // USDT Optimism
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 6, // USDT Base
    '0x8f3cf7ad23cd3cadbd9735aff958023d60313e92': 18, // DAI Polygon
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 18, // DAI Arbitrum
  };
  // Registry (SSOT) fills in decimals for chain-specific tokens the hardcoded map
  // omits (e.g. USDG on Robinhood is 6 decimals, not the 18 default).
  const decimalsIn = KNOWN_DECIMALS[fromToken.toLowerCase()]
    ?? byAddress(fromToken, fromChainId)?.decimals
    ?? 18;

  const chainNames = CHAIN_NAMES;

  try {
    const { signal, clear } = fetchTimeout(25_000);
    const res = await fetch(`${getBaseUrl()}/api/defi/swap/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: fromChainId,
        toChainId,
        tokenIn: fromToken,
        tokenOut: toToken,
        amount,
        decimalsIn,
        taker,
        slippageBps: Math.round(slippage * 10000),
      }),
      signal,
    });
    clear();
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('[DELPHI] Swap quote error:', errData);
      return { error: 'Swap quote unavailable: route not found or service timeout. Tell user to try again or try different tokens/chains.' };
    }

    const q = await res.json();
    if (!q.ok) return { error: q.error || 'Quote failed' };

    // Extract token info from rawQuote for display
    const rawQuote = q.rawQuote || {};
    const action = rawQuote.action || {};
    const fromTokenInfo = action.fromToken || {};
    const toTokenInfo = action.toToken || rawQuote.estimate?.toToken || {};
    const isCrossChain = toChainId !== fromChainId;

    // Format into the shape DefiSwapQuotePanel expects
    return {
      quote: {
        type: isCrossChain ? 'bridge' : 'swap',
        source: q.source || 'lifi',
        tokenIn: fromToken,
        tokenOut: toToken,
        fromSymbol: fromTokenInfo.symbol || '???',
        toSymbol: toTokenInfo.symbol || '???',
        fromDecimals: fromTokenInfo.decimals || 18,
        toDecimals: toTokenInfo.decimals || 18,
        fromName: fromTokenInfo.name || fromTokenInfo.symbol || '???',
        toName: toTokenInfo.name || toTokenInfo.symbol || '???',
        amountIn: amount,
        amountInFormatted: q.amountIn || amount,
        amountOut: q.amountOut || '0',
        amountOutFormatted: q.amountOutFormatted || '0',
        priceImpact: q.priceImpact,
        gasEstimateUSD: q.gasEstimateUSD,
        route: q.route || `${fromTokenInfo.symbol} → ${toTokenInfo.symbol}`,
        chainId: fromChainId,
        toChainId,
        fromChainName: chainNames[fromChainId] || `Chain ${fromChainId}`,
        toChainName: chainNames[toChainId] || `Chain ${toChainId}`,
        spender: q.spender,
        methodParameters: q.methodParameters,
      },
    };
  } catch {
    return { error: 'Swap quote unavailable: route not found or service timeout. Tell user to try again or try different tokens/chains.' };
  }
}

// ---------------------------------------------------------------------------
// prepare_swap — executable swap quote for inline confirmation
// ---------------------------------------------------------------------------

export async function executePrepareSwap(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet before swapping.' };
  }

  const fromToken = args.fromToken as string;
  const toToken = args.toToken as string;
  const amount = args.amount as string;
  const slippage = (args.slippage as number) || 0.005;

  if (!fromToken || !toToken || !amount) {
    return { error: 'Missing required parameters: fromToken, toToken, amount' };
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return { error: 'Invalid amount. Provide a positive number.' };
  }

  const { fromChainId, toChainId } = await resolveSwapChains(args);

  const KNOWN_DECIMALS: Record<string, number> = {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC Base
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 6, // USDC Ethereum
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 6, // USDC Polygon
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // USDC Arbitrum
    '0xdac17f958d2ee523a2206206994597c13d831ec7': 6, // USDT Ethereum
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': 6, // USDC Optimism
    '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 6, // USDC.e Polygon
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6, // USDT Polygon
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 6, // USDT Arbitrum
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': 6, // USDT Optimism
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': 6, // USDT Base
    '0x8f3cf7ad23cd3cadbd9735aff958023d60313e92': 18, // DAI Polygon
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 18, // DAI Arbitrum
  };
  // Registry (SSOT) fills in decimals for chain-specific tokens the hardcoded map
  // omits (e.g. USDG on Robinhood is 6 decimals, not the 18 default).
  const decimalsIn = KNOWN_DECIMALS[fromToken.toLowerCase()]
    ?? byAddress(fromToken, fromChainId)?.decimals
    ?? 18;
  const slippageBps = Math.round(slippage * 10000);

  const chainNames = CHAIN_NAMES;

  try {
    const { signal, clear } = fetchTimeout(25_000);
    const res = await fetch(`${getBaseUrl()}/api/defi/swap/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chainId: fromChainId,
        toChainId,
        tokenIn: fromToken,
        tokenOut: toToken,
        amount,
        decimalsIn,
        taker: walletAddress,
        slippageBps,
      }),
      signal,
    });
    clear();

    if (!res.ok) {
      return { error: 'Swap quote unavailable. Try again or try different tokens/chains.' };
    }

    const q = await res.json();
    if (!q.ok) return { error: q.error || 'Quote failed' };

    if (!q.methodParameters) {
      return { error: 'This swap route is not executable right now. Try a different amount or token pair.' };
    }

    const rawQuote = q.rawQuote || {};
    const action = rawQuote.action || {};
    const fromTokenInfo = action.fromToken || {};
    const toTokenInfo = action.toToken || rawQuote.estimate?.toToken || {};
    const isCrossChain = toChainId !== fromChainId;
    const decimalsOut = toTokenInfo.decimals || 18;

    return {
      swap: {
        fromSymbol: fromTokenInfo.symbol || '???',
        toSymbol: toTokenInfo.symbol || '???',
        fromLogoURI: fromTokenInfo.logoURI || null,
        toLogoURI: toTokenInfo.logoURI || null,
        amountIn: amount,
        amountOutFormatted: q.amountOutFormatted || q.amountOut || '0',
        priceImpact: q.priceImpact || null,
        gasEstimateUSD: q.gasEstimateUSD || null,
        route: q.route || `${fromTokenInfo.symbol} → ${toTokenInfo.symbol}`,
        chainId: fromChainId,
        toChainId,
        fromChainName: chainNames[fromChainId] || `Chain ${fromChainId}`,
        toChainName: chainNames[toChainId] || `Chain ${toChainId}`,
        isCrossChain,
        slippageBps,
        params: {
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn: amount,
          decimalsIn,
          decimalsOut,
          chainId: fromChainId,
          toChainId: isCrossChain ? toChainId : undefined,
          slippageBps,
        },
        quote: {
          ok: q.ok,
          source: q.source,
          chainId: fromChainId,
          toChainId: isCrossChain ? toChainId : undefined,
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn: q.amountIn || amount,
          amountOut: q.amountOut || '0',
          amountOutFormatted: q.amountOutFormatted,
          priceImpact: q.priceImpact,
          gasEstimateUSD: q.gasEstimateUSD,
          route: q.route,
          methodParameters: q.methodParameters,
          spender: q.spender,
        },
      },
    };
  } catch {
    return { error: 'Swap quote unavailable. Try again or try different tokens/chains.' };
  }
}

// ---------------------------------------------------------------------------
// compare_swap_routes — compare Uniswap fee tiers + LI.FI aggregator
// ---------------------------------------------------------------------------

export async function executeCompareSwapRoutes(args: Record<string, unknown>, walletAddress: string | null) {
  const tokenInSymbol = (args.tokenIn as string || '').toUpperCase();
  const tokenOutSymbol = (args.tokenOut as string || '').toUpperCase();
  const amount = args.amount as string;

  if (!tokenInSymbol || !tokenOutSymbol || !amount) {
    return { error: 'Missing required parameters: tokenIn, tokenOut, amount' };
  }

  const chainId = 8453;
  const [addrIn, addrOut] = await Promise.all([
    resolveTokenAddress(tokenInSymbol, chainId),
    resolveTokenAddress(tokenOutSymbol, chainId),
  ]);

  if (!addrIn) return { error: `Could not find token "${tokenInSymbol}" on Base. Try the contract address.` };
  if (!addrOut) return { error: `Could not find token "${tokenOutSymbol}" on Base. Try the contract address.` };

  try {
    // Run subgraph pool query and LI.FI quote IN PARALLEL to avoid timeout
    const [poolData, lifiResult] = await Promise.all([
      subgraphQuery<{
        pools: Array<{
          id: string;
          feeTier: string;
          token0Price: string;
          token1Price: string;
          totalValueLockedUSD: string;
          liquidity: string;
          token0: { id: string; symbol: string; decimals: string };
          token1: { id: string; symbol: string; decimals: string };
        }>;
      }>(
        chainId,
        `{ pools(where: { token0_in: ["${addrIn}", "${addrOut}"], token1_in: ["${addrIn}", "${addrOut}"] }, first: 10, orderBy: totalValueLockedUSD, orderDirection: desc) { id feeTier token0Price token1Price totalValueLockedUSD liquidity token0 { id symbol decimals } token1 { id symbol decimals } } }`
      ),
      executeGetSwapQuote(
        { fromToken: addrIn, toToken: addrOut, amount, fromChainId: chainId, toChainId: chainId },
        walletAddress
      ).catch(() => null),
    ]);

    const pools = poolData.pools || [];

    // Build route comparison from subgraph data
    const routes = pools.map((pool) => {
      const isToken0In = pool.token0.id.toLowerCase() === addrIn;
      const effectivePrice = isToken0In
        ? parseFloat(pool.token0Price)
        : parseFloat(pool.token1Price);

      const feeBps = parseInt(pool.feeTier);
      const feeMultiplier = 1 - feeBps / 1000000;
      const estimatedOutput = parseFloat(amount) * effectivePrice * feeMultiplier;

      return {
        feeTier: `${feeBps / 10000}%`,
        feeBps,
        poolTVL: `$${formatCompact(parseFloat(pool.totalValueLockedUSD))}`,
        effectivePrice: effectivePrice.toFixed(6),
        estimatedOutput: estimatedOutput.toFixed(6),
        outputToken: isToken0In ? pool.token1.symbol : pool.token0.symbol,
      };
    });

    routes.sort((a, b) => parseFloat(b.estimatedOutput) - parseFloat(a.estimatedOutput));

    // Extract LI.FI quote if available
    let lifiQuote: { amountOut: string; route: string; gasEstimate: string } | null = null;
    if (lifiResult && typeof lifiResult === 'object' && 'quote' in (lifiResult as any)) {
      const q = (lifiResult as any).quote;
      lifiQuote = {
        amountOut: q.amountOutFormatted || q.amountOut || '0',
        route: q.route || 'Aggregated',
        gasEstimate: q.gasEstimateUSD || 'N/A',
      };
    }

    // Determine recommendation
    let recommendation = '';
    if (routes.length > 0 && lifiQuote) {
      const bestUniswap = parseFloat(routes[0].estimatedOutput);
      const lifiOutput = parseFloat(lifiQuote.amountOut);
      if (lifiOutput > bestUniswap) {
        recommendation = `LI.FI aggregator gives ${((lifiOutput / bestUniswap - 1) * 100).toFixed(2)}% better output. Recommended for this swap.`;
      } else {
        recommendation = `Uniswap ${routes[0].feeTier} pool gives the best rate. Direct swap recommended.`;
      }
    } else if (routes.length > 0) {
      recommendation = `Best rate via Uniswap ${routes[0].feeTier} pool.`;
    }

    return {
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      amount,
      uniswapRoutes: routes,
      lifiAggregator: lifiQuote
        ? {
            estimatedOutput: lifiQuote.amountOut,
            route: lifiQuote.route,
            gasEstimateUSD: lifiQuote.gasEstimate,
          }
        : { note: 'LI.FI quote unavailable' },
      recommendation,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to compare swap routes' };
  }
}

// ---------------------------------------------------------------------------
// prepare_transfer — prepare an ERC-20 or native token transfer
// ---------------------------------------------------------------------------

export async function executePrepareTransfer(args: Record<string, unknown>, walletAddress: string | null) {
  if (!walletAddress) {
    return { error: 'No wallet connected. Ask the user to connect their wallet before transferring.' };
  }

  const tokenAddress = args.tokenAddress as string;
  const toAddress = args.toAddress as string;
  const amount = args.amount as string;
  const chainId = (args.chainId as number) || 8453;

  if (!tokenAddress) return { error: 'Missing token address' };
  if (!toAddress) return { error: 'Missing destination address' };
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return { error: 'Invalid amount. Provide a positive number.' };
  }

  // Validate destination address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    return { error: 'Invalid destination address format. Must be a valid Ethereum address (0x...).' };
  }

  // Validate chain
  const chainNames: Record<number, string> = { 1: 'Ethereum', 8453: 'Base', 137: 'Polygon', 42161: 'Arbitrum', 4663: 'Robinhood' };
  if (!chainNames[chainId]) {
    return { error: `Unsupported chain: ${chainId}. Only Ethereum (1), Base (8453), Polygon (137), Arbitrum (42161), and Robinhood (4663) are supported.` };
  }

  const isNative = tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000';

  let symbol: string;
  let decimals: number;

  if (isNative) {
    symbol = chainId === 137 ? 'MATIC' : 'ETH';
    decimals = 18;
  } else {
    // Fast-path map first, then the token registry (SSOT) so chain-specific
    // stables like USDG on Robinhood resolve without an on-chain metadata call.
    const registryToken = byAddress(tokenAddress, chainId);
    const known = TRANSFER_KNOWN_TOKENS[tokenAddress.toLowerCase()]
      || (registryToken ? { symbol: registryToken.symbol, decimals: registryToken.decimals } : undefined);
    if (known) {
      symbol = known.symbol;
      decimals = known.decimals;
    } else {
      // Fetch symbol and decimals from chain
      const rpcUrl = RPC_URLS[chainId];
      if (!rpcUrl) return { error: `No RPC for chain ${chainId}` };

      try {
        const [decRes, symRes] = await Promise.all([
          fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'] }) }),
          fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: tokenAddress, data: '0x95d89b41' }, 'latest'] }) }),
        ]);
        const [decData, symData] = await Promise.all([decRes.json(), symRes.json()]);
        decimals = parseInt(decData.result || '0x12', 16);
        symbol = '???';
        try {
          const hex = (symData.result || '').slice(2);
          if (hex.length >= 128) {
            const len = parseInt(hex.slice(64, 128), 16);
            const strHex = hex.slice(128, 128 + len * 2);
            symbol = decodeHexString(strHex);
          }
        } catch { /* keep ??? */ }
      } catch {
        return { error: 'Could not resolve token metadata. Check the token address.' };
      }
    }
  }

  return {
    transfer: {
      tokenSymbol: symbol,
      tokenAddress,
      amount,
      toAddress,
      chainId,
      chainName: chainNames[chainId],
      decimals,
    },
  };
}
