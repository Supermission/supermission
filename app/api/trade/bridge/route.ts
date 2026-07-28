// app/api/trade/bridge/route.ts
// Server-side bridge using Polymarket's native Bridge API
// Flow: Get deposit address → user sends Base USDC → Polymarket auto-bridges to Polygon
import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

const POLYMARKET_BRIDGE = 'https://bridge.polymarket.com';

/**
 * POST /api/trade/bridge
 * Get a Polymarket deposit address for bridging Base USDC → Polygon USDC.e
 *
 * Body: { fromAddress: "0x...", amount: "5000000" (in USDC 6 decimals) }
 * Returns: { depositAddress, method: 'polymarket' }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fromAddress, amount } = body;

    if (!fromAddress || !isAddress(fromAddress)) {
      return NextResponse.json({ error: 'Invalid or missing fromAddress' }, { status: 400 });
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid or missing amount' }, { status: 400 });
    }

    // Check minimum ($1 for Base)
    const amountUsd = Number(amount) / 1e6;
    if (amountUsd < 1) {
      return NextResponse.json({ error: 'Minimum deposit is $1 for Base' }, { status: 400 });
    }

    console.log(`[Bridge API] Polymarket deposit request: ${fromAddress}, amount: ${amount} (${amountUsd} USDC)`);

    // Get deposit address from Polymarket Bridge
    const depositRes = await fetch(`${POLYMARKET_BRIDGE}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: fromAddress }),
    });

    if (!depositRes.ok) {
      const errText = await depositRes.text();
      console.error(`[Bridge API] Polymarket deposit failed (${depositRes.status}):`, errText);
      return NextResponse.json(
        { error: `Failed to get deposit address: ${errText}` },
        { status: 502 }
      );
    }

    const depositData = await depositRes.json();
    // Polymarket returns { address: { evm: "0x...", svm: "...", ... } }
    const depositAddress = depositData?.address?.evm || depositData?.evmAddress;

    if (!depositAddress) {
      console.error('[Bridge API] No EVM deposit address. Response:', JSON.stringify(depositData).slice(0, 500));
      return NextResponse.json(
        { error: 'No EVM deposit address returned from Polymarket' },
        { status: 502 }
      );
    }

    console.log(`[Bridge API] Deposit address: ${depositAddress}`);

    return NextResponse.json({
      depositAddress,
      method: 'polymarket',
    });
  } catch (error: any) {
    console.error('[Bridge API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Bridge request failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trade/bridge?depositAddress=0x...
 * Check deposit status from Polymarket Bridge
 */
export async function GET(req: NextRequest) {
  try {
    const depositAddress = req.nextUrl.searchParams.get('depositAddress');
    if (!depositAddress) {
      return NextResponse.json({ error: 'Missing depositAddress' }, { status: 400 });
    }

    const statusRes = await fetch(`${POLYMARKET_BRIDGE}/status/${depositAddress}`);
    if (!statusRes.ok) {
      return NextResponse.json({ status: 'unknown' });
    }

    const statusData = await statusRes.json();
    return NextResponse.json(statusData);
  } catch (error: any) {
    return NextResponse.json({ status: 'unknown', error: error.message }, { status: 500 });
  }
}
