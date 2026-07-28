/**
 * SUPERMISSION Agent SDK - X402 Middleware
 * Easy-to-use middleware for adding X402 payment handling to any agent
 */

import { verifyPaymentProof } from './verify';
import type {
  AgentConfig,
  X402PaymentRequest,
  X402PaymentProof,
  X402Handler,
} from './types';
import { SUPPORTED_CHAINS, USDC_ADDRESSES } from './types';

const DEFAULT_USDC_ADDRESS = USDC_ADDRESSES[SUPPORTED_CHAINS.BASE];
const DEFAULT_CHAIN_ID = SUPPORTED_CHAINS.BASE;

/**
 * Create X402 middleware for your agent
 *
 * Usage:
 * ```typescript
 * import { createX402Middleware } from '@supermission/agent-sdk';
 *
 * const x402 = createX402Middleware({
 *   name: 'My Agent',
 *   walletAddress: '0x...',
 *   pricingModel: 'per_task',
 *   pricingRate: 0.05, // 5 cents per task
 * });
 *
 * // In your request handler:
 * const result = await x402(request);
 * if (result) {
 *   // Payment required - return 402 response
 *   return result;
 * }
 * // Payment verified - continue with task
 * ```
 */
export function createX402Middleware(config: AgentConfig): X402Handler {
  // Validate configuration
  validateConfig(config);

  // Set defaults
  const chainId = config.chainId || DEFAULT_CHAIN_ID;
  const usdcAddress = config.usdcAddress || USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES] || DEFAULT_USDC_ADDRESS;
 
  // Return middleware handler
  return async (req) => {
    // Get payment proof header
    const paymentProofHeader = getHeader(req.headers, 'x-payment-proof');

    // If no payment proof, return 402 Payment Required
    if (!paymentProofHeader) {
      console.log(`[X402 SDK] No payment proof - returning 402 Payment Required`);

      const paymentAmount = calculatePaymentAmount(config);

      const paymentRequest: X402PaymentRequest = {
        amount: paymentAmount.toString(),
        token: usdcAddress,
        recipient: config.walletAddress,
        chainId,
        description: `Payment for ${config.name} - ${config.pricingModel} (${config.pricingRate} USDC)`,
      };

      return {
        status: 402,
        headers: {
          'X-Payment-Required': JSON.stringify(paymentRequest),
          'Content-Type': 'application/json',
        } as Record<string, string>,
        body: {
          error: 'Payment required',
          message: `Please provide payment to use ${config.name}`,
          agentName: config.name,
          pricingModel: config.pricingModel,
          pricingRate: config.pricingRate,
        },
      };
    }

    // Parse payment proof
    let paymentProof: X402PaymentProof;
    try {
      paymentProof = JSON.parse(paymentProofHeader);

      // Validate payment proof structure
      if (!paymentProof.txHash || !paymentProof.amount || !paymentProof.from || !paymentProof.to) {
        throw new Error('Invalid payment proof format: missing required fields');
      }

      // Verify recipient matches agent wallet
      if (paymentProof.to.toLowerCase() !== config.walletAddress.toLowerCase()) {
        throw new Error(
          `Payment recipient mismatch: expected ${config.walletAddress}, got ${paymentProof.to}`
        );
      }

      // Verify payment amount is sufficient
      const expectedAmount = calculatePaymentAmount(config);
      if (BigInt(paymentProof.amount) < BigInt(expectedAmount)) {
        throw new Error(
          `Insufficient payment: expected ${expectedAmount}, got ${paymentProof.amount}`
        );
      }

      // Verify payment on-chain (unless skipped for testing)
      if (!config.skipVerification) {
        const isValid = await verifyPaymentProof(paymentProof, config.rpcUrl);
        if (!isValid) {
          throw new Error('Payment proof verification failed: on-chain verification failed');
        }
      } else {
        console.warn('[X402 SDK] WARNING: Payment verification skipped (skipVerification=true)');
      }

      console.log(`[X402 SDK] Payment verified successfully:`, {
        from: paymentProof.from,
        to: paymentProof.to,
        amount: paymentProof.amount,
        txHash: paymentProof.txHash,
      });

      // Payment verified - return null to indicate request should proceed
      return null;
    } catch (error) {
      console.error(`[X402 SDK] Payment verification failed:`, error);
      return {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        } as Record<string, string>,
        body: {
          error: 'Invalid payment proof',
          message: error instanceof Error ? error.message : 'Payment verification failed',
          hint: 'Ensure the payment transaction is confirmed on-chain and the proof is correctly formatted',
        },
      };
    }
  };
}

