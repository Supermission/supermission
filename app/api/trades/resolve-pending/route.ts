import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const POLYGON_CHAIN_ID = 137;
const PUSD_ADDRESS = '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb';
const USDC_E_ADDRESS = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * POST /api/trades/resolve-pending
 *
 * Finds all pending_payout REDEEM records for the authenticated user
 * and attempts to verify payouts via Etherscan using the stored tx hash.
 * Successfully verified records are updated to completed with actual amounts.
 */
export async function POST(request: NextRequest) {
  try {
    const verifiedWallet = request.headers.get('x-verified-wallet')?.split(',')[0];
    if (!verifiedWallet) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json({ resolved: 0, reason: 'No Etherscan API key' });
    }

    // Fetch all pending_payout records for this user
    const { data: pending, error } = await supabaseAdmin
      .from('trade_history')
      .select('id, order_id, shares')
      .eq('user_address', verifiedWallet)
      .eq('status', 'pending_payout')
      .eq('side', 'REDEEM')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !pending || pending.length === 0) {
      return NextResponse.json({ resolved: 0 });
    }

    let resolved = 0;

    for (const record of pending) {
      if (!record.order_id) continue;

      try {
        const url = `https://api.etherscan.io/v2/api?chainid=${POLYGON_CHAIN_ID}&module=proxy&action=eth_getTransactionReceipt&txhash=${record.order_id}&apikey=${ETHERSCAN_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const json = await res.json();

        const receipt = json.result;
        if (!receipt || !receipt.logs) continue;

        const txSuccess = receipt.status === '0x1';
        if (!txSuccess) {
          // Transaction failed on-chain — mark as failed
          await supabaseAdmin
            .from('trade_history')
            .update({ status: 'failed', amount: 0, price: 0 })
            .eq('id', record.id);
          resolved++;
          continue;
        }

        // Extract pUSD or USDC.e payout from Transfer logs
        let totalPayout = 0;
        for (const log of receipt.logs) {
          const logAddr = log.address?.toLowerCase();
          if (
            (logAddr === PUSD_ADDRESS || logAddr === USDC_E_ADDRESS) &&
            log.topics?.[0] === TRANSFER_TOPIC &&
            log.topics?.length >= 3
          ) {
            const recipient = '0x' + log.topics[2].slice(26).toLowerCase();
            if (recipient === verifiedWallet) {
              totalPayout += Number(BigInt(log.data)) / 1e6;
            }
          }
        }

        const payout = Math.round(totalPayout * 100) / 100;
        const shares = record.shares || 0;
        const price = shares > 0 ? payout / shares : 0;

        await supabaseAdmin
          .from('trade_history')
          .update({ amount: payout, price, status: 'completed' })
          .eq('id', record.id);

        resolved++;
      } catch (err) {
        console.warn(`[resolve-pending] Failed for order_id=${record.order_id}:`, err);
      }
    }

    return NextResponse.json({ resolved, total: pending.length, hasMore: pending.length >= 50 });
  } catch (err) {
    console.error('[resolve-pending] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
