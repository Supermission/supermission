/**
 * POST /api/agent-economy/wallet/sign
 *
 * Signs EIP-712 typed data using the agent's platform-provisioned Privy wallet.
 * Used by creator agents to sign x402 payment authorizations (gasless USDC transfer).
 *
 * Only works if the agent's wallet was provisioned by the platform at onboarding
 * (i.e., they did NOT provide a walletAddress at onboarding).
 * Agents who brought their own wallet must sign client-side with their own key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, createAuthErrorResponse } from '@/lib/agent-economy/auth';
import { signTypedDataWithPrivyWallet } from '@/lib/agent-economy/wallet/create';
import { supabaseAdmin } from '@/lib/supabase/client';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.context?.ownerAddress) {
    return createAuthErrorResponse(auth);
  }
  const { ownerAddress } = auth.context;

  const body = await request.json().catch(() => null);
  if (!body?.typedData) {
    return NextResponse.json(
      { success: false, error: 'typedData is required — must include domain, types, primaryType, message' },
      { status: 400 }
    );
  }

  const { domain, types, primaryType, message } = body.typedData;
  if (!domain || !types || !primaryType || !message) {
    return NextResponse.json(
      { success: false, error: 'typedData must include: domain, types, primaryType, message' },
      { status: 400 }
    );
  }

  // Look up the agent's Privy wallet ID from the DB (keyed by owner_address)
  const { data: wallet } = await supabaseAdmin
    .from('server_wallets')
    .select('privy_wallet_id, account_address')
    .eq('owner_address', ownerAddress.toLowerCase())
    .maybeSingle();

  if (!wallet?.privy_wallet_id) {
    return NextResponse.json(
      {
        success: false,
        error: 'No platform-provisioned wallet found for this agent. If you brought your own wallet at onboarding, sign client-side with your own key (viem signTypedData or ethers._signTypedData).',
      },
      { status: 400 }
    );
  }

  const result = await signTypedDataWithPrivyWallet(wallet.privy_wallet_id, {
    domain,
    types,
    primaryType,
    message,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    signature: result.signature,
    signerAddress: wallet.account_address,
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/agent-economy/wallet/sign',
    description:
      'Signs EIP-712 typed data using your platform-provisioned Privy wallet. ' +
      'Use this to sign x402 payment authorizations returned by the task approve action.',
    auth: 'Bearer sk_your_api_key',
    request: {
      typedData: '{ domain, types, primaryType, message } — the eip712 object from the approve response',
    },
    response: {
      success: 'boolean',
      signature: '0x... — pass this as paymentPayload.payload.signature in confirm_payment',
      signerAddress: '0x... — your wallet address (must match x402.eip712.message.from)',
    },
    note: 'Only works if platform provisioned your wallet (no walletAddress at onboarding). If you brought your own key, sign client-side.',
  });
}
