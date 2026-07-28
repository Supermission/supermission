/**
 * Step 2: Sign Payment via CDP
 *
 * Signs the EIP-3009 authorization using CDP wallet
 */

import { createSupabaseClient } from '@supermission/cf-shared';
import type { PaymentWorkflowParams } from '@supermission/cf-shared';
import type { Env } from '../index';
import type { PaymentRequirementsResult } from './create-requirements';

// EIP-712 domain for USDC on Base
const EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 8453, // Base mainnet
  verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
};

// TransferWithAuthorization types
const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

export interface SignedPayload {
  authorization: {
    from: string;
    to: string;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: string;
  };
  signature: string;
  x402PaymentId: string;
}

/**
 * Sign the payment authorization using CDP
 */
export async function signPayment(
  params: PaymentWorkflowParams,
  requirements: PaymentRequirementsResult,
  env: Env
): Promise<SignedPayload> {
  const supabase = createSupabaseClient(env);

  // Get the creator's wallet from database
  const { data: wallet, error: walletError } = await supabase
    .from('agent_wallets')
    .select('address, encrypted_key')
    .eq('id', params.creatorWalletId)
    .single();

  if (walletError || !wallet) {
    throw new Error(`Creator wallet not found: ${params.creatorWalletId}`);
  }

  // Prepare the authorization message
  const authorization = {
    from: wallet.address as `0x${string}`,
    to: params.recipientAddress as `0x${string}`,
    value: BigInt(requirements.requirements.maxAmountRequired),
    validAfter: requirements.validAfter,
    validBefore: requirements.validBefore,
    nonce: requirements.nonce as `0x${string}`,
  };

  // Sign using CDP API
  const signature = await signWithCDP(
    wallet.address,
    params.creatorWalletId,
    authorization,
    env
  );

  // Update payment status to 'signing'
  await supabase
    .from('x402_payments')
    .update({
      status: 'signing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requirements.x402PaymentId);

  return {
    authorization,
    signature,
    x402PaymentId: requirements.x402PaymentId,
  };
}

/**
 * Sign typed data using CDP API
 */
async function signWithCDP(
  address: string,
  walletId: string,
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  },
  env: Env
): Promise<string> {
  // CDP API endpoint for signing
  const cdpBaseUrl = 'https://api.developer.coinbase.com/platform';

  // Prepare EIP-712 typed data
  const typedData = {
    types: TRANSFER_TYPES,
    primaryType: 'TransferWithAuthorization',
    domain: EIP712_DOMAIN,
    message: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value.toString(),
      validAfter: authorization.validAfter.toString(),
      validBefore: authorization.validBefore.toString(),
      nonce: authorization.nonce,
    },
  };

  // Call CDP to sign
  const response = await fetch(`${cdpBaseUrl}/v1/wallets/${walletId}/addresses/${address}/sign_typed_data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CDP_API_KEY_SECRET}`,
      'X-Api-Key-Id': env.CDP_API_KEY_ID,
    },
    body: JSON.stringify({
      typed_data: typedData,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CDP signing failed: ${response.status} ${error}`);
  }

  const result = await response.json() as { signature: string };
  return result.signature;
}
