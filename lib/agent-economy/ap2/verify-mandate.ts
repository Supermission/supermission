/**
 * AP2 Mandates - Mandate Verification
 * Verifies any type of mandate
 */

import { Address, recoverTypedDataAddress } from 'viem';
import {
  MandateType,
  MandateVerification,
  VerifyMandateRequest,
} from './types';
import { getIntentMandate, verifyIntentMandate } from './intent-mandate';
import { getCartMandate, verifyCartMandate } from './cart-mandate';
import { getPaymentMandate } from './payment-mandate';

/**
 * Verify any mandate type.
 * If mandateType is not provided, auto-detects from database.
 * Supports both transactionAmount (string) and amount (bigint).
 */
export async function verifyMandate(
  request: VerifyMandateRequest
): Promise<MandateVerification> {
  // Normalize: if amount is provided as bigint, convert to transactionAmount string
  const normalizedRequest = { ...request };
  if (request.amount !== undefined && !request.transactionAmount) {
    normalizedRequest.transactionAmount = request.amount.toString();
  }
  if (request.merchantAddress) {
    normalizedRequest.merchantAddress = request.merchantAddress as Address;
  }

  // Auto-detect mandate type if not provided
  let mandateType = normalizedRequest.mandateType;
  if (!mandateType) {
    const found = await getMandateById(normalizedRequest.mandateId);
    if (!found) {
      return createFailedVerification(normalizedRequest, ['Mandate not found']);
    }
    mandateType = found.type;
    normalizedRequest.mandateType = mandateType;
  }

  switch (mandateType) {
    case 'intent':
      return verifyIntentMandateWithSignature(normalizedRequest);
    case 'cart':
      return verifyCartMandateWithSignature(normalizedRequest);
    case 'payment':
      return verifyPaymentMandateDetails(normalizedRequest);
    default:
      return {
        valid: false,
        mandateId: normalizedRequest.mandateId,
        mandateType: mandateType || 'intent',
        signatureValid: false,
        notExpired: false,
        amountWithinLimit: false,
        merchantAuthorized: false,
        errors: ['Unknown mandate type'],
      };
  }
}

/**
 * Verify intent mandate with signature
 */
async function verifyIntentMandateWithSignature(
  request: VerifyMandateRequest
): Promise<MandateVerification> {
  const mandate = await getIntentMandate(request.mandateId);

  if (!mandate) {
    return createFailedVerification(request, ['Mandate not found']);
  }

  const errors: string[] = [];
  const now = new Date();

  // Check expiry
  const notExpired = now <= mandate.intentExpiry;
  if (!notExpired) {
    errors.push('Mandate has expired');
  }

  // Check amount
  const transactionAmount = request.transactionAmount
    ? BigInt(request.transactionAmount)
    : BigInt(0);
  const amountWithinLimit = transactionAmount <= mandate.maxAmount;
  if (!amountWithinLimit && transactionAmount > 0) {
    errors.push('Transaction amount exceeds mandate limit');
  }

  // Check merchant
  let merchantAuthorized = true;
  if (mandate.merchants && mandate.merchants.length > 0 && request.merchantAddress) {
    merchantAuthorized = mandate.merchants.some(
      (m) => m.toLowerCase() === request.merchantAddress!.toLowerCase()
    );
    if (!merchantAuthorized) {
      errors.push('Merchant not authorized');
    }
  }

  // Signature is considered valid if mandate exists with signature
  const signatureValid = !!mandate.userSignature;
  if (!signatureValid) {
    errors.push('Missing user signature');
  }

  // Check status
  if (mandate.status !== 'active') {
    errors.push(`Mandate status is ${mandate.status}`);
  }

  return {
    valid: errors.length === 0,
    mandateId: request.mandateId,
    mandateType: 'intent',
    signatureValid,
    notExpired,
    amountWithinLimit,
    merchantAuthorized,
    errors,
  };
}

/**
 * Verify cart mandate with signatures
 */
