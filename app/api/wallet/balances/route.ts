import { NextRequest, NextResponse } from 'next/server';
import { type Address, erc20Abi } from 'viem';
import { baseClient, polygonClient, ethereumClient, robinhoodClient } from '@/lib/viem/clients';
import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { getHLBalance, getHLWithdrawable } from '@/lib/hyperliquid/deposit';
import { WALLET_BALANCE_TOKENS } from '@/lib/tokens/registry';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

// Stablecoin "cash" balances per chain (all 6-decimal USD stablecoins) —
// derived from the token registry (lib/tokens/registry.ts), the single source
// of truth. Add a wallet cash token by setting `walletBalance: true` on its
// registry entry.
const USDC_ADDRESSES = WALLET_BALANCE_TOKENS;

const ARBITRUM_RPC_URL = httpRpcUrl('arbitrum');

const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC_URL, { timeout: 10_000 }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients: Record<string, { readContract: (...args: any[]) => Promise<any> }> = {
  base: baseClient,
  polygon: polygonClient,
  ethereum: ethereumClient,
  arbitrum: arbitrumClient,
  robinhood: robinhoodClient,
};

// In-memory cache keyed by address (15s TTL — matches the old refetchInterval cadence)
const balanceCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 15_000;

/**
 * GET /api/wallet/balances?address=0x...
 *
 * Batch-fetches all USDC balances across Base, Polygon, Arbitrum, Ethereum
 * in a single server-side call. Replaces 5+ individual client-side RPC hooks.
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address') as Address | null;

    if (!address) {
      return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
    }

    // Check in-memory cache
    const cacheKey = address.toLowerCase();
    const cached = balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'private, s-maxage=15, stale-while-revalidate=30' },
      });
    }

    // Batch-fetch all balances in parallel across all chains
    const results: Record<string, Record<string, { formatted: string; value: string; decimals: number }>> = {};

    const promises = Object.entries(USDC_ADDRESSES).flatMap(([chain, tokens]) =>
      tokens.map(async ({ address: tokenAddress, label }) => {
        try {
          const balance = await clients[chain].readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
          const decimals = 6; // All USDC variants are 6 decimals
          const formatted = (Number(balance) / 10 ** decimals).toString();
          if (!results[chain]) results[chain] = {};
          results[chain][label] = { formatted, value: balance.toString(), decimals };
        } catch (err) {
          console.warn(`[wallet/balances] Failed to fetch ${label} on ${chain}:`, err);
          if (!results[chain]) results[chain] = {};
          results[chain][label] = { formatted: '0', value: '0', decimals: 6 };
        }
      })
    );

    // Fetch HL balance + withdrawable in parallel with USDC balances.
    // hlBalance is account equity (used by trading UI); hlWithdrawable is
    // net of locked margin (used by the withdraw flow). Withdrawable returns
    // null on fetch failure so the UI can distinguish "error" from "zero".
    let hlBalance = 0;
    let hlWithdrawable: number | null = null;
    const hlBalancePromise = getHLBalance(address)
      .then(bal => { hlBalance = bal; })
      .catch(() => { /* HL failure is non-blocking */ });
    const hlWithdrawablePromise = getHLWithdrawable(address)
      .then(w => { hlWithdrawable = w; })
      .catch(() => { /* already returns null on error */ });

    await Promise.all([...promises, hlBalancePromise, hlWithdrawablePromise]);

    const responseData = {
      address,
      balances: results,
      hlBalance,
      hlWithdrawable,
      timestamp: Date.now(),
    };

    // Cache the result
    balanceCache.set(cacheKey, { data: responseData, ts: Date.now() });

    // Prune if too large
    if (balanceCache.size > 100) {
      const oldest = Array.from(balanceCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) balanceCache.delete(oldest[0]);
    }

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'private, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (error: any) {
    console.error('[wallet/balances] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balances', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wallet/balances?address=0x...
 *
 * Invalidate the cached balance entry for a given address. Called by the
 * Move Funds modal immediately after a Hyperliquid withdraw so the next
 * GET reflects the post-withdraw state instead of serving the 15s-stale
 * pre-withdraw snapshot.
 */
export async function DELETE(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }
  balanceCache.delete(address.toLowerCase());
  return NextResponse.json({ ok: true });
}
