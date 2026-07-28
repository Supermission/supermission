// Inline token transfer execution card — renders inside DELPHI chat message
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTokenTransfer } from '@/lib/hooks/use-token-transfer';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';

interface TransferData {
  tokenSymbol: string;
  tokenAddress: string;
  amount: string;
  toAddress: string;
  chainId: number;
  chainName: string;
  decimals: number;
}

const EXPLORER_URLS: Record<number, string> = {
  8453: 'https://basescan.org',
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
};

const TRANSFER_STEPS = [
  { key: 'checking_balance', label: 'Check' },
  { key: 'sending', label: 'Send' },
  { key: 'completed', label: 'Done' },
];

export function TransferExecuteInline({ data, isHistory }: { data: TransferData; isHistory?: boolean }) {
  const { executeTransfer, progress, isTransferring, reset } = useTokenTransfer();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);

  const explorerUrl = EXPLORER_URLS[data.chainId] || 'https://basescan.org';
  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';
  const showProgress = confirmed && (isTransferring || isDone || isFailed);

  // Auto-execute on mount — user already confirmed via text chat
  useEffect(() => {
    if (isHistory) return;
    if (executingRef.current) return;
    handleConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shortAddr = `${data.toAddress.slice(0, 6)}...${data.toAddress.slice(-4)}`;

  // Send feedback message to chat so the AI knows the outcome
  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `Transfer confirmed: ${data.amount} ${data.tokenSymbol} sent to ${shortAddr} on ${data.chainName}. Transaction: ${explorerUrl}/tx/${progress.txHash}`,
      });
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `Transfer failed: ${progress.error}`,
      });
    }
  }, [isHistory, progress.step, progress.txHash, progress.error, data, explorerUrl, addMessage, shortAddr, queryClient]);

  const handleConfirm = async () => {
    if (executingRef.current) return;
    executingRef.current = true;
    setConfirmed(true);
    feedbackSent.current = false;
    try {
      await executeTransfer({
        tokenAddress: data.tokenAddress,
        toAddress: data.toAddress,
        amount: data.amount,
        decimals: data.decimals,
        chainId: data.chainId,
      });
    } catch {
      // error handled via progress state
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
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-[#1a1a1a]">
              {data.amount} {data.tokenSymbol}
            </span>
            <span className="text-[#9ca3af]">&rarr;</span>
            <span className="font-mono text-[12px] text-[#6b7280]">
              {shortAddr}
            </span>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
          <span className="text-[12px] text-[#9ca3af]">Transfer offer expired (from previous session)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border border-[#e5e7eb] rounded-[12px] bg-[#fafbfc] overflow-hidden">
      {/* Transfer details */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-[#1a1a1a]">
            {data.amount} {data.tokenSymbol}
          </span>
          <span className="text-[#9ca3af]">&rarr;</span>
          <span className="font-mono text-[12px] text-[#6b7280]">
            {shortAddr}
          </span>
        </div>

        <div className="flex items-center gap-3 mt-1 text-[11px] text-[#9ca3af]">
          <span>{data.chainName}</span>
          <span>{data.tokenAddress === '0x0000000000000000000000000000000000000000' ? 'Native Transfer' : 'ERC-20 Transfer'}</span>
        </div>
      </div>

      {/* Step progress bar */}
      {showProgress && (
        <TxProgressBar
          steps={TRANSFER_STEPS}
          currentStep={progress.step}
          failed={isFailed}
          statusMessage={progress.message}
        />
      )}

      {/* Action area */}
      <div className="px-4 py-2.5 border-t border-[#e5e7eb]">
        {!confirmed && !isTransferring && (
          <span className="text-[12px] text-[#9ca3af]">Preparing transfer...</span>
        )}

        {isDone && progress.txHash && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-green-600">
              Transfer confirmed
            </span>
            <a
              href={`${explorerUrl}/tx/${progress.txHash}`}
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
              {progress.error || 'Transfer failed'}
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
