/**
 * A2A x402 Extension - Types
 * Agent-to-Agent payment types following Google A2A spec
 */

import { Address } from 'viem';

// ==========================================
// Payment Requirements (payment-required)
// ==========================================

export interface PaymentRequirements {
  x402Version: number;
  scheme: 'exact';
  network: 'base';
  asset: Address;
  payTo: Address;
  maxAmountRequired: string; // Atomic units as string
  description?: string;
  resource?: string; // URI of the resource being paid for
  expiresAt?: number; // Unix timestamp
  metadata?: Record<string, unknown>;
}

export interface PaymentAccepts {
  scheme: 'exact';
  network: string;
  asset: Address;
  payTo: Address;
  maxAmountRequired: string;
}

// ==========================================
// Payment Payload (payment-submitted)
// ==========================================

export interface EIP3009Authorization {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
}

export interface PaymentPayload {
  x402Version: number;
  scheme: 'exact';
  network: string;
  payload: {
    signature: string;
    authorization: EIP3009Authorization;
  };
}

// ==========================================
// Payment Receipt (payment-completed)
// ==========================================

export interface PaymentReceipt {
  txHash: string;
  success: boolean;
  blockNumber?: number;
  timestamp?: number;
  gasUsed?: number;
  error?: string;
}

// ==========================================
// x402 Message Types
// ==========================================

export type X402MessageType =
  | 'payment-required'
  | 'payment-submitted'
  | 'payment-completed'
  | 'payment-failed';

export interface X402PaymentRequired {
  type: 'payment-required';
  'x402.payment.required': {
    accepts: PaymentAccepts[];
  };
}

export interface X402PaymentSubmitted {
  type: 'payment-submitted';
  'x402.payment.payload': PaymentPayload;
}

export interface X402PaymentCompleted {
  type: 'payment-completed';
  'x402.payment.receipts': PaymentReceipt[];
}

export interface X402PaymentFailed {
  type: 'payment-failed';
  error: string;
  details?: string;
}

export type X402Message =
  | X402PaymentRequired
  | X402PaymentSubmitted
  | X402PaymentCompleted
  | X402PaymentFailed;

// ==========================================
// Payment Flow Types
// ==========================================

export interface CreatePaymentRequirementsRequest {
  payTo: Address;
  amount: string; // Atomic units
  description?: string;
  resource?: string;
  expiresInSeconds?: number;
  asset?: Address; // Default: USDC
  network?: 'base';
}

export interface SignPaymentRequest {
  agentKey: string; // Server Wallet agent key
  requirements: PaymentRequirements;
}

export interface SignPaymentResponse {
  success: boolean;
  payload?: PaymentPayload;
  error?: string;
}

export interface VerifyPaymentRequest {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
}

export interface VerifyPaymentResponse {
  valid: boolean;
  signerAddress?: Address;
  errors: string[];
}

export interface SettlePaymentRequest {
  payload: PaymentPayload;
  requirements: PaymentRequirements;
}

export interface SettlePaymentResponse {
  success: boolean;
  receipt?: PaymentReceipt;
  error?: string;
}

// ==========================================
// Payment Session
// ==========================================

export interface PaymentSession {
  id: string;
  clientAgentId: string;
  merchantAgentId: string;
  requirements: PaymentRequirements;
  payload?: PaymentPayload;
  receipt?: PaymentReceipt;
  status: 'pending' | 'submitted' | 'completed' | 'failed' | 'expired';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// ==========================================
// Database Record Types
// ==========================================

export interface X402PaymentDBRecord {
  id: string;
  payment_hash: string;
  from_agent_id: string | null;
  to_address: string;
  amount: string;
  token: string;
  tx_hash: string | null;
  status: 'pending' | 'submitted' | 'completed' | 'failed';
  requirements: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
