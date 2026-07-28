/**
 * A2A Payment Client Library
 * Enables agents to pay other agents for sub-tasks.
 *
 * All on-chain operations use Privy server wallets via the relayer.
 * No private keys are stored or used directly.
 */

import { type Address } from 'viem';
import { baseClient as defaultBaseClient } from '@/lib/viem/clients';
import { relayTransaction } from '@/lib/server-wallets/relayer';
import { isX402Response, extractPaymentRequest, verifyPaymentProof } from './middleware';
import type { X402PaymentRequest, X402PaymentProof } from './types';
import {
  createEIP3009Authorization,
  TRANSFER_WITH_AUTHORIZATION_ABI,
  splitSignature,
} from './eip3009';
import { encodeFunctionData } from 'viem';

export interface AgentCredentials {
  address: Address;
  agentId: string;
  /** Privy wallet ID for signing operations */
  privyWalletId: string;
}

export interface SubTaskRequest {
  targetAgentId: string;
  targetEndpoint: string;
  task: string;
  maxPayment: bigint; // Maximum willing to pay
}

export interface SubTaskResult {
  result: string;
  paid: bigint;
  txHash?: string;
}

/**
 * Retry fetch with payment proof
 */
function retryWithPayment(
  url: string,
  options: RequestInit,
  proof: X402PaymentProof
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Payment-Proof', JSON.stringify(proof));

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * X402-enabled fetch wrapper
 */
export async function x402Fetch(
  url: string,
  options: RequestInit = {},
  onPaymentRequired?: (request: X402PaymentRequest) => Promise<X402PaymentProof>
): Promise<Response> {
  // Initial request
  const response = await fetch(url, options);

  // Check if payment required
  if (isX402Response(response)) {
    if (!onPaymentRequired) {
      throw new Error('Payment required but no payment handler provided');
    }

    // Extract payment request
    const paymentRequest = await extractPaymentRequest(response);

    // Get payment proof from handler (this will trigger payment)
    const proof = await onPaymentRequired(paymentRequest);

    // Verify payment proof
    const isValid = await verifyPaymentProof(proof);
    if (!isValid) {
      throw new Error('Payment proof verification failed');
    }

    // Retry request with payment proof
    return retryWithPayment(url, options, proof);
  }

  return response;
}

/**
 * Agent-to-Agent Payment Client
 * Allows autonomous agents to pay other agents for sub-tasks.
 * Uses Privy server wallets — no private keys required.
 */
export class A2APaymentClient {
  private credentials: AgentCredentials;
  private publicClient;
  private usdcAddress: Address;

  constructor(
    credentials: AgentCredentials,
    usdcAddress: Address,
  ) {
    this.credentials = credentials;
    this.usdcAddress = usdcAddress;
    this.publicClient = defaultBaseClient;
  }

  /**
   * Execute sub-task with automatic payment handling
   */
  async executeSubTask(request: SubTaskRequest): Promise<SubTaskResult> {
    console.log(`[A2A] ${this.credentials.agentId} requesting task from ${request.targetAgentId}`);

    try {
      // Track payment amount if payment is made
      let paidAmount = 0n;

      // Make initial request with X402 handler
      const response = await x402Fetch(
        request.targetEndpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: request.task,
            requestingAgent: this.credentials.agentId,
          }),
        },
        async (paymentRequest) => {
          paidAmount = BigInt(paymentRequest.amount);
          return this.handlePaymentRequest(paymentRequest, request.maxPayment);
        }
      );

      if (!response.ok) {
        throw new Error(`Sub-task request failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        result: data.result || data.message,
        paid: data.paid ? paidAmount : 0n,
        txHash: data.txHash,
      };
    } catch (error) {
      console.error(`[A2A] Sub-task failed:`, error);
      throw error;
    }
  }

  /**
   * Handle payment request from target agent using EIP-3009 transferWithAuthorization.
   * Submits the on-chain transaction via Privy server wallet relayer.
   */
  private async handlePaymentRequest(
    paymentRequest: X402PaymentRequest,
    maxPayment: bigint
  ): Promise<X402PaymentProof> {
    const requestedAmount = BigInt(paymentRequest.amount);

    // Check if payment is within budget
    if (requestedAmount > maxPayment) {
      throw new Error(
        `Payment requested (${requestedAmount}) exceeds maximum (${maxPayment})`
      );
    }

    console.log(
      `[A2A] Paying ${requestedAmount} USDC to ${paymentRequest.recipient} via EIP-3009`
    );

    // Create EIP-3009 authorization parameters
    const authParams = createEIP3009Authorization(
      this.credentials.address,
      paymentRequest.recipient,
      requestedAmount,
      this.usdcAddress,
      8453, // Base mainnet
      3600  // 1 hour validity
    );

    // Sign via Privy server wallet
    const { PrivyClient } = await import('@privy-io/node');
    const privyClient = new PrivyClient({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
      appSecret: process.env.PRIVY_APP_SECRET!,
    });

    const signature = await (privyClient.wallets() as any).ethereum.signTypedData({
      walletId: this.credentials.privyWalletId,
      typedData: {
        domain: authParams.domain,
        types: authParams.types,
        primaryType: authParams.primaryType,
        message: authParams.message,
      },
    });

    // Split signature into v, r, s components
    const { v, r, s } = splitSignature(signature);

    console.log(`[A2A] EIP-3009 authorization signed, executing transferWithAuthorization`);

    // Execute transferWithAuthorization via relayer
    const callData = encodeFunctionData({
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        authParams.message.from,
        authParams.message.to,
        authParams.message.value,
        BigInt(authParams.message.validAfter),
        BigInt(authParams.message.validBefore),
        authParams.message.nonce,
        v,
        r,
        s,
      ],
    });

    const txHash = await relayTransaction({
      to: this.usdcAddress,
      data: callData as `0x${string}`,
    });

    console.log(`[A2A] Transfer tx: ${txHash}`);

    // Wait for confirmation
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Create payment proof
    const proof: X402PaymentProof = {
      txHash,
      from: authParams.message.from,
      to: authParams.message.to,
      amount: paymentRequest.amount,
      token: authParams.domain.verifyingContract,
      timestamp: Date.now(),
    };

    console.log(`[A2A] Payment complete via EIP-3009: ${txHash}`);

    return proof;
  }

  /**
   * Get agent USDC balance
   */
  async getBalance(): Promise<bigint> {
    const ERC20_ABI = [
      {
        constant: true,
        inputs: [{ name: '_owner', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: 'balance', type: 'uint256' }],
        type: 'function',
      },
    ] as const;

    const balance = await this.publicClient.readContract({
      address: this.usdcAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.credentials.address],
    });

    return balance as bigint;
  }
}
