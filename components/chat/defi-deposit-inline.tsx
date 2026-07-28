// Inline Aave V3 / Compound III deposit card — renders inside DELPHI chat message
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDefiInvest, type SupportedProtocol } from '@/lib/hooks/use-defi-invest';
import { useChatStore } from '@/lib/store/chat';
import { TxProgressBar } from './tx-progress-bar';
import { ContractAddress } from '@/components/ui/contract-address';

interface DefiDepositData {
  protocol: SupportedProtocol;
  protocolLabel: string;
  poolAddress: string;
  assetAddress: string;
  assetSymbol: string;
  assetDecimals: number;
  amount: string;
}

const DEPOSIT_STEPS = [
  { key: 'checking_balance', label: 'Check' },
  {
    key: 'approving',
    label: 'Approve',
    hint: 'One-time permission for the protocol to spend this token. No funds move yet.',
  },
  {
    key: 'depositing',
    label: 'Deposit',
    hint: 'Signing the deposit — funds go from your wallet into the vault.',
  },
  { key: 'completed', label: 'Done' },
];

const SIGN_DELAY_SECONDS = 3;

export function DefiDepositInline({ data, isHistory }: { data: DefiDepositData; isHistory?: boolean }) {
  const { executeInvest, progress, isInvesting, reset } = useDefiInvest();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(SIGN_DELAY_SECONDS);
  const [aborted, setAborted] = useState(false);
  const feedbackSent = useRef(false);
  const executingRef = useRef(false);
  const abortedRef = useRef(false);
  const addMessage = useChatStore((s) => s.addMessage);

  const isDone = progress.step === 'completed';
  const isFailed = progress.step === 'failed';
  const showProgress = confirmed && (isInvesting || isDone || isFailed);

  // Countdown before wallet signature — abort window, not a confirmation.
  useEffect(() => {
    if (isHistory) return;
    if (executingRef.current || abortedRef.current) return;
    if (countdown <= 0) {
      handleConfirm();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, isHistory]);

  const handleCancel = () => {
    abortedRef.current = true;
    setAborted(true);
    addMessage({ role: 'assistant', content: `${data.protocolLabel} deposit canceled.` });
  };

  // Send feedback message to chat so the AI knows the outcome
  useEffect(() => {
    if (isHistory) return;
    if (feedbackSent.current) return;

    if (progress.step === 'completed' && progress.txHash) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `${data.protocolLabel} deposit confirmed: ${data.amount} ${data.assetSymbol}. Transaction: https://basescan.org/tx/${progress.txHash}`,
      });
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      window.dispatchEvent(new Event('trade-completed'));
    } else if (progress.step === 'failed' && progress.error) {
      feedbackSent.current = true;
      addMessage({
        role: 'assistant',
        content: `${data.protocolLabel} deposit failed: ${progress.error}`,
      });
    }
  }, [isHistory, progress.step, progress.txHash, progress.error, data, addMessage]);

  const handleConfirm = async () => {
    if (executingRef.current) return;
    executingRef.current = true;
    setConfirmed(true);
    feedbackSent.current = false;
    try {
      await executeInvest({
        protocol: data.protocol,
        amountUsdc: data.amount,
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
              <span className="text-[#48484b] truncate">{data.protocolLabel}</span>
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
            <span className="text-[#48484b] truncate">{data.protocolLabel}</span>
          </div>
          <span className="text-[12px] text-[#6b7280] whitespace-nowrap">Base</span>
        </div>
        {data.poolAddress && (
          <div className="mt-1.5">
            <ContractAddress address={data.poolAddress} chainId={8453} label="Pool" />
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
        {!confirmed && !isInvesting && !aborted && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#9ca3af]">
              Signing in {countdown}s…
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[11px] font-semibold text-[#6b7280] hover:text-[#1a1a1a] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        {aborted && !isInvesting && (
          <span className="text-[12px] text-[#9ca3af]">Deposit canceled.</span>
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
