// use-morpho-deposit.ts - ERC-4626 deposit into MetaMorpho vaults on Base
// Privy embedded wallet (gas-sponsored) + wagmi external wallet dual-path
import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi';
import { useWallets, useSendTransaction as usePrivySendTransaction } from '@privy-io/react-auth';
import { parseUnits, encodeFunctionData, formatUnits } from 'viem';
import { base } from 'wagmi/chains';
import { ERC4626_VAULT_ABI, ERC20_ABI } from '@/lib/morpho/abis';
import { translateWalletError } from '@/lib/error-translators/wallet-errors';

const BASE_CHAIN_ID = 8453;

export type MorphoDepositStep =
  | 'idle'
  | 'checking_balance'
  | 'checking_allowance'
  | 'approving'
  | 'depositing'
  | 'completed'
  | 'failed';

export interface MorphoDepositProgress {
  step: MorphoDepositStep;
  message: string;
  txHash?: string;
  error?: string;
}

export interface MorphoDepositParams {
  vaultAddress: `0x${string}`;
  assetAddress: `0x${string}`;
  assetDecimals: number;
  amount: string; // human-readable, e.g. "100"
}

export function useMorphoDeposit() {
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { refetch: refetchWalletClient } = useWalletClient({ chainId: base.id });
  const { switchChainAsync } = useSwitchChain();
  const baseClient = usePublicClient({ chainId: base.id });
  const { sendTransaction: privySendTransaction } = usePrivySendTransaction();

  const [progress, setProgress] = useState<MorphoDepositProgress>({ step: 'idle', message: '' });
  const [isDepositing, setIsDepositing] = useState(false);

  const getEmbeddedWallet = useCallback(() => {
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  const executeDeposit = useCallback(async (params: MorphoDepositParams): Promise<string | undefined> => {
    if (!address || !baseClient) {
      setProgress({ step: 'failed', message: 'Wallet not connected', error: 'Wallet not connected' });
      setIsDepositing(false);
      return;
    }

    const amountRaw = parseUnits(params.amount, params.assetDecimals);
    const embedded = getEmbeddedWallet();
    const isSilent = !!embedded;

    setIsDepositing(true);

    try {
      if (!isSilent) {
        await switchChainAsync({ chainId: base.id });
      }

      // Step 1: Check asset balance
      setProgress({ step: 'checking_balance', message: 'Checking balance...' });
      const balance = await baseClient.readContract({
        address: params.assetAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });

      if (balance < amountRaw) {
        const balFmt = formatUnits(balance, params.assetDecimals);
        throw new Error(`Insufficient balance. You have ${parseFloat(balFmt).toFixed(2)} but need ${params.amount}`);
      }

      // Step 2: Check allowance
      setProgress({ step: 'checking_allowance', message: 'Checking allowance...' });
      const allowance = await baseClient.readContract({
        address: params.assetAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, params.vaultAddress],
      });

      // Step 3: Approve if needed (use large approval to avoid rounding/race issues)
      if (allowance < amountRaw) {
        setProgress({ step: 'approving', message: 'Waiting for wallet to approve token spend…' });
        // Approve generous amount to prevent bundler simulation failures
        // (exact-amount approvals fail when the bundler simulates against slightly stale state)
        const approveAmount = amountRaw * 10n;
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [params.vaultAddress, approveAmount],
        });

        if (isSilent) {
          const approveReceipt = await privySendTransaction(
            { to: params.assetAddress, data: approveData, chainId: BASE_CHAIN_ID },
            { sponsor: true, address },
          );
          // Wait for approval to be mined before depositing
          setProgress({ step: 'approving', message: 'Confirming approval on Base (~15s)…' });
          await baseClient.waitForTransactionReceipt({ hash: approveReceipt.hash as `0x${string}` });
        } else {
          const { data: walletClient } = await refetchWalletClient();
          if (!walletClient) throw new Error('Wallet not available');
          const approveTx = await walletClient.sendTransaction({
            account: address,
            chain: base,
            to: params.assetAddress,
            data: approveData,
            value: 0n,
          });
          setProgress({ step: 'approving', message: 'Confirming approval on Base (~15s)…' });
          await baseClient.waitForTransactionReceipt({ hash: approveTx });
        }

        // Re-verify allowance after receipt confirmation (bundler may simulate against stale state)
        const newAllowance = await baseClient.readContract({
          address: params.assetAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, params.vaultAddress],
        });

        if (newAllowance < amountRaw) {
          throw new Error('Token approval not confirmed yet. Please try again in a few seconds.');
        }
      }

      // Step 4: Deposit into vault (ERC-4626 deposit(assets, receiver))
      setProgress({ step: 'depositing', message: `Depositing ${params.amount} into vault...` });
      const depositData = encodeFunctionData({
        abi: ERC4626_VAULT_ABI,
        functionName: 'deposit',
        args: [amountRaw, address],
      });

      setProgress({ step: 'depositing', message: 'Waiting for wallet to sign deposit…' });
      let txHash: string;
      if (isSilent) {
        const receipt = await privySendTransaction(
          { to: params.vaultAddress, data: depositData, chainId: BASE_CHAIN_ID },
          { sponsor: true, address },
        );
        txHash = receipt.hash;
      } else {
        const { data: walletClient } = await refetchWalletClient();
        if (!walletClient) throw new Error('Wallet not available');
        txHash = await walletClient.sendTransaction({
          account: address,
          chain: base,
          to: params.vaultAddress,
          data: depositData,
          value: 0n,
        });
        // Wait for on-chain confirmation before declaring success
        setProgress({ step: 'depositing', message: 'Confirming on Base (~15s)…' });
        await baseClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
      }

      setProgress({ step: 'completed', message: 'Deposit successful!', txHash });
      setIsDepositing(false);
      return txHash;
    } catch (error: unknown) {
      console.error('[MorphoDeposit] Failed:', error);
      const translated = translateWalletError(error);
      const msg = translated.hint ? `${translated.title} ${translated.hint}` : translated.title;
      setProgress({ step: 'failed', message: msg, error: msg });
      setIsDepositing(false);
      throw error;
    }
  }, [address, baseClient, getEmbeddedWallet, privySendTransaction, refetchWalletClient, switchChainAsync]);

  const reset = useCallback(() => {
    setProgress({ step: 'idle', message: '' });
    setIsDepositing(false);
  }, []);

  return { executeDeposit, progress, isDepositing, reset };
}