/**
 * Validate agent configuration
 */
function validateConfig(config: AgentConfig): void {
  if (!config.name) {
    throw new Error('Agent name is required');
  }

  if (!config.walletAddress) {
    throw new Error('Agent wallet address is required');
  }

  if (!config.walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error('Invalid wallet address format');
  }

  if (!config.pricingModel) {
    throw new Error('Pricing model is required (per_task or per_message)');
  }

  if (config.pricingModel !== 'per_task' && config.pricingModel !== 'per_message') {
    throw new Error('Pricing model must be either per_task or per_message');
  }

  if (typeof config.pricingRate !== 'number' || config.pricingRate <= 0) {
    throw new Error('Pricing rate must be a positive number');
  }

  if (config.pricingRate > 1000) {
    throw new Error('Pricing rate must be less than 1000 USDC');
  }
}

/**
 * Calculate payment amount in token base units (USDC with 6 decimals)
 */
function calculatePaymentAmount(config: AgentConfig): string {
  // Convert pricing rate (in USDC) to smallest unit (6 decimals)
  // e.g., 0.05 USDC -> 50000
  const amount = Math.floor(config.pricingRate * 1_000_000);
  return amount.toString();
}

/**
 * Get header value (case-insensitive)
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const lowerName = name.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === lowerName);
  if (!key) return null;

  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

/**
 * Express-compatible middleware wrapper
 *
 * Usage with Express:
 * ```typescript
 * import express from 'express';
 * import { createX402Middleware, expressMiddleware } from '@supermission/agent-sdk';
 *
 * const app = express();
 * const x402 = createX402Middleware({ ... });
 *
 * app.post('/execute', expressMiddleware(x402), (req, res) => {
 *   // Payment verified - handle request
 *   res.json({ success: true });
 * });
 * ```
 */
export function expressMiddleware(x402Handler: X402Handler) {
  return async (req: any, res: any, next: any) => {
    const result = await x402Handler({
      headers: req.headers,
      body: req.body,
    });

    if (result) {
      // Payment required or failed
      res.status(result.status);
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }
      return res.json(result.body);
    }

    // Payment verified - continue
    next();
  };
}

/**
 * Next.js API route wrapper
 *
 * Usage with Next.js:
 * ```typescript
 * import { createX402Middleware, nextJsMiddleware } from '@supermission/agent-sdk';
 * import { NextRequest, NextResponse } from 'next/server';
 *
 * const x402 = createX402Middleware({ ... });
 *
 * export async function POST(request: NextRequest) {
 *   const result = await nextJsMiddleware(x402, request);
 *   if (result) return result; // Payment required or failed
 *
 *   // Payment verified - handle request
 *   return NextResponse.json({ success: true });
 * }
 * ```
 */
export async function nextJsMiddleware(
  x402Handler: X402Handler,
  request: any // NextRequest
): Promise<any | null> {
  // Convert NextRequest headers to plain object
  const headers: Record<string, string> = {};
  request.headers.forEach((value: string, key: string) => {
    headers[key] = value;
  });

  const result = await x402Handler({
    headers,
    body: await request.json().catch(() => ({})),
  });

  if (result) {
    // Import NextResponse dynamically to avoid server-side issues
    const { NextResponse } = await import('next/server');

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  return null;
}
