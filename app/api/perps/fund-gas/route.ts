import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/perps/fund-gas
 *
 * Sends a tiny amount of ETH to a user's wallet on Arbitrum so they
 * can pay gas for the USDC approve + Hyperliquid deposit transactions.
 *
 * Uses a pre-funded Privy server wallet and the Transfer wallet action API,
 * which handles gas internally.
 *
 * Env vars required:
 *   PERPS_GAS_FUNDER_WALLET_ID — Privy server wallet ID pre-funded with ETH on Arbitrum
 */

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;
const GAS_FUNDER_WALLET_ID = process.env.PERPS_GAS_FUNDER_WALLET_ID;

/** ~0.0001 ETH ≈ $0.35 — enough for approve + deposit on Arbitrum */
const GAS_AMOUNT = '0.0001';

async function privyApi(path: string, body: Record<string, unknown>) {
  const auth = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  const res = await fetch(`https://api.privy.io/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'privy-app-id': PRIVY_APP_ID,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Privy API error: ${res.status}`);
  return data;
}

async function getActionStatus(actionId: string) {
  const auth = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  const res = await fetch(`https://api.privy.io/v1/wallets/actions/${actionId}`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'privy-app-id': PRIVY_APP_ID,
    },
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    if (!address) {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    if (!GAS_FUNDER_WALLET_ID) {
      console.error('[fund-gas] PERPS_GAS_FUNDER_WALLET_ID not set');
      return NextResponse.json({ error: 'Gas funder not configured' }, { status: 503 });
    }

    // Use Privy Transfer wallet action — gas is handled by Privy
    const result = await privyApi(`/wallets/${GAS_FUNDER_WALLET_ID}/transfer`, {
      source: {
        asset: 'eth',
        amount: GAS_AMOUNT,
        chain: 'arbitrum',
      },
      destination: {
        address,
      },
    });

    // Poll for completion (Transfer is async)
    const actionId = result.id;
    if (actionId) {
      for (let i = 0; i < 30; i++) {
        const status = await getActionStatus(actionId);
        if (status.status === 'succeeded') {
          return NextResponse.json({ success: true, amount: GAS_AMOUNT });
        }
        if (status.status === 'failed' || status.status === 'rejected') {
          throw new Error(`Gas funding ${status.status}: ${JSON.stringify(status)}`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      // If still pending after 60s, return success anyway — ETH may arrive shortly
      return NextResponse.json({ success: true, pending: true, amount: GAS_AMOUNT });
    }

    return NextResponse.json({ success: true, amount: GAS_AMOUNT });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gas funding failed';
    console.error('[fund-gas] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