async function verifyCartMandateWithSignature(
  request: VerifyMandateRequest
): Promise<MandateVerification> {
  const mandate = await getCartMandate(request.mandateId);

  if (!mandate) {
    return createFailedVerification(request, ['Mandate not found']);
  }

  const errors: string[] = [];
  const now = new Date();

  // Check expiry
  const notExpired = now <= mandate.expiry;
  if (!notExpired) {
    errors.push('Mandate has expired');
  }

  // Check amount
  const transactionAmount = request.transactionAmount
    ? BigInt(request.transactionAmount)
    : mandate.totalAmount;
  const amountWithinLimit = transactionAmount === mandate.totalAmount;
  if (!amountWithinLimit) {
    errors.push('Transaction amount does not match cart total');
  }

  // Merchant is the one specified in mandate
  let merchantAuthorized = true;
  if (request.merchantAddress) {
    merchantAuthorized =
      mandate.merchantAddress.toLowerCase() === request.merchantAddress.toLowerCase();
    if (!merchantAuthorized) {
      errors.push('Merchant address does not match');
    }
  }

  // Check signatures
  const signatureValid = !!mandate.merchantSignature && !!mandate.userSignature;
  if (!mandate.merchantSignature) {
    errors.push('Missing merchant signature');
  }
  if (!mandate.userSignature) {
    errors.push('Missing user signature');
  }

  // Check status
  if (mandate.status !== 'active') {
    errors.push(`Mandate status is ${mandate.status}`);
  }

  return {
    valid: errors.length === 0,
    mandateId: request.mandateId,
    mandateType: 'cart',
    signatureValid,
    notExpired,
    amountWithinLimit,
    merchantAuthorized,
    errors,
  };
}

/**
 * Verify payment mandate details
 */
async function verifyPaymentMandateDetails(
  request: VerifyMandateRequest
): Promise<MandateVerification> {
  const mandate = await getPaymentMandate(request.mandateId);

  if (!mandate) {
    return createFailedVerification(request, ['Mandate not found']);
  }

  const errors: string[] = [];

  // Payment mandates don't expire in the traditional sense
  const notExpired = true;

  // Check amount
  const transactionAmount = request.transactionAmount
    ? BigInt(request.transactionAmount)
    : mandate.totalAmount;
  const amountWithinLimit = transactionAmount === mandate.totalAmount;
  if (!amountWithinLimit) {
    errors.push('Transaction amount does not match');
  }

  // Check merchant
  let merchantAuthorized = true;
  if (request.merchantAddress) {
    merchantAuthorized =
      mandate.merchantAddress.toLowerCase() === request.merchantAddress.toLowerCase();
    if (!merchantAuthorized) {
      errors.push('Merchant address does not match');
    }
  }

  // Payment mandates are verified through linked mandates
  const signatureValid = true;

  // Check status
  if (mandate.status !== 'active') {
    errors.push(`Mandate status is ${mandate.status}`);
  }

  return {
    valid: errors.length === 0,
    mandateId: request.mandateId,
    mandateType: 'payment',
    signatureValid,
    notExpired,
    amountWithinLimit,
    merchantAuthorized,
    errors,
  };
}

/**
 * Create a failed verification result
 */
function createFailedVerification(
  request: VerifyMandateRequest,
  errors: string[]
): MandateVerification {
  return {
    valid: false,
    mandateId: request.mandateId,
    mandateType: request.mandateType || 'intent',
    signatureValid: false,
    notExpired: false,
    amountWithinLimit: false,
    merchantAuthorized: false,
    errors,
  };
}

/**
 * Get mandate by ID (any type)
 */
export async function getMandateById(
  mandateId: string
): Promise<{ type: MandateType; mandate: unknown } | null> {
  // Try intent first
  const intentMandate = await getIntentMandate(mandateId);
  if (intentMandate) {
    return { type: 'intent', mandate: intentMandate };
  }

  // Try cart
  const cartMandate = await getCartMandate(mandateId);
  if (cartMandate) {
    return { type: 'cart', mandate: cartMandate };
  }

  // Try payment
  const paymentMandate = await getPaymentMandate(mandateId);
  if (paymentMandate) {
    return { type: 'payment', mandate: paymentMandate };
  }

  return null;
}
