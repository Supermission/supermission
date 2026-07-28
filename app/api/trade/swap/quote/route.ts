import { NextRequest, NextResponse } from 'next/server';
import { parseUnits } from 'viem';

/**
 * User swap quote endpoint (Base-only).
 *
 * Security model:
 * - This endpoint NEVER signs or broadcasts swaps.
 * - It only returns transaction data for the user's wallet to sign and send.
 * - Hard-restricts chainId to Base (8453) and sellToken to Base USDC.
 *
 * Execution paths supported:
 * - External wallets (wagmi/viem) sign + send returned tx
 * - CDP embedded wallet (cdp-hooks) sign + send returned tx
 */

const BASE_CHAIN_ID = 8453;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

function isAddressLike(x: unknown): x is `0x${string}` {
  return typeof x === 'string' && /^0x[a-fA-F0-9]{40}$/.test(x);
}

function summarize0xError(details: any): string | null {
  if (!details || typeof details !== 'object') return null;
  const msg =
    (typeof details.reason === 'string' && details.reason) ||
    (typeof details.message === 'string' && details.message) ||
    (typeof details.error === 'string' && details.error) ||
    null;
  if (msg) return msg;

  // Common 0x error format: { validationErrors: [{ field, reason, ... }] }
  const ve = (details as any).validationErrors;
  if (Array.isArray(ve) && ve.length > 0) {
    const first = ve[0];
    const field = typeof first?.field === 'string' ? first.field : 'request';
    const reason = typeof first?.reason === 'string' ? first.reason : 'invalid';
    return `${field}: ${reason}`;
  }

  return null;
}

