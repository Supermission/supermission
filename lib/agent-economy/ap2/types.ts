/**
 * AP2 Mandates - Types
 * Verifiable Digital Credentials for agent payment accountability
 */

import { Address } from 'viem';

// ==========================================
// Mandate Types
// ==========================================

export type MandateType = 'intent' | 'cart' | 'payment';
export type MandateStatus = 'active' | 'used' | 'expired' | 'revoked';

// ==========================================
// Intent Mandate (Human-not-present)
// ==========================================

export interface IntentMandate {
  id: string;
  type: 'intent';

  // User authorization
  userAddress: Address;
  userSignature: string;

  // Intent parameters
  naturalLanguageDescription: string;
  merchants: Address[] | null; // Approved merchants (null = any)
  skus: string[] | null; // Approved SKUs (null = any)
  maxAmount: bigint;
  currency: string;

  // Constraints
  userCartConfirmationRequired: boolean;
  requiresRefundability: boolean;
  intentExpiry: Date;

  // Metadata
  status: MandateStatus;
  createdAt: Date;
  usedAt?: Date;
  linkedPaymentMandateId?: string;
}

export interface CreateIntentMandateRequest {
  userAddress: Address;
  naturalLanguageDescription: string;
  merchants?: Address[];
  skus?: string[];
  maxAmount: string; // Atomic units as string
  currency?: string;
  userCartConfirmationRequired?: boolean;
  requiresRefundability?: boolean;
  expiresInSeconds?: number;
}

// ==========================================
// Cart Mandate (Human-present)
// ==========================================

export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: bigint;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface CartMandate {
  id: string;
  type: 'cart';

  // Cart details
  cartId: string;
  items: CartItem[];
  totalAmount: bigint;
  currency: string;

  // Merchant
  merchantAddress: Address;
  merchantAgentId?: string;
  merchantSignature: string;

  // User
  userAddress: Address;
  userSignature: string;

  // Timing
  expiry: Date;
  createdAt: Date;

  // Status
  status: MandateStatus;
  linkedPaymentMandateId?: string;
}

export interface CreateCartMandateRequest {
  cartId: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: string;
    currency?: string;
  }>;
  merchantAddress: Address;
  merchantAgentId?: string;
  userAddress: Address;
  expiresInSeconds?: number;
}

// ==========================================
// Payment Mandate (Sent to payment network)
// ==========================================

export interface PaymentMandate {
  id: string;
  type: 'payment';

  // Transaction context
  aiAgentPresent: boolean;
  transactionModality: 'human-present' | 'human-not-present';

  // Payment details
  paymentDetailsId: string;
  totalAmount: bigint;
  currency: string;

  // Parties
  merchantAgentId: string;
  merchantAddress: Address;
  userAddress: Address;

  // Authorization
  userAuthorization: string; // Verifiable presentation

  // Linked mandates (for accountability chain)
  linkedMandates: {
    intentMandateId?: string;
    cartMandateId?: string;
  };

  // Timing
  timestamp: Date;
  createdAt: Date;

  // Status
  status: MandateStatus;
  settlementTxHash?: string;
}

export interface CreatePaymentMandateRequest {
  aiAgentPresent?: boolean;
  transactionModality: 'human-present' | 'human-not-present';
  paymentDetailsId: string;
  totalAmount: string;
  currency?: string;
  merchantAgentId: string;
  merchantAddress: Address;
  userAddress: Address;
  intentMandateId?: string;
  cartMandateId?: string;
}

// ==========================================
// Mandate Verification
// ==========================================

export interface MandateVerification {
  valid: boolean;
  mandateId: string;
  mandateType: MandateType;
  signatureValid: boolean;
  notExpired: boolean;
  amountWithinLimit: boolean;
  merchantAuthorized: boolean;
  errors: string[];
}

export interface VerifyMandateRequest {
  mandateId: string;
  mandateType?: MandateType; // Optional — auto-detected from DB when not provided
  signature?: string;
  transactionAmount?: string;
  amount?: bigint; // Alternative to transactionAmount (bigint form)
  merchantAddress?: Address | string;
}

// ==========================================
// EIP-712 Types for Signing
// ==========================================

export interface IntentMandateTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    IntentMandate: Array<{ name: string; type: string }>;
  };
  primaryType: 'IntentMandate';
  message: {
    description: string;
    maxAmount: bigint;
    currency: string;
    merchants: Address[];
    expiry: number;
    nonce: `0x${string}`;
  };
}

export interface CartMandateTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    CartMandate: Array<{ name: string; type: string }>;
    CartItem: Array<{ name: string; type: string }>;
  };
  primaryType: 'CartMandate';
  message: {
    cartId: string;
    totalAmount: bigint;
    currency: string;
    merchant: Address;
    itemsHash: `0x${string}`;
    expiry: number;
    nonce: `0x${string}`;
  };
}

// ==========================================
// Database Records
// ==========================================

export interface MandateDBRecord {
  id: string;
  type: MandateType;
  mandate_data: Record<string, unknown>;
  signatures: Record<string, string>;
  status: MandateStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}
