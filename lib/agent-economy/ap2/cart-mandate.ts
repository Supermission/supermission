/**
 * AP2 Mandates - Cart Mandate
 * For human-present scenarios where user approves a specific cart
 */

import { Address, keccak256, encodeAbiParameters } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase/client';

// Use raw client to bypass strict typing for new tables
import {
  CartMandate,
  CartItem,
  CreateCartMandateRequest,
  CartMandateTypedData,
  MandateStatus,
} from './types';
import { CHAIN_ID, EIP712_DOMAIN } from '../constants';
import { generateNonce } from '../wallet/crypto';

/**
 * Create a new cart mandate
 */
export async function createCartMandate(
  request: CreateCartMandateRequest
): Promise<{ mandate: CartMandate; typedData: CartMandateTypedData }> {
  const id = uuidv4();
  const nonce = generateNonce();
  const expiresInSeconds = request.expiresInSeconds || 1800; // Default 30 minutes
  const expiry = new Date(Date.now() + expiresInSeconds * 1000);

  // Convert items and calculate total
  const items: CartItem[] = request.items.map((item) => ({
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unitPrice: BigInt(item.unitPrice),
    currency: item.currency || 'USDC',
  }));

  const totalAmount = items.reduce(
    (sum, item) => sum + item.unitPrice * BigInt(item.quantity),
    BigInt(0)
  );

  const mandate: CartMandate = {
    id,
    type: 'cart',
    cartId: request.cartId,
    items,
    totalAmount,
    currency: 'USDC',
    merchantAddress: request.merchantAddress,
    merchantAgentId: request.merchantAgentId,
    merchantSignature: '', // Will be set after merchant signs
    userAddress: request.userAddress,
    userSignature: '', // Will be set after user signs
    expiry,
    createdAt: new Date(),
    status: 'active',
  };

  // Create hash of items for signing
  const itemsHash = hashCartItems(items);

  // Create EIP-712 typed data for signing
  const typedData: CartMandateTypedData = {
    domain: {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: CHAIN_ID,
      verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
    },
    types: {
      CartMandate: [
        { name: 'cartId', type: 'string' },
        { name: 'totalAmount', type: 'uint256' },
        { name: 'currency', type: 'string' },
        { name: 'merchant', type: 'address' },
        { name: 'itemsHash', type: 'bytes32' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
      CartItem: [
        { name: 'sku', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'quantity', type: 'uint256' },
        { name: 'unitPrice', type: 'uint256' },
      ],
    },
    primaryType: 'CartMandate',
    message: {
      cartId: mandate.cartId,
      totalAmount: mandate.totalAmount,
      currency: mandate.currency,
      merchant: mandate.merchantAddress,
      itemsHash,
      expiry: BigInt(Math.floor(expiry.getTime() / 1000)) as unknown as number,
      nonce,
    },
  };

  return { mandate, typedData };
}

/**
 * Hash cart items for inclusion in signature
 */
function hashCartItems(items: CartItem[]): `0x${string}` {
  const encoded = items.map((item) => ({
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
  }));

  const jsonString = JSON.stringify(encoded);
  return keccak256(new TextEncoder().encode(jsonString)) as `0x${string}`;
}

/**
 * Save a cart mandate with signatures
 */
export async function saveCartMandate(
  mandate: CartMandate,
  merchantSignature: string,
  userSignature: string
): Promise<{ success: boolean; mandateId?: string; error?: string }> {
  try {
    const { error } = await supabaseAdmin.from('ap2_mandates').insert({
      id: mandate.id,
      type: 'cart',
      mandate_data: {
        cartId: mandate.cartId,
        items: mandate.items.map((item) => ({
          ...item,
          unitPrice: item.unitPrice.toString(),
        })),
        totalAmount: mandate.totalAmount.toString(),
        currency: mandate.currency,
        merchantAddress: mandate.merchantAddress,
        merchantAgentId: mandate.merchantAgentId,
        userAddress: mandate.userAddress,
        expiry: mandate.expiry.toISOString(),
      },
      signatures: {
        merchant: merchantSignature,
        user: userSignature,
      },
      status: 'active',
      expires_at: mandate.expiry.toISOString(),
    });

    if (error) {
      console.error('Failed to save cart mandate:', error);
      return { success: false, error: 'Failed to save mandate' };
    }

    return { success: true, mandateId: mandate.id };
  } catch (error) {
    console.error('Error saving cart mandate:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get a cart mandate by ID
 */
export async function getCartMandate(
  mandateId: string
): Promise<CartMandate | null> {
  const { data, error } = await supabaseAdmin
    .from('ap2_mandates')
    .select('*')
    .eq('id', mandateId)
    .eq('type', 'cart')
    .single();

  if (error || !data) {
    return null;
  }

  const mandateData = data.mandate_data as Record<string, unknown>;
  const signatures = data.signatures as Record<string, string>;
  const itemsData = mandateData.items as Array<Record<string, unknown>>;

  return {
    id: data.id,
    type: 'cart',
    cartId: mandateData.cartId as string,
    items: itemsData.map((item) => ({
      sku: item.sku as string,
      name: item.name as string,
      quantity: item.quantity as number,
      unitPrice: BigInt(item.unitPrice as string),
      currency: item.currency as string || 'USDC',
    })),
    totalAmount: BigInt(mandateData.totalAmount as string),
    currency: mandateData.currency as string,
    merchantAddress: mandateData.merchantAddress as Address,
    merchantAgentId: mandateData.merchantAgentId as string | undefined,
    merchantSignature: signatures.merchant || '',
    userAddress: mandateData.userAddress as Address,
    userSignature: signatures.user || '',
    expiry: new Date(mandateData.expiry as string),
    createdAt: new Date(data.created_at),
    status: data.status as MandateStatus,
    linkedPaymentMandateId: mandateData.linkedPaymentMandateId as string | undefined,
  };
}

/**
 * Verify a cart mandate can be used for a transaction
 */
export async function verifyCartMandate(
  mandateId: string,
  transactionAmount?: bigint
): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const mandate = await getCartMandate(mandateId);

  if (!mandate) {
    return { valid: false, errors: ['Mandate not found'] };
  }

  // Check status
  if (mandate.status !== 'active') {
    errors.push(`Mandate is ${mandate.status}`);
  }

  // Check expiry
  if (new Date() > mandate.expiry) {
    errors.push('Mandate has expired');
  }

  // Check signatures are present
  if (!mandate.merchantSignature) {
    errors.push('Missing merchant signature');
  }

  if (!mandate.userSignature) {
    errors.push('Missing user signature');
  }

  // Check amount matches if provided
  if (transactionAmount !== undefined && transactionAmount !== mandate.totalAmount) {
    errors.push(
      `Transaction amount ${transactionAmount} does not match cart total ${mandate.totalAmount}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Use a cart mandate (mark as used)
 */
export async function useCartMandate(
  mandateId: string,
  paymentMandateId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('ap2_mandates')
    .update({
      status: 'used',
      updated_at: new Date().toISOString(),
    })
    .eq('id', mandateId)
    .eq('status', 'active');

  if (error) {
    console.error('Failed to use cart mandate:', error);
    return { success: false, error: 'Failed to update mandate' };
  }

  return { success: true };
}

/**
 * Get cart mandates for a user
 */
export async function getUserCartMandates(
  userAddress: Address,
  status?: MandateStatus
): Promise<CartMandate[]> {
  let query = supabaseAdmin
    .from('ap2_mandates')
    .select('*')
    .eq('type', 'cart')
    .contains('mandate_data', { userAddress });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((record) => {
    const mandateData = record.mandate_data as Record<string, unknown>;
    const signatures = record.signatures as Record<string, string>;
    const itemsData = mandateData.items as Array<Record<string, unknown>>;

    return {
      id: record.id,
      type: 'cart' as const,
      cartId: mandateData.cartId as string,
      items: itemsData.map((item) => ({
        sku: item.sku as string,
        name: item.name as string,
        quantity: item.quantity as number,
        unitPrice: BigInt(item.unitPrice as string),
        currency: item.currency as string || 'USDC',
      })),
      totalAmount: BigInt(mandateData.totalAmount as string),
      currency: mandateData.currency as string,
      merchantAddress: mandateData.merchantAddress as Address,
      merchantAgentId: mandateData.merchantAgentId as string | undefined,
      merchantSignature: signatures.merchant || '',
      userAddress: mandateData.userAddress as Address,
      userSignature: signatures.user || '',
      expiry: new Date(mandateData.expiry as string),
      createdAt: new Date(record.created_at),
      status: record.status as MandateStatus,
    };
  });
}
