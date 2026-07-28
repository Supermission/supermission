'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { base, polygon, mainnet, arbitrum, optimism, avalanche, bsc } from 'wagmi/chains';
import type { Chain } from 'viem';
import type { NormalizedQuoteResponse, SupportedChainId } from '@/lib/uniswap/types';
import { translateWalletError } from '@/lib/error-translators/wallet-errors';

export type SwapStep =
  | 'idle'
  | 'fetching_quote'
  | 'checking_balance'
  | 'approving'
  | 'swapping'
  | 'completed'
  | 'failed';

export interface SwapProgress {
  step: SwapStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // human-readable
  decimalsIn: number;
  decimalsOut: number;
  chainId: SupportedChainId;
  toChainId?: number; // optional, defaults to same as chainId
  slippageBps?: number;
}

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  43114: avalanche,
  56: bsc,
};

const ERC20_APPROVE_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ERC20_ALLOWANCE_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function useLifiSwap() {
  const { address: wagmiAddress } = useAccount();
  const { wallets } = useWallets();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();
  const { refetch: refetchWalletClient } = useWalletClient();

  // Use Privy embedded wallet address if available, fall back to wagmi address.
  // This fixes the balance mismatch where wagmi reports a different address than Privy.
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const address = (embeddedWallet?.address as `0x${string}` | undefined) || wagmiAddress;

  const basePublicClient = usePublicClient({ chainId: base.id });
  const polygonPublicClient = usePublicClient({ chainId: polygon.id });
  const mainnetPublicClient = usePublicClient({ chainId: mainnet.id });
  const arbitrumPublicClient = usePublicClient({ chainId: arbitrum.id });
  const optimismPublicClient = usePublicClient({ chainId: optimism.id });
  const avalanchePublicClient = usePublicClient({ chainId: avalanche.id });
  const bscPublicClient = usePublicClient({ chainId: bsc.id });

  const [progress, setProgress] = useState<SwapProgress>({ step: 'idle', message: '' });
  const [isSwapping, setIsSwapping] = useState(false);
  const [lastQuote, setLastQuote] = useState<NormalizedQuoteResponse | null>(null);

  const getPublicClient = useCallback((chainId: number) => {
    if (chainId === 8453) return basePublicClient;
    if (chainId === 137) return polygonPublicClient;
    if (chainId === 1) return mainnetPublicClient;
    if (chainId === 42161) return arbitrumPublicClient;
    if (chainId === 10) return optimismPublicClient;
    if (chainId === 43114) return avalanchePublicClient;
    if (chainId === 56) return bscPublicClient;
    return basePublicClient;
  }, [basePublicClient, polygonPublicClient, mainnetPublicClient, arbitrumPublicClient, optimismPublicClient, avalanchePublicClient, bscPublicClient]);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find(w => w.walletClientType === 'privy');
  }, [wallets]);

  /** Fetch a quote without executing */
  const fetchQuote = useCallback(async (params: SwapParams): Promise<NormalizedQuoteResponse | null> => {
    if (!address) return null;

    setProgress({ step: 'fetching_quote', message: 'Getting swap quote...' });

    try {
      const rawAmount = parseUnits(params.amountIn, params.decimalsIn).toString();
      const toChainId = params.toChainId || params.chainId;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18_000);

      let res: Response;
      try {
        res = await fetch('/api/defi/swap/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId: params.chainId,
            ...(toChainId !== params.chainId ? { toChainId } : {}),
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            amount: rawAmount,
            type: 'EXACT_INPUT',
            taker: address,
            slippageBps: params.slippageBps ?? 50,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const data = await res.json();
      if (!data.ok) {
        const msg = data.error || 'Failed to get quote';
        setProgress({ step: 'idle', message: '' });
        return null;
      }

      setLastQuote(data);
      setProgress({ step: 'idle', message: '' });
      return data;
    } catch (e: unknown) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      setProgress({ step: 'idle', message: '' });
      return null;
    }
  }, [address]);

  /** Execute a swap using a previously fetched quote */
  const executeSwap = useCallback(async (
    params: SwapParams,
    quote: NormalizedQuoteResponse
  ): Promise<string | undefined> => {
    if (!address || !quote.methodParameters) return;

    const publicClient = getPublicClient(params.chainId);
    if (!publicClient) throw new Error('Public client not available');

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;
    const chain = CHAIN_MAP[params.chainId];

    setIsSwapping(true);

    try {
      // Switch chain if needed (always switch to source chain for tx signing)
      if (!isSilent) {
        await switchChainAsync({ chainId: params.chainId });
      } else if (embedded) {
        await embedded.switchChain(params.chainId);
      }

      // Step 1: Check balance
      setProgress({ step: 'checking_balance', message: 'Checking token balance...' });
      const amountRaw = parseUnits(params.amountIn, params.decimalsIn);
      const isNative = params.tokenIn.toLowerCase() === '0x0000000000000000000000000000000000000000';

      if (isNative) {
        const balance = await publicClient.getBalance({ address });
        if (balance < amountRaw) {
          const balFmt = formatUnits(balance, params.decimalsIn);
          throw new Error(`Insufficient balance. Have ${parseFloat(balFmt).toFixed(4)}, need ${params.amountIn}`);
        }
      } else {
        const balance = await publicClient.readContract({
          address: params.tokenIn as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address],
        });

        if (balance < amountRaw) {
          const balFmt = formatUnits(balance, params.decimalsIn);
          throw new Error(`Insufficient balance. Have ${parseFloat(balFmt).toFixed(4)}, need ${params.amountIn}`);
        }
      }

      // Step 2: Approve if needed — use quote.spender (LI.FI approval address)
      if (!isNative) {
        const approvalTarget = (quote.spender || quote.methodParameters.to) as `0x${string}`;

        const currentAllowance = await publicClient.readContract({
          address: params.tokenIn as `0x${string}`,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [address, approvalTarget],
        });

        if (currentAllowance < amountRaw) {
          setProgress({ step: 'approving', message: 'Waiting for wallet to approve token spend…' });

          const approveData = encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [approvalTarget, amountRaw * 2n], // 2x for safety margin
          });

          if (isSilent) {
            await privySendTransaction(
              { to: params.tokenIn as `0x${string}`, data: approveData, chainId: params.chainId },
              { sponsor: true, address },
            );
          } else {
            const { data: walletClient } = await refetchWalletClient();
            if (!walletClient) throw new Error('Wallet not available');
            const approveTxHash = await walletClient.sendTransaction({
              account: address,
              chain,
              to: params.tokenIn as `0x${string}`,
              data: approveData,
              value: 0n,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
          }

          console.log('[LifiSwap] Token approved');
        }
      }

      // Step 3: Execute swap
      const toChainId = params.toChainId || params.chainId;
      const isCrossChain = toChainId !== params.chainId;
      setProgress({
        step: 'swapping',
        message: isSilent ? 'Submitting swap…' : 'Waiting for wallet to sign swap…',
      });

      let txHash: string;

      const swapTx = {
        to: quote.methodParameters.to as `0x${string}`,
        data: quote.methodParameters.calldata as `0x${string}`,
        value: BigInt(quote.methodParameters.value || '0'),
        chainId: params.chainId,
      };

      if (isSilent) {
        const receipt = await privySendTransaction(
          swapTx,
          { sponsor: true, address },
        );
        txHash = receipt.hash;
      } else {
        const { data: walletClient } = await refetchWalletClient();
        if (!walletClient) throw new Error('Wallet not available');
        txHash = await walletClient.sendTransaction({
          account: address,
          chain,
          ...swapTx,
        });
        setProgress({
          step: 'swapping',
          message: isCrossChain ? 'Bridging in progress (this can take a few minutes)…' : 'Confirming on-chain (~15s)…',
        });
      }

      // Record activity
      recordSwapActivity(address, params, quote, txHash).catch(() => {});

      setProgress({ step: 'completed', message: isCrossChain ? 'Cross-chain swap initiated!' : 'Swap complete!', txHash });
      setIsSwapping(false);
      return txHash;

    } catch (error: unknown) {
      const translated = translateWalletError(error);
      const friendly = translated.hint ? `${translated.title} ${translated.hint}` : translated.title;
      console.error('[LifiSwap] Failed:', error);
      setProgress({ step: 'failed', message: friendly, error: friendly });
      setIsSwapping(false);
      throw error;
    }
  }, [address, getPublicClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsSwapping(false);
    setLastQuote(null);
  }, []);

  return { fetchQuote, executeSwap, progress, isSwapping, lastQuote, reset };
}

/** @deprecated Use useLifiSwap instead */
export const useUniswapSwap = useLifiSwap;

async function recordSwapActivity(
  wallet: string,
  params: SwapParams,
  quote: NormalizedQuoteResponse,
  txHash: string
) {
  try {
    const toChainId = params.toChainId || params.chainId;
    await fetch('/api/defi/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: wallet,
        activity_type: toChainId !== params.chainId ? 'cross_chain_swap' : 'swap',
        chain_id: params.chainId,
        to_chain_id: toChainId !== params.chainId ? toChainId : undefined,
        tx_hash: txHash,
        status: 'confirmed',
        token_in: params.tokenIn,
        token_out: params.tokenOut,
        amount_in: params.amountIn,
        amount_out: quote.amountOutFormatted || quote.amountOut,
        amount_usd: quote.fromAmountUSD ? parseFloat(quote.fromAmountUSD) : null,
        price_impact: quote.priceImpact,
        slippage_bps: params.slippageBps,
        source: `lifi:${quote.source}`,
        route: quote.route,
      }),
    });
  } catch (e) {
    console.warn('[LifiSwap] Failed to record activity:', e);
  }
}