type SwapQuoteRequest = {
  chainId?: number;
  sellToken: `0x${string}` | string;
  buyToken: `0x${string}` | string;
  sellAmount: string; // in whole units (e.g. "100" USDC)
  slippageBps?: number; // e.g. 75 = 0.75%
  taker?: `0x${string}` | string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SwapQuoteRequest;

    const chainId = Number(body.chainId ?? BASE_CHAIN_ID);
    if (chainId !== BASE_CHAIN_ID) {
      return NextResponse.json({ ok: false, error: 'Only Base mainnet is supported' }, { status: 400 });
    }

    if (!isAddressLike(body.sellToken) || body.sellToken.toLowerCase() !== BASE_USDC.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'sellToken must be Base USDC' }, { status: 400 });
    }
    if (!isAddressLike(body.buyToken)) {
      return NextResponse.json({ ok: false, error: 'buyToken must be an address' }, { status: 400 });
    }
    if (body.sellToken.toLowerCase() === body.buyToken.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'sellToken and buyToken cannot be the same' }, { status: 400 });
    }

    // Hard caps to reduce abuse (quote endpoint only, but keep it sane)
    const slippageBps = Math.max(10, Math.min(300, Number(body.slippageBps ?? 100)));
    const sellAmountUnits = parseUnits(String(body.sellAmount ?? '0'), USDC_DECIMALS);
    if (sellAmountUnits <= 0n) {
      return NextResponse.json({ ok: false, error: 'sellAmount must be > 0' }, { status: 400 });
    }
    // Cap to 10,000 USDC per quote to avoid huge request sizes
    const max = parseUnits('10000', USDC_DECIMALS);
    if (sellAmountUnits > max) {
      return NextResponse.json({ ok: false, error: 'sellAmount too large (max 10,000 USDC per quote)' }, { status: 400 });
    }

    const apiKey = process.env.ZEROX_API_KEY || process.env.OX_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'Swap service is not configured. Please try again later.' },
        { status: 503 }
      );
    }

    const url = new URL('https://api.0x.org/swap/permit2/quote');
    // taker is required by 0x API
    if (!isAddressLike(body.taker)) {
      return NextResponse.json(
        { ok: false, error: 'taker address is required. Please connect your wallet to get a swap quote.' },
        { status: 400 }
      );
    }

    url.searchParams.set('chainId', String(BASE_CHAIN_ID));
    url.searchParams.set('sellToken', BASE_USDC);
    url.searchParams.set('buyToken', body.buyToken);
    url.searchParams.set('sellAmount', sellAmountUnits.toString());
    url.searchParams.set('slippageBps', String(slippageBps));
    url.searchParams.set('taker', body.taker);

    // Gas optimizations: Exclude complex/high-gas liquidity sources
    // Prefer simpler, more efficient routes on Base
    // Excludes sources known for complex routing or high gas costs
    const excludedSources = [
      'Balancer_V2',
      'Curve',
      'Curve_V2',
      'DODO',
      'DODO_V2',
      'Bancor',
      'mStable',
      'Shell',
      'Saddle',
    ].join(',');
    url.searchParams.set('excludedSources', excludedSources);

    // Enable slippage protection for better execution
    url.searchParams.set('enableSlippageProtection', 'true');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        '0x-version': 'v2',
      };
      if (apiKey) headers['0x-api-key'] = apiKey;

      const res = await fetch(url.toString(), {
        headers,
        signal: controller.signal,
      });

      // Try to get response as text first, then parse as JSON
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // Response is not JSON
      }

      if (!res.ok || !json) {
        const detailMsg = summarize0xError(json);

        // Log the full error for debugging
        console.error('[Swap Quote] 0x API error:', {
          status: res.status,
          statusText: res.statusText,
          detail: detailMsg,
          fullResponse: json,
          rawResponse: text?.slice(0, 500), // Log first 500 chars of raw response
          requestUrl: url.toString(),
          hasApiKey: !!apiKey,
          request: {
            chainId: BASE_CHAIN_ID,
            sellToken: BASE_USDC,
            buyToken: body.buyToken,
            sellAmount: sellAmountUnits.toString(),
          }
        });

        // Map common 0x errors to user-friendly messages
        let userError = 'Unable to get a swap quote right now. Please try again.';
        if (res.status === 400) {
          // Provide more specific error for 400 responses
          if (detailMsg) {
            userError = `Invalid swap parameters: ${detailMsg}`;
          } else {
            userError = 'Invalid swap parameters. The token pair may not be supported or liquidity may be insufficient.';
          }
        }
        else if (res.status === 429) userError = 'Too many requests. Please wait a moment and try again.';
        else if (detailMsg?.toLowerCase().includes('insufficient')) userError = 'Insufficient liquidity for this swap.';

        return NextResponse.json(
          {
            ok: false,
            error: userError,
            status: res.status,
            details: detailMsg ? { message: detailMsg } : undefined,
            // Keep detail for server-side debugging only
            _debug: detailMsg,
          },
          { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
        );
      }

      // Check for validation issues (balance, allowance, etc.)
      if (json.issues) {
        const issues = json.issues;
        const errors: string[] = [];

        // Check for balance issues
        if (issues.balance) {
          const token = issues.balance.token === BASE_USDC ? 'USDC' : issues.balance.token;
          errors.push(`Insufficient ${token} balance. Required: ${issues.balance.expected || 'unknown'}`);
        }

        // Check for allowance issues
        if (issues.allowance) {
          const actual = issues.allowance.actual || '0';
          const spender = issues.allowance.spender || 'Permit2';
          if (actual === '0' || actual === 0) {
            errors.push(`USDC approval required for Permit2 contract (${spender}). Click "Approve USDC" to enable swaps.`);
          } else {
            errors.push(`Insufficient USDC allowance. Current: ${actual}, need more. Re-approve the contract.`);
          }
        }

        // Check for other issues
        if (issues.simulationIncomplete) {
          errors.push('Swap simulation incomplete - transaction may fail');
        }

        if (errors.length > 0) {
          console.warn('[Swap Quote] Validation issues detected:', issues);
          return NextResponse.json({
            ok: false,
            error: errors.join(' | '),
            details: { issues, message: errors[0] },
            status: 400,
          }, { status: 400 });
        }
      }

      // Log transaction data size for debugging
      const txData = json.transaction?.data || json.data || '';
      const dataSize = txData.length;
      const estimatedGas = json.transaction?.gas || json.gas || 0;

      console.log('[Swap Quote] Transaction info:', {
        dataSize: `${dataSize} bytes (${(dataSize / 2 - 1)} hex chars)`,
        estimatedGas,
        sources: json.sources || 'unknown',
        route: json.route || 'unknown',
        buyToken: body.buyToken,
      });

      // Warn if transaction data is unusually large (>2KB)
      if (dataSize > 4000) {
        console.warn('[Swap Quote] Large transaction data detected:', {
          dataSize,
          possibleCause: 'Complex multi-hop route or many liquidity sources',
          recommendation: 'Consider adding more excludedSources or using a simpler token pair',
        });
      }

      // 0x quote payload typically includes fields like `to`, `data`, `value`, `gas`, `estimatedGas`, etc.
      // We return it verbatim so the client can submit the transaction via wallet.
      return NextResponse.json({
        ok: true,
        source: '0x',
        chainId: BASE_CHAIN_ID,
        sellToken: BASE_USDC,
        buyToken: body.buyToken,
        sellAmount: sellAmountUnits.toString(),
        slippageBps,
        quote: json,
        ...(process.env.NODE_ENV === 'development' && { _debug: { dataSize, estimatedGas, sources: json.sources } }),
      });
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    // Log error for debugging (server-side only)
    console.error('[Swap Quote] Unexpected error:', e);

    // Return user-friendly error message
    const userMessage =
      e instanceof Error && e.message
        ? 'Failed to get swap quote. Please try again in a moment.'
        : 'An unexpected error occurred. Please try again.';

    return NextResponse.json(
      {
        ok: false,
        error: userMessage,
        // Include technical details only in development
        ...(process.env.NODE_ENV === 'development' && {
          _debug: {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
          },
        }),
      },
      { status: 500 }
    );
  }
}

