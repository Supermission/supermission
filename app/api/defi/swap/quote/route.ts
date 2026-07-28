import { NextRequest, NextResponse } from 'next/server';
import { parseUnits, formatUnits } from 'viem';
import type { NormalizedQuoteResponse } from '@/lib/uniswap/types';
import { getUniswapQuote } from '@/lib/uniswap/trade-api';
import { safeParseInt } from '@/lib/validation';

const LIFI_QUOTE_URL = 'https://li.quest/v1/quote';

function isAddressLike(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

interface SwapQuoteRequest {
  chainId: number;
  toChainId?: number;       // optional, defaults to chainId for same-chain swaps
  tokenIn: string;
  tokenOut: string;
  amount: string;            // raw units (wei)
  type?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  taker: string;
  slippageBps?: number;
  decimalsIn?: number;       // if amount is in whole units, provide decimals
}

/**
 * Unified swap quote endpoint.
 * For same-chain Base swaps: tries Uniswap Trade API first, falls back to LI.FI.
 * For cross-chain or non-Base swaps: uses LI.FI directly.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SwapQuoteRequest;

    // Validate chain
    const chainId = Number(body.chainId);
    if (!chainId || chainId <= 0) {
      return NextResponse.json(
        { ok: false, error: 'chainId must be a positive number' },
        { status: 400 }
      );
    }

    const toChainId = Number(body.toChainId || chainId);
    if (!toChainId || toChainId <= 0) {
      return NextResponse.json(
        { ok: false, error: 'toChainId must be a positive number' },
        { status: 400 }
      );
    }

    // Validate addresses
    if (!isAddressLike(body.tokenIn)) {
      return NextResponse.json({ ok: false, error: 'tokenIn must be a valid address' }, { status: 400 });
    }
    if (!isAddressLike(body.tokenOut)) {
      return NextResponse.json({ ok: false, error: 'tokenOut must be a valid address' }, { status: 400 });
    }
    if (chainId === toChainId && body.tokenIn.toLowerCase() === body.tokenOut.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'tokenIn and tokenOut cannot be the same on the same chain' }, { status: 400 });
    }
    if (!isAddressLike(body.taker)) {
      return NextResponse.json({ ok: false, error: 'taker address is required' }, { status: 400 });
    }

    // Validate decimalsIn range [0, 18]
    if (body.decimalsIn !== undefined) {
      const decimalsIn = safeParseInt(String(body.decimalsIn), -1);
      if (decimalsIn < 0 || decimalsIn > 18) {
        return NextResponse.json({ ok: false, error: 'decimalsIn must be between 0 and 18' }, { status: 400 });
      }
    }

    // Parse amount
    let rawAmount = body.amount;
    if (body.decimalsIn !== undefined) {
      rawAmount = parseUnits(body.amount, body.decimalsIn).toString();
    }
    if (!rawAmount || BigInt(rawAmount) <= 0n) {
      return NextResponse.json({ ok: false, error: 'amount must be > 0' }, { status: 400 });
    }

    // Cap to 10,000 USDC equivalent (6 decimals) to match /api/trade/swap/quote
    const AMOUNT_CAP = parseUnits('10000', 6);
    if (body.decimalsIn === 6 && BigInt(rawAmount) > AMOUNT_CAP) {
      return NextResponse.json({ ok: false, error: 'amount too large (max 10,000 USDC equivalent)' }, { status: 400 });
    }

    // Slippage: convert from basis points to decimal (e.g. 50 bps -> 0.005)
    const slippageBps = Math.max(5, Math.min(500, Number(body.slippageBps ?? 50)));
    const slippageDecimal = slippageBps / 10_000;

    // ── Uniswap Trade API: primary routing for same-chain Base swaps ──
    const isSameChainBase = chainId === 8453 && toChainId === chainId;
    if (isSameChainBase) {
      try {
        const uniQuote = await getUniswapQuote({
          chainId,
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amount: rawAmount,
          type: body.type || 'EXACT_INPUT',
          swapper: body.taker,
          slippageTolerance: slippageBps,
        });

        // Build route description from Uniswap response
        const routeStr = uniQuote.quote.routeString || 'Uniswap';

        const response: NormalizedQuoteResponse = {
          ok: true,
          source: 'uniswap',
          chainId,
          toChainId: chainId,
          tokenIn: body.tokenIn,
          tokenOut: body.tokenOut,
          amountIn: rawAmount,
          amountOut: uniQuote.quote.quote,
          amountOutFormatted: uniQuote.quote.quoteDecimals,
          priceImpact: uniQuote.quote.priceImpact,
          gasEstimate: uniQuote.quote.gasEstimate,
          gasEstimateUSD: uniQuote.quote.gasEstimateUSD,
          route: routeStr,
          methodParameters: uniQuote.quote.methodParameters
            ? {
                calldata: uniQuote.quote.methodParameters.calldata,
                value: uniQuote.quote.methodParameters.value,
                to: uniQuote.quote.methodParameters.to,
              }
            : undefined,
          permitData: uniQuote.permitData as Record<string, unknown> | undefined,
          spender: uniQuote.quote.methodParameters?.to,
          rawQuote: uniQuote,
        };

        console.log('[Swap Quote] Uniswap Trade API success:', {
          chainId,
          tokenIn: body.tokenIn.slice(0, 10),
          tokenOut: body.tokenOut.slice(0, 10),
          amountOut: uniQuote.quote.quoteDecimals,
          gasUSD: uniQuote.quote.gasEstimateUSD,
          routing: uniQuote.routing,
        });

        return NextResponse.json(response);
      } catch (uniErr) {
        // Uniswap Trade API failed — fall through to LI.FI
        console.warn('[Swap Quote] Uniswap Trade API failed, falling back to LI.FI:', {
          error: uniErr instanceof Error ? uniErr.message : String(uniErr),
          chainId,
          tokenIn: body.tokenIn.slice(0, 10),
          tokenOut: body.tokenOut.slice(0, 10),
        });
      }
    }

    // ── LI.FI: fallback for Base same-chain, primary for cross-chain / other chains ──
    // Build LI.FI quote request
    const url = new URL(LIFI_QUOTE_URL);
    url.searchParams.set('fromChain', String(chainId));
    url.searchParams.set('toChain', String(toChainId));
    url.searchParams.set('fromToken', body.tokenIn);
    url.searchParams.set('toToken', body.tokenOut);
    url.searchParams.set('fromAmount', rawAmount);
    url.searchParams.set('fromAddress', body.taker);
    url.searchParams.set('slippage', String(slippageDecimal));

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const apiKey = process.env.LIFI_API_KEY;
    if (apiKey) {
      headers['x-lifi-api-key'] = apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json) {
        const errorMsg = json?.message || json?.error || 'Failed to get swap quote from LI.FI';
        console.warn('[Swap Quote] LI.FI error:', { status: res.status, chainId, toChainId, response: json });
        return NextResponse.json(
          { ok: false, error: errorMsg },
          { status: res.status >= 400 && res.status < 500 ? res.status : 502 }
        );
      }

      // Extract data from LI.FI response
      const estimate = json.estimate || {};
      const transactionRequest = json.transactionRequest || {};
      const action = json.action || {};
      const toToken = action.toToken || {};

      // Format amountOut using toToken decimals
      const amountOut: string = estimate.toAmount || '0';
      let amountOutFormatted: string | undefined;
      if (toToken.decimals !== undefined && amountOut !== '0') {
        try {
          amountOutFormatted = formatUnits(BigInt(amountOut), toToken.decimals);
        } catch {
          // If formatting fails, leave undefined
        }
      }

      // Sum gas costs in USD
      let gasEstimateUSD: string | undefined;
      const gasCosts = estimate.gasCosts;
      if (Array.isArray(gasCosts) && gasCosts.length > 0) {
        const totalUSD = gasCosts.reduce((sum: number, gc: { amountUSD?: string }) => {
          return sum + (parseFloat(gc.amountUSD || '0') || 0);
        }, 0);
        gasEstimateUSD = totalUSD.toFixed(2);
      }

      // Build route string from toolDetails
      const fromSymbol = action.fromToken?.symbol || 'unknown';
      const toSymbol = toToken.symbol || 'unknown';
      const toolName = json.toolDetails?.name || json.tool || 'bridge';
      const routeStr = `${fromSymbol} -> ${toolName} -> ${toSymbol}`;

      // Gas estimate from transaction request or estimate
      const gasEstimate = transactionRequest.gasLimit
        || estimate.gasCosts?.[0]?.amount
        || undefined;

      // For same-chain ERC20→ERC20 swaps, force value to '0x0'
      // LiFi sometimes returns a non-zero value for routes that wrap through native token,
      // but these swaps should NEVER require sending native tokens — UNLESS fromToken IS native
      const NATIVE_ADDRESSES = [
        '0x0000000000000000000000000000000000000000',
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ];
      const isFromNative = NATIVE_ADDRESSES.includes(body.tokenIn.toLowerCase());
      let txValue = transactionRequest.value || '0x0';
      if (chainId === toChainId && !isFromNative && txValue !== '0x0' && txValue !== '0') {
        console.warn('[Swap Quote] Forcing value to 0x0 for same-chain ERC20 swap (was:', txValue, ')');
        txValue = '0x0';
      }

      const response: NormalizedQuoteResponse = {
        ok: true,
        source: 'lifi',
        chainId,
        toChainId,
        tokenIn: body.tokenIn,
        tokenOut: body.tokenOut,
        amountIn: rawAmount,
        amountOut,
        amountOutFormatted,
        gasEstimate: gasEstimate ? String(gasEstimate) : undefined,
        gasEstimateUSD,
        fromAmountUSD: estimate.fromAmountUSD || undefined,
        toAmountUSD: estimate.toAmountUSD || undefined,
        route: routeStr,
        methodParameters: transactionRequest.data
          ? {
              calldata: transactionRequest.data,
              value: txValue,
              to: transactionRequest.to,
            }
          : undefined,
        spender: estimate.approvalAddress || undefined,
        rawQuote: json,
      };

      console.log('[Swap Quote] LI.FI success:', {
        chainId,
        toChainId,
        tokenIn: body.tokenIn.slice(0, 10),
        tokenOut: body.tokenOut.slice(0, 10),
        amountOut: amountOutFormatted,
        gasUSD: gasEstimateUSD,
        tool: toolName,
      });

      return NextResponse.json(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return NextResponse.json(
          { ok: false, error: 'Quote request timed out. Please try again.' },
          { status: 504 }
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error('[Swap Quote] Unexpected error:', e);
    return NextResponse.json(
      { ok: false, error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
