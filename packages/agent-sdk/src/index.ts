/**
 * SUPERMISSION Agent SDK
 * Easy X402 micropayment integration for autonomous agents
 *
 * @packageDocumentation
 */

export { createX402Middleware, expressMiddleware, nextJsMiddleware } from './middleware';
export { verifyPaymentProof } from './verify';
export type {
  AgentConfig,
  X402PaymentRequest,
  X402PaymentProof,
  X402Handler,
  X402MiddlewareRequest,
  X402MiddlewareResponse,
} from './types';

// Re-export viem chains for convenience
export { base } from 'viem/chains';
