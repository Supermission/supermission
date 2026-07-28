'use client';

/**
 * Unified payment hook — routes to either:
 * 1. Circle Nanopayments (gasless, batched) when enabled
 * 2. Privy on-chain transfer (existing) as fallback
 *
 * DOES NOT modify usePaymentTransaction — wraps it.
 *
 * When Circle Nanopayments is enabled, payments go through the x402 batching
 * protocol: EIP-3009 TransferWithAuthorization signed by user, then submitted
 * to Circle Gateway for batched settlement. When disabled (default), the
 * existing Privy gas-sponsored on-chain transfer is used.
 */

import { useState, useCallback } from 'react';
import { usePaymentTransaction } from './use-payment-transaction';
import { shouldUseNanopayments } from '@/lib/circle/nanopayments';
import { useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { parseUnits, encodePacked, keccak256 } from 'viem';
import type { Address } from 'viem';

interface UnifiedPaymentParams {
  recipient: Address;
  amount: string;
  tokenAddress?: Address;
  onSuccess?: (txHashOrPaymentId: string) => void | Promise<void>;
  onError?: (error: Error) => void;
}

export type PaymentMethod = 'nanopayments' | 'privy_onchain';

export function useCirclePayment() {
  const privyPayment = usePaymentTransaction();
  const { address } = useAccount();
  const { wallets } = useWallets();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    shouldUseNanopayments() ? 'nanopayments' : 'privy_onchain'
  );

  const executePayment = useCallback(async (params: UnifiedPaymentParams) => {
    if (shouldUseNanopayments() && address) {
      try {
        const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
        if (!embeddedWallet) {
          console.log('[CirclePayment] No embedded wallet, falling back to Privy on-chain');
          setPaymentMethod('privy_onchain');
          return privyPayment.executePayment(params);
        }

        const amountWei = parseUnits(params.amount, 6);
        const now = Math.floor(Date.now() / 1000);
        const validAfter = (now - 60).toString();
        const validBefore = (now + 3600).toString();
        const nonce = keccak256(
          encodePacked(
            ['address', 'uint256', 'uint256'],
            [address, amountWei, BigInt(now)]
          )
        );

        const provider = await embeddedWallet.getEthereumProvider();
        const tokenAddress = params.tokenAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

        const signature = await provider.request({
          method: 'eth_signTypedData_v4',
          params: [
            address,
            JSON.stringify({
              types: {
                EIP712Domain: [
                  { name: 'name', type: 'string' },
                  { name: 'version', type: 'string' },
                  { name: 'chainId', type: 'uint256' },
                  { name: 'verifyingContract', type: 'address' },
                ],
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
              domain: {
                name: 'USD Coin',
                version: '2',
                chainId: 8453,
                verifyingContract: tokenAddress,
              },
              message: {
                from: address,
                to: params.recipient,
                value: amountWei.toString(),
                validAfter,
                validBefore,
                nonce,
              },
            }),
          ],
        });

        // Submit signed authorization to server for batched settlement
        const res = await fetch('/api/circle/nanopayments/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: address,
            to: params.recipient,
            value: amountWei.toString(),
            validAfter,
            validBefore,
            nonce,
            signature,
          }),
        });

        const result = await res.json();

        if (result.success && result.paymentId) {
          setPaymentMethod('nanopayments');
          await params.onSuccess?.(result.paymentId);
        } else {
          throw new Error(result.error || 'Nanopayment failed');
        }
      } catch (error) {
        console.warn('[CirclePayment] Nanopayment failed, falling back to Privy:', error);
        setPaymentMethod('privy_onchain');
        return privyPayment.executePayment(params);
      }
    } else {
      setPaymentMethod('privy_onchain');
      return privyPayment.executePayment(params);
    }
  }, [address, wallets, privyPayment]);

  return {
    ...privyPayment,
    executePayment,
    paymentMethod,
  };
}
