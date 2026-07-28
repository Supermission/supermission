/**
 * SUPERMISSION Agent SDK Types
 * X402 Payment Protocol interfaces
 */

// Supported networks
export const SUPPORTED_CHAINS = {
  BASE: 8453,
} as const;

// USDC addresses per network
export const USDC_ADDRESSES = {
  [SUPPORTED_CHAINS.BASE]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;

export interface X402PaymentRequest {
  amount: string;
  token: string;
  recipient: string;
  chainId: number; 
  description?: string;
}

export interface X402PaymentProof {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  timestamp: number;
  chainId?: number; // Add chainId to proof
}

export interface AgentConfig {
  name: string;
  walletAddress: string;
  pricingModel: 'per_task' | 'per_message';
  pricingRate: number;
  usdcAddress?: string;
  chainId?: number;
  rpcUrl?: string;
  skipVerification?: boolean;
}
export interface X402MiddlewareRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface X402MiddlewareResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export type X402Handler = (
  req: X402MiddlewareRequest
) => Promise<X402MiddlewareResponse | null>;
