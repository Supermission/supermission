/**
 * X402 Protocol Types
 * Based on @coinbase/x402 standard
 */

import { Address } from 'viem';

export interface X402PaymentRequest {
  amount: string; // Amount in token base units (e.g., USDC wei)
  token: Address; // ERC20 token address
  recipient: Address; // Agent wallet receiving payment
  chainId: number; // Network chain ID
  description?: string; // Optional description of what payment is for
}

export interface X402PaymentProof {
  txHash: string; // Transaction hash of payment
  from: Address; // Payer address
  to: Address; // Recipient address
  amount: string; // Amount paid
  token: Address; // Token used
  timestamp: number; // When payment was made
  signature?: string; // Optional signature for verification
  chainId?: number;
}

export interface X402Response {
  status: 402;
  paymentRequired: X402PaymentRequest;
  message: string;
}

export interface X402Session {
  sessionId: string;
  agentId: string;
  payer: Address;
  totalPaid: bigint;
  messagesRemaining: number;
  expiresAt: number;
}

export interface AgentPricing {
  perMessage: bigint; // Cost per message in USDC wei
  perSession: bigint; // Cost for session (30 messages)
  perMinute?: bigint; // Optional time-based pricing
}

