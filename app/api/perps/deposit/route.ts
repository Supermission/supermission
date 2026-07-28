import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/node';
import { createPublicClient, http, encodeFunctionData, parseUnits, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { httpRpcUrl } from '@/lib/rpc/endpoints';

/**
 * Server-side Hyperliquid deposit API using Privy Node SDK.
 *
 * POST /api/perps/deposit
 * Body: { walletId, address, amount }
 *
 * Uses Privy SDK with authorization signatures and gas sponsorship.
 * The SDK handles privy-authorization-signature header automatically.
 *
 * Env vars required:
 *   NEXT_PUBLIC_PRIVY_APP_ID
 *   PRIVY_APP_SECRET
 *   PRIVY_AUTHORIZATION_KEY — base64-encoded PKCS8 P-256 private key (no PEM headers)
 */

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;
const PRIVY_AUTH_KEY = process.env.PRIVY_AUTHORIZATION_KEY;

const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HL_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';
const ARB_RPC = httpRpcUrl('arbitrum');

const APPROVE_ABI = [{
  name: 'approve',
  type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
  stateMutability: 'nonpayable',
}] as const;

const DEPOSIT_ABI = [{
  name: 'depositUsd',
  type: 'function',
  inputs: [{ name: 'amount', type: 'uint64' }],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const;

const ALLOWANCE_ABI = [{
  name: 'allowance',
  type: 'function',
  inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
  outputs: [{ type: 'uint256' }],
  stateMutability: 'view',
}] as const;

function getPrivyClient() {
  return new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
}

function getAuthContext() {
  if (!PRIVY_AUTH_KEY) return undefined;
  return { authorization_private_keys: [PRIVY_AUTH_KEY] };
}

/** Look up Privy wallet ID from an Ethereum address */
async function resolveWalletId(addressOrId: string): Promise<string> {
  if (!addressOrId.startsWith('0x')) return addressOrId;

  const auth = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64');
  const res = await fetch('https://api.privy.io/v1/wallets/address', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'privy-app-id': PRIVY_APP_ID,
    },
    body: JSON.stringify({ address: addressOrId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[Perps Deposit] Wallet lookup failed:', JSON.stringify(err));
    throw new Error('Could not find wallet. Please try again.');
  }

  const data = await res.json();
  console.log('[Perps Deposit] Resolved wallet:', data.id);
  return data.id;
}

export async function POST(req: NextRequest) {
  try {
    const { walletId: walletIdOrAddress, address, amount } = await req.json();

    if (!walletIdOrAddress || !address || !amount) {
      return NextResponse.json({ error: 'Missing walletId, address, or amount' }, { status: 400 });
    }

    if (!PRIVY_AUTH_KEY) {
      console.error('[Perps Deposit] PRIVY_AUTHORIZATION_KEY env var not set');
      return NextResponse.json({ error: 'Server authorization not configured' }, { status: 503 });
    }

    const walletId = await resolveWalletId(walletIdOrAddress);
    const amountRaw = parseUnits(String(amount), 6);

    // Check USDC balance
    const publicClient = createPublicClient({ chain: arbitrum, transport: http(ARB_RPC) });
    const usdcBalance = await publicClient.readContract({
      address: USDC_ARBITRUM as `0x${string}`,
      abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    if (usdcBalance < amountRaw) {
      return NextResponse.json({
        error: `Insufficient USDC on Arbitrum. Have ${Number(usdcBalance) / 1e6}, need ${amount}`,
      }, { status: 400 });
    }

    const privy = getPrivyClient();
    const authContext = getAuthContext();

    // Step 1: Approve USDC (gas sponsored, with authorization signature)
    const approveData = encodeFunctionData({
      abi: APPROVE_ABI,
      functionName: 'approve',
      args: [HL_BRIDGE as `0x${string}`, amountRaw],
    });

    console.log('[Perps Deposit] Sending approve tx (sponsored + signed)...');
    const approveResult = await privy.wallets().rpc(walletId, {
      method: 'eth_sendTransaction',
      caip2: 'eip155:42161',
      chain_type: 'ethereum',
      sponsor: true,
      params: { transaction: { to: USDC_ARBITRUM, data: approveData } },
      authorization_context: authContext,
    });
    console.log('[Perps Deposit] Approve result:', JSON.stringify(approveResult));

    // Wait for allowance to confirm on-chain
    console.log('[Perps Deposit] Polling for allowance...');
    for (let i = 0; i < 30; i++) {
      try {
        const allowance = await publicClient.readContract({
          address: USDC_ARBITRUM as `0x${string}`,
          abi: ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [address as `0x${string}`, HL_BRIDGE as `0x${string}`],
        });
        if (allowance >= amountRaw) {
          console.log('[Perps Deposit] Allowance confirmed:', formatUnits(allowance, 6));
          break;
        }
      } catch { /* transient RPC error */ }
      await new Promise(r => setTimeout(r, 2000));
    }

    // Step 2: Deposit to Hyperliquid (gas sponsored, with authorization signature)
    const depositData = encodeFunctionData({
      abi: DEPOSIT_ABI,
      functionName: 'depositUsd',
      args: [amountRaw],
    });

    console.log('[Perps Deposit] Sending deposit tx (sponsored + signed)...');
    const depositResult = await privy.wallets().rpc(walletId, {
      method: 'eth_sendTransaction',
      caip2: 'eip155:42161',
      chain_type: 'ethereum',
      sponsor: true,
      params: { transaction: { to: HL_BRIDGE, data: depositData } },
      authorization_context: authContext,
    });
    console.log('[Perps Deposit] Deposit result:', JSON.stringify(depositResult));

    return NextResponse.json({
      success: true,
      approve: approveResult,
      deposit: depositResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Deposit failed';
    console.error('[Perps Deposit] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
