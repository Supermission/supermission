// Compact inline Morpho deposit confirmation — renders inside chat message
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMorphoDeposit } from '@/lib/hooks/use-morpho-deposit';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';
import { ContractAddress } from '@/components/ui/contract-address';

interface MorphoDepositData {
  vaultAddress: string;
  vaultName: string;
  assetAddress: string;
  assetSymbol: string;
  assetDecimals: number;
  amount: string;
  apy: string | null;
  curator: string;
}

const DEPOSIT_STEPS = [
  { key: 'checking_balance', label: 'Check' },
  { key: 'approving', label: 'Approve' },
  { key: 'depositing', label: 'Deposit' },
  { key: 'completed', label: 'Done' },
];

export function MorphoDepositInline({ data, isHistory }: { data: MorphoDepositData; isHistory?: boolean }) {
  const { executeDeposit, progress, isDepositing, reset } = useMorphoDeposit();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);

  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';
  const showProgress = confirmed && (isDepositing || isDone || isFailed);

  // Send feedback message to chat so the AI knows the outcome
  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `Morpho deposit confirmed: ${data.amount} ${data.assetSymbol} into ${data.vaultName}. Transaction: https://basescan.org/tx/${progress.txHash}`,
      });
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `Morpho deposit failed: ${progress.error}`,
      });
    }
  }, [isHistory, progress.step, progress.txHash, progress.error, data, addMessage]);

  const handleConfirm = async () => {
    if (executingRef.current) return;
    executingRef.current = true;
    setConfirmed(true);
    feedbackSent.current = false;
    try {
      await executeDeposit({
        vaultAddress: data.vaultAddress as `0x${string}`,
        assetAddress: data.assetAddress as `0x${string}`,
        assetDecimals: data.assetDecimals,
        amount: data.amount,
      });
    } catch {
      // error is already in progress state
    }
  };

  const handleReset = () => {
    setConfirmed(false);
    feedbackSent.current = false;
    executingRef.current = false;
    reset();
  };

  if (isHistory) {
    return (
      <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[#1a1a1a] truncate">
                Deposit {data.amount} {data.assetSymbol}
              </span>
              <span className="text-[#9ca3af]">&rarr;</span>
              <span className="text-[#48484b] truncate">{data.vaultName}</span>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">Deposit offer expired (from previous session)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      {/* Header row */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[#1a1a1a] truncate">
              Deposit {data.amount} {data.assetSymbol}
            </span>
            <span className="text-[#9ca3af]">&rarr;</span>
            <span className="text-[#48484b] truncate">{data.vaultName}</span>
          </div>
          {data.apy && <span className="text-[12px] text-[#6b7280] whitespace-nowrap">{data.apy}% APY</span>}
        </div>
        {data.vaultAddress && (
          <div className="mt-1.5">
            <ContractAddress address={data.vaultAddress} chainId={8453} label="Vault" />
          </div>
        )}
      </div>

      {/* Step progress bar */}
      {showProgress && (
        <TxProgressBar
          steps={DEPOSIT_STEPS}
          currentStep={progress.step}
          failed={isFailed}
          statusMessage={progress.message}
        />
      )}

      {/* Action area */}
      <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
        {!confirmed && !isDepositing && !isDone && !isFailed && (
          <button
            onClick={handleConfirm}
            disabled={confirmed || isDepositing}
            className="w-full h-9 bg-gradient-to-b from-[#1a1a1a] to-[#2d2d2d] text-white text-[12px] font-semibold rounded-[8px] hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Confirm Deposit
          </button>
        )}

        {confirmed && !isDepositing && !isDone && !isFailed && (
          <div className="flex items-center justify-center gap-2 h-9 text-[12px] text-[#6b7280] font-medium">
            <span className="w-3.5 h-3.5 border-2 border-[#d1d5db] border-t-[#1a1a1a] rounded-full animate-spin" />
            Preparing deposit…
          </div>
        )}

        {isDone && progress.txHash && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-green-600">Deposit confirmed</span>
            <a
              href={`https://basescan.org/tx/${progress.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-[#6b7280] hover:text-[#1a1a1a] underline transition-colors"
            >
              View transaction
            </a>
          </div>
        )}

        {isFailed && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-red-500 truncate mr-2">
              {progress.error || 'Deposit failed'}
            </span>
            <button
              onClick={handleReset}
              className="text-[11px] font-medium text-[#6b7280] hover:text-[#1a1a1a] underline transition-colors flex-shrink-0"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
