/**
 * A2A x402 Extension - Payment Verification
 * Verifies payment signatures before settlement
 */

import { Address, getAddress, recoverTypedDataAddress } from 'viem';
import { supabaseAdmin } from '@/lib/supabase/client';
import {
  PaymentRequirements,
  PaymentPayload,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from './types';
import { validatePaymentPayload } from './sign-payment';
import { validatePaymentRequirements, isPaymentExpired } from './payment-required';
import { isNonceUsed } from '@/lib/x402/nonce-manager';

// Use raw client to bypass strict typing for new tables

/**
 * Verify a payment signature
 */
export async function verifyPayment(
  request: VerifyPaymentRequest
): Promise<VerifyPaymentResponse> {
  const errors: string[] = [];

  try {
    // 1. Validate payload structure
    const payloadValidation = validatePaymentPayload(request.payload);
    if (!payloadValidation.valid) {
      return {
        valid: false,
        errors: payloadValidation.errors,
      };
    }

    // 2. Validate requirements structure
    const requirementsValidation = validatePaymentRequirements(request.requirements);
    if (!requirementsValidation.valid) {
      return {
        valid: false,
        errors: requirementsValidation.errors,
      };
    }

    // 3. Check expiration
    if (isPaymentExpired(request.requirements)) {
      return {
        valid: false,
        errors: ['Payment requirements have expired'],
      };
    }

    // 4. Verify amounts match
    const authValue = BigInt(request.payload.payload.authorization.value);
    const requiredAmount = BigInt(request.requirements.maxAmountRequired);

    if (authValue < requiredAmount) {
      errors.push(
        `Authorized amount ${authValue} is less than required ${requiredAmount}`
      );
    }

    // 5. Verify recipient matches
    const authTo = getAddress(request.payload.payload.authorization.to);
    const requiredTo = getAddress(request.requirements.payTo);

    if (authTo.toLowerCase() !== requiredTo.toLowerCase()) {
      errors.push(
        `Authorization recipient ${authTo} does not match required ${requiredTo}`
      );
    }

    // 6. Verify network matches
    if (request.payload.network !== request.requirements.network) {
      errors.push(
        `Payload network ${request.payload.network} does not match requirements ${request.requirements.network}`
      );
    }

    // 7. Check if nonce has already been used (replay attack prevention)
    const nonce = request.payload.payload.authorization.nonce;
    const nonceUsed = await isNonceUsed(nonce);
    if (nonceUsed) {
      errors.push('Nonce has already been used (replay attack detected)');
      return { valid: false, errors };
    }

    // 8. Verify signature and recover signer
    const signerAddress = await verifySignature(request.payload, request.requirements);

    if (!signerAddress) {
      errors.push('Failed to recover signer address from signature');
      return { valid: false, errors };
    }

    // 9. Verify signer matches the "from" address
    const authFrom = getAddress(request.payload.payload.authorization.from);
    if (signerAddress.toLowerCase() !== authFrom.toLowerCase()) {
      errors.push(
        `Recovered signer ${signerAddress} does not match authorization from ${authFrom}`
      );
    }

    // 10. Check validity window
    const now = Math.floor(Date.now() / 1000);
    const validAfter = Number(request.payload.payload.authorization.validAfter);
    const validBefore = Number(request.payload.payload.authorization.validBefore);

    if (now < validAfter) {
      errors.push('Authorization is not yet valid');
    }

    if (now > validBefore) {
      errors.push('Authorization has expired');
    }

    return {
      valid: errors.length === 0,
      signerAddress,
      errors,
    };
  } catch (error) {
    console.error('Error verifying payment:', error);
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Verify signature and recover signer address
 */
async function verifySignature(
  payload: PaymentPayload,
  requirements: PaymentRequirements
): Promise<Address | null> {
  try {
    const auth = payload.payload.authorization;
    const chainId = 8453;

    // Build EIP-712 auth params for recovery — must match what sign.ts used
    const signerAddress = await recoverTypedDataAddress({
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId,
        verifyingContract: requirements.asset as `0x${string}`,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: auth.from as `0x${string}`,
        to: auth.to as `0x${string}`,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce as `0x${string}`,
      },
      signature: payload.payload.signature as `0x${string}`,
    });

    return signerAddress as Address;
  } catch (error) {
    console.error('Failed to verify signature:', error);
    return null;
  }
}

/**
 * Atomically claim a payment for settlement (anti-replay).
 *
 * 1. Try UPDATE existing pending record → 'settling' (pre-stored payment flow)
 * 2. If no match, check if a record already exists with this hash (replay)
 * 3. If no record at all, INSERT a new anti-replay record with status='settling'
 *    The UNIQUE constraint on payment_hash prevents concurrent double-claims.
 */
export async function claimPaymentForSettlement(
  paymentHash: string,
  authData?: { to: string; amount: string; token: string }
): Promise<boolean> {
  // 1. Try to claim an existing pending record
  const { data } = await supabaseAdmin
    .from('x402_payments')
    .update({
      status: 'settling',
      updated_at: new Date().toISOString(),
    })
    .eq('payment_hash', paymentHash)
    .eq('status', 'pending')
    .select('id');

  if (data && data.length > 0) return true;

  // 2. Check if a record exists with non-pending status (replay)
  const { data: existing } = await supabaseAdmin
    .from('x402_payments')
    .select('status')
    .eq('payment_hash', paymentHash)
    .single();

  if (existing) return false; // Already settling/completed → replay

  // 3. No record exists — create one atomically with status='settling'
  //    The UNIQUE constraint on payment_hash guards against concurrent inserts.
  if (!authData) return false;

  const { error: insertError } = await supabaseAdmin
    .from('x402_payments')
    .insert({
      payment_hash: paymentHash,
      from_agent_id: null,
      to_address: authData.to,
      amount: authData.amount,
      token: authData.token,
      status: 'settling',
      requirements: {},
    });

  if (insertError) return false; // Unique constraint violation = concurrent replay

  return true;
}

/**
 * Release a payment claim (revert back to pending) on settlement failure
 */
export async function releasePaymentClaim(paymentHash: string): Promise<void> {
  await supabaseAdmin
    .from('x402_payments')
    .update({
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('payment_hash', paymentHash)
    .eq('status', 'settling');
}

/**
 * Mark a payment hash as completed with tx hash
 */
export async function markPaymentHashUsed(
  paymentHash: string,
  txHash: string
): Promise<void> {
  await supabaseAdmin
    .from('x402_payments')
    .update({
      status: 'completed',
      tx_hash: txHash,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('payment_hash', paymentHash);
}
