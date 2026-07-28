/**
 * Step 3: Settle Payment On-Chain
 *
 * Executes the EIP-3009 transferWithAuthorization transaction
 */

import { createSupabaseClient, USDC_ADDRESS, BASE_RPC_URL } from '@supermission/cf-shared';
import type { PaymentWorkflowParams } from '@supermission/cf-shared';
import type { Env } from '../index';
import type { SignedPayload } from './sign-payment';

// EIP-3009 transferWithAuthorization function signature
const TRANSFER_WITH_AUTH_SELECTOR = '0xe3ee160e';

export interface SettleResult {
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  success: boolean;
}

/**
 * Settle the payment on-chain via transferWithAuthorization
 */
export async function settleOnChain(
  params: PaymentWorkflowParams,
  signedPayload: SignedPayload,
  env: Env
): Promise<SettleResult> {
  const supabase = createSupabaseClient(env);
  const rpcUrl = env.BASE_RPC_URL || BASE_RPC_URL;

  // Update status to settling
  await supabase
    .from('x402_payments')
    .update({
      status: 'settling',
      updated_at: new Date().toISOString(),
    })
    .eq('id', signedPayload.x402PaymentId);

  // Anti-replay check: Claim payment hash before settlement
  const paymentHash = await generatePaymentHashAsync(
    signedPayload.authorization.from,
    signedPayload.authorization.to,
    signedPayload.authorization.value.toString(),
    signedPayload.authorization.nonce
  );

  const { data: claimed, error: claimError } = await supabase
    .from('x402_payment_anti_replay')
    .upsert({
      payment_hash: paymentHash,
      status: 'settling',
      to_address: signedPayload.authorization.to,
      amount: signedPayload.authorization.value.toString(),
    }, {
      onConflict: 'payment_hash',
      ignoreDuplicates: false,
    })
    .select('status')
    .single();

  if (claimError) {
    // Check if already settled
    const { data: existing } = await supabase
      .from('x402_payment_anti_replay')
      .select('status, tx_hash')
      .eq('payment_hash', paymentHash)
      .single();

    if (existing?.status === 'completed' || existing?.status === 'settling') {
      throw new Error('Payment already settled or being settled (replay detected)');
    }
  }

  // Encode the transaction data
  const txData = encodeTransferWithAuthorization(signedPayload);

  // Execute via CDP relayer or direct RPC
  const txHash = await executeTransaction(txData, env);

  // Wait for transaction receipt
  const receipt = await waitForReceipt(txHash, rpcUrl);

  if (!receipt.success) {
    // Release the anti-replay claim
    await supabase
      .from('x402_payment_anti_replay')
      .update({ status: 'failed' })
      .eq('payment_hash', paymentHash);

    throw new Error(`Transaction failed: ${receipt.error || 'Unknown error'}`);
  }

  // Mark anti-replay as completed
  await supabase
    .from('x402_payment_anti_replay')
    .update({
      status: 'completed',
      tx_hash: txHash,
    })
    .eq('payment_hash', paymentHash);

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    success: true,
  };
}

/**
 * Encode transferWithAuthorization call data
 */
function encodeTransferWithAuthorization(payload: SignedPayload): string {
  const { authorization, signature } = payload;

  // Split signature into v, r, s
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
  const r = `0x${sig.slice(0, 64)}`;
  const s = `0x${sig.slice(64, 128)}`;
  const v = parseInt(sig.slice(128, 130), 16);

  // ABI encode the parameters
  // transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
  const params = [
    padAddress(authorization.from),
    padAddress(authorization.to),
    padUint256(authorization.value),
    padUint256(authorization.validAfter),
    padUint256(authorization.validBefore),
    padBytes32(authorization.nonce),
    padUint8(v),
    r.slice(2).padStart(64, '0'),
    s.slice(2).padStart(64, '0'),
  ].join('');

  return TRANSFER_WITH_AUTH_SELECTOR + params;
}

/**
 * Execute transaction via CDP relayer
 */
async function executeTransaction(data: string, env: Env): Promise<string> {
  const cdpBaseUrl = 'https://api.developer.coinbase.com/platform';

  // Use CDP to relay the transaction (gas sponsorship)
  const response = await fetch(`${cdpBaseUrl}/v1/transactions/relay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.CDP_API_KEY_SECRET}`,
      'X-Api-Key-Id': env.CDP_API_KEY_ID,
    },
    body: JSON.stringify({
      network: 'base-mainnet',
      to: USDC_ADDRESS,
      data,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CDP relay failed: ${response.status} ${error}`);
  }

  const result = await response.json() as { transaction_hash: string };
  return result.transaction_hash;
}

/**
 * Wait for transaction receipt with timeout
 */
async function waitForReceipt(
  txHash: string,
  rpcUrl: string
): Promise<{ success: boolean; blockNumber: number; gasUsed: number; error?: string }> {
  const maxWait = 60_000; // 60 seconds
  const pollInterval = 2_000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });

    const result = await response.json() as {
      result: {
        status: string;
        blockNumber: string;
        gasUsed: string;
      } | null;
    };

    if (result.result) {
      const success = result.result.status === '0x1';
      return {
        success,
        blockNumber: parseInt(result.result.blockNumber, 16),
        gasUsed: parseInt(result.result.gasUsed, 16),
        error: success ? undefined : 'Transaction reverted',
      };
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    blockNumber: 0,
    gasUsed: 0,
    error: 'Transaction receipt timeout',
  };
}

/**
 * Generate payment hash using Web Crypto
 */
async function generatePaymentHashAsync(
  from: string,
  to: string,
  value: string,
  nonce: string
): Promise<string> {
  const data = `${from.toLowerCase()}:${to.toLowerCase()}:${value}:${nonce}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Encoding helpers
function padAddress(addr: string): string {
  return addr.slice(2).toLowerCase().padStart(64, '0');
}

function padUint256(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function padUint8(value: number): string {
  return value.toString(16).padStart(64, '0');
}

function padBytes32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  return hex.padStart(64, '0');
}
