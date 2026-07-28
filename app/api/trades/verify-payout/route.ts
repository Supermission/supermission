import { NextRequest, NextResponse } from 'next/server';

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';
const POLYGON_CHAIN_ID = 137;
// pUSD on Polygon — the collateral token Polymarket V2 uses
const PUSD_ADDRESS = '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb';
// USDC.e on Polygon — CTF internally holds USDC.e; collateral adapters may return it
const USDC_E_ADDRESS = '0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
// ERC20 Transfer event topic: Transfer(address,address,uint256)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * GET /api/trades/verify-payout?txHash=0x...&address=0x...
 *
 * Uses Etherscan V2 API to check the on-chain tx receipt and extract
 * the actual USDC.e payout from Transfer event logs.
 * Returns { payout: number, verified: boolean }
 */
export async function GET(request: NextRequest) {
  const txHash = request.nextUrl.searchParams.get('txHash');
  const userAddress = request.nextUrl.searchParams.get('address')?.toLowerCase();

  if (!txHash || !userAddress) {
    return NextResponse.json({ error: 'txHash and address required' }, { status: 400 });
  }

  if (!ETHERSCAN_API_KEY) {
    return NextResponse.json({ payout: 0, verified: false, reason: 'No Etherscan API key' });
  }

  try {
    const url = `https://api.etherscan.io/v2/api?chainid=${POLYGON_CHAIN_ID}&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${ETHERSCAN_API_KEY}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const json = await res.json();

    const receipt = json.result;
    if (!receipt || !receipt.logs) {
      return NextResponse.json({ payout: 0, verified: false, reason: 'No receipt or logs found' });
    }

    // Check tx status (1 = success)
    const txSuccess = receipt.status === '0x1';
    if (!txSuccess) {
      return NextResponse.json({ payout: 0, verified: true, reason: 'Transaction failed on-chain' });
    }

    // Scan logs for pUSD or USDC.e Transfer events TO the user's address
    let totalPayout = 0;
    for (const log of receipt.logs) {
      const logAddr = log.address?.toLowerCase();
      if (
        (logAddr === PUSD_ADDRESS || logAddr === USDC_E_ADDRESS) &&
        log.topics?.[0] === TRANSFER_TOPIC &&
        log.topics?.length >= 3
      ) {
        const recipient = '0x' + log.topics[2].slice(26).toLowerCase();
        if (recipient === userAddress) {
          const rawAmount = BigInt(log.data);
          totalPayout += Number(rawAmount) / 1e6;
        }
      }
    }

    return NextResponse.json({
      payout: Math.round(totalPayout * 100) / 100,
      verified: true,
    });
  } catch (err) {
    console.error('[verify-payout] Error:', err);
    return NextResponse.json({ payout: 0, verified: false, reason: 'Etherscan API call failed' });
  }
}
