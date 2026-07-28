'use client';

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, encodeFunctionData, formatUnits } from 'viem';
import { base } from 'wagmi/chains';
import {
  NONFUNGIBLE_POSITION_MANAGER,
  NonfungiblePositionManagerABI,
  ERC20_ABI,
} from '@/lib/uniswap/abis';

const BASE_CHAIN_ID = 8453;
const MAX_UINT128 = (2n ** 128n) - 1n;

export type LPStep =
  | 'idle'
  | 'checking_balance'
  | 'approving_token0'
  | 'approving_token1'
  | 'adding_liquidity'
  | 'removing_liquidity'
  | 'collecting'
  | 'completed'
  | 'failed';

export interface LPProgress {
  step: LPStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface AddLiquidityParams {
  token0Address: `0x${string}`;
  token1Address: `0x${string}`;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0: string;
  amount1: string;
}

export interface RemoveLiquidityParams {
  tokenId: string;
  liquidity: string;
  percentage: number; // 1-100
  token0Decimals: number;
  token1Decimals: number;
}

export interface CollectFeesParams {
  tokenId: string;
}

export function useUniswapLP() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { refetch: refetchWalletClient } = useWalletClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const baseClient = usePublicClient({ chainId: base.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<LPProgress>({ step: 'idle', message: '' });
  const [isExecuting, setIsExecuting] = useState(false);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  const sendTx = useCallback(async (
    to: `0x${string}`,
    data: `0x${string}`,
    isSilent: boolean,
    value?: bigint,
  ): Promise<string> => {
    if (isSilent) {
      const receipt = await privySendTransaction(
        { to, data, chainId: BASE_CHAIN_ID, ...(value ? { value: `0x${value.toString(16)}` } : {}) },
        { sponsor: true, address: address! },
      );
      return receipt.hash;
    } else {
      const { data: walletClient } = await refetchWalletClient();
      if (!walletClient) throw new Error('Wallet not available');
      const txHash = await walletClient.sendTransaction({
        account: address!,
        chain: base,
        to,
        data,
        value: value || 0n,
      });
      return txHash;
    }
  }, [address, privySendTransaction, refetchWalletClient]);

  const approveToken = useCallback(async (
    tokenAddress: `0x${string}`,
    tokenSymbol: string,
    amountRaw: bigint,
    isSilent: boolean,
    stepName: LPStep,
  ) => {
    if (!baseClient || !address) return;

    // Check current allowance
    const allowance = await baseClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, NONFUNGIBLE_POSITION_MANAGER],
    });

    if (allowance >= amountRaw) return; // Already approved

    setProgress({ step: stepName, message: `Approving ${tokenSymbol}...` });
    const approveAmount = amountRaw * 10n;
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [NONFUNGIBLE_POSITION_MANAGER, approveAmount],
    });

    const txHash = await sendTx(tokenAddress, approveData, isSilent);
    await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

    // Re-verify allowance after receipt confirmation (bundler state issues)
    const newAllowance = await baseClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, NONFUNGIBLE_POSITION_MANAGER],
    });

    if (newAllowance < amountRaw) {
      throw new Error(`${tokenSymbol} approval not confirmed yet. Please try again in a few seconds.`);
    }
  }, [address, baseClient, sendTx]);

  const addLiquidity = useCallback(async (params: AddLiquidityParams): Promise<string | undefined> => {
    if (!address || !baseClient) {
      setProgress({ step: 'failed', message: 'Wallet not connected', error: 'Wallet not connected' });
      setIsExecuting(false);
      return;
    }

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;
    setIsExecuting(true);

    try {
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      const amount0Raw = parseUnits(params.amount0, params.token0Decimals);
      const amount1Raw = parseUnits(params.amount1, params.token1Decimals);

      // Step 1: Check balances
      setProgress({ step: 'checking_balance', message: 'Checking balances...' });

      const [balance0, balance1] = await Promise.all([
        baseClient.readContract({
          address: params.token0Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        baseClient.readContract({
          address: params.token1Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
      ]);

      if (balance0 < amount0Raw) {
        const bal = formatUnits(balance0, params.token0Decimals);
        throw new Error(`Insufficient ${params.token0Symbol}. You have ${parseFloat(bal).toFixed(4)} but need ${params.amount0}`);
      }
      if (balance1 < amount1Raw) {
        const bal = formatUnits(balance1, params.token1Decimals);
        throw new Error(`Insufficient ${params.token1Symbol}. You have ${parseFloat(bal).toFixed(4)} but need ${params.amount1}`);
      }

      // Step 2: Approve token0
      await approveToken(params.token0Address, params.token0Symbol, amount0Raw, isSilent, 'approving_token0');

      // Step 3: Approve token1
      await approveToken(params.token1Address, params.token1Symbol, amount1Raw, isSilent, 'approving_token1');

      // Step 4: Mint LP position
      setProgress({ step: 'adding_liquidity', message: 'Adding liquidity...' });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      // 1% slippage on amounts
      const amount0Min = (amount0Raw * 99n) / 100n;
      const amount1Min = (amount1Raw * 99n) / 100n;

      const mintData = encodeFunctionData({
        abi: NonfungiblePositionManagerABI,
        functionName: 'mint',
        args: [{
          token0: params.token0Address,
          token1: params.token1Address,
          fee: params.fee,
          tickLower: params.tickLower,
          tickUpper: params.tickUpper,
          amount0Desired: amount0Raw,
          amount1Desired: amount1Raw,
          amount0Min,
          amount1Min,
          recipient: address,
          deadline,
        }],
      });

      const txHash = await sendTx(NONFUNGIBLE_POSITION_MANAGER, mintData, isSilent);
      await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

      setProgress({ step: 'completed', message: 'Liquidity added successfully!', txHash });
      setIsExecuting(false);
      return txHash;
    } catch (error: unknown) {
      console.error('[UniswapLP] Add liquidity failed:', error);
      const raw = (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : 'Failed to add liquidity');
      let msg = raw;
      if (raw.includes('UserOperation reverted') || raw.includes('reason: 0x')) {
        msg = 'LP transaction failed. This can happen if the pool price moved or approvals haven\'t settled. Please try again.';
      } else if (raw.includes('Insufficient')) {
        msg = raw;
      } else if (raw.length > 120) {
        msg = 'Failed to add liquidity. Please try again in a few seconds.';
      }
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsExecuting(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, approveToken, sendTx, switchChainAsync]);

  const removeLiquidity = useCallback(async (params: RemoveLiquidityParams): Promise<string | undefined> => {
    if (!address || !baseClient) {
      setProgress({ step: 'failed', message: 'Wallet not connected', error: 'Wallet not connected' });
      setIsExecuting(false);
      return;
    }

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;
    setIsExecuting(true);

    try {
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      const tokenId = BigInt(params.tokenId);
      const liquidityToRemove = (BigInt(params.liquidity) * BigInt(params.percentage)) / 100n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      // Step 1: Decrease liquidity
      setProgress({ step: 'removing_liquidity', message: `Removing ${params.percentage}% liquidity...` });
      const decreaseData = encodeFunctionData({
        abi: NonfungiblePositionManagerABI,
        functionName: 'decreaseLiquidity',
        args: [{
          tokenId,
          liquidity: liquidityToRemove,
          amount0Min: 0n,
          amount1Min: 0n,
          deadline,
        }],
      });

      const decreaseTx = await sendTx(NONFUNGIBLE_POSITION_MANAGER, decreaseData, isSilent);
      await baseClient.waitForTransactionReceipt({ hash: decreaseTx as `0x${string}` });

      // Step 2: Collect tokens + fees
      setProgress({ step: 'collecting', message: 'Collecting tokens and fees...' });
      const collectData = encodeFunctionData({
        abi: NonfungiblePositionManagerABI,
        functionName: 'collect',
        args: [{
          tokenId,
          recipient: address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }],
      });

      const collectTx = await sendTx(NONFUNGIBLE_POSITION_MANAGER, collectData, isSilent);
      await baseClient.waitForTransactionReceipt({ hash: collectTx as `0x${string}` });

      setProgress({ step: 'completed', message: 'Liquidity removed successfully!', txHash: collectTx });
      setIsExecuting(false);
      return collectTx;
    } catch (error: unknown) {
      console.error('[UniswapLP] Remove liquidity failed:', error);
      const raw = (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : 'Failed to remove liquidity');
      let msg = raw;
      if (raw.length > 120) msg = 'Failed to remove liquidity. Please try again.';
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsExecuting(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, sendTx, switchChainAsync]);

  const collectFees = useCallback(async (params: CollectFeesParams): Promise<string | undefined> => {
    if (!address || !baseClient) {
      setProgress({ step: 'failed', message: 'Wallet not connected', error: 'Wallet not connected' });
      setIsExecuting(false);
      return;
    }

    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;
    setIsExecuting(true);

    try {
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      setProgress({ step: 'collecting', message: 'Collecting fees...' });
      const collectData = encodeFunctionData({
        abi: NonfungiblePositionManagerABI,
        functionName: 'collect',
        args: [{
          tokenId: BigInt(params.tokenId),
          recipient: address,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128,
        }],
      });

      const txHash = await sendTx(NONFUNGIBLE_POSITION_MANAGER, collectData, isSilent);
      await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

      setProgress({ step: 'completed', message: 'Fees collected successfully!', txHash });
      setIsExecuting(false);
      return txHash;
    } catch (error: unknown) {
      console.error('[UniswapLP] Collect fees failed:', error);
      const raw = (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : 'Failed to collect fees');
      let msg = raw;
      if (raw.length > 120) msg = 'Failed to collect fees. Please try again.';
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsExecuting(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, sendTx, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsExecuting(false);
  }, []);

  return { addLiquidity, removeLiquidity, collectFees, progress, isExecuting, reset };
}
