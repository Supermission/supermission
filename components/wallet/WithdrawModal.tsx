'use client';

import { useState, useEffect } from 'react';
import { useBalance } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { useCDPWithdrawal, type WithdrawalStatus } from '@/lib/hooks/use-server-withdrawal';
import { CONTRACTS } from '@/lib/contracts/addresses';
import { toast } from 'sonner';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');

  const {
    cdpAddress,
    isCDPReady,
    executeWithdrawal,
    validateWithdrawal,
    status,
    isProcessing,
    txHash,
    error,
    reset,
  } = useCDPWithdrawal();

  // Get USDC balance
  const { data: balanceData, isLoading: isLoadingBalance, refetch: refetchBalance } = useBalance({
    address: cdpAddress as `0x${string}`,
    token: CONTRACTS.USDC,
    query: {
      enabled: !!cdpAddress && isCDPReady,
    },
  });

  const balance = balanceData?.value ?? 0n;
  const balanceFormatted = formatUnits(balance, 6);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRecipientAddress('');
      setAmount('');
      reset();
    }
  }, [isOpen, reset]);

  // Refetch balance on success
  useEffect(() => {
    if (status === 'success') {
      refetchBalance();
    }
  }, [status, refetchBalance]);

  const handleMaxClick = () => {
    setAmount(balanceFormatted);
  };

  const handleWithdraw = async () => {
    const result = await executeWithdrawal({
      recipientAddress,
      amount,
    });

    if (result.success) {
      toast.success('Withdrawal successful!');
    } else {
      toast.error(result.error || 'Withdrawal failed');
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  // Live validation for UI feedback
  const amountNum = parseFloat(amount) || 0;
  const hasEnoughBalance = amountNum <= parseFloat(balanceFormatted);
  const isValidAddress = recipientAddress ? isAddress(recipientAddress) : true;
  const canWithdraw = isCDPReady &&
    amountNum > 0 &&
    hasEnoughBalance &&
    isValidAddress &&
    recipientAddress.length > 0;

  if (!isOpen) return null;

  const getStatusDisplay = (): { text: string; showSpinner: boolean } | null => {
    switch (status) {
      case 'validating':
        return { text: 'Validating...', showSpinner: true };
      case 'sending':
        return { text: 'Sending transaction...', showSpinner: true };
      case 'confirming':
        return { text: 'Confirming...', showSpinner: true };
      case 'success':
        return { text: 'Withdrawal complete!', showSpinner: false };
      case 'error':
        return { text: 'Failed', showSpinner: false };
      default:
        return null;
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-[#e5e7eb] rounded-[16px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white p-4 flex items-center justify-between">
          <h2
            className="font-bold text-sm tracking-wide text-white"
            style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
          >
            Withdraw Funds
          </h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="hover:opacity-70 transition-opacity disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Balance Display */}
          <div className="border border-[#e5e7eb] p-4 bg-[#f8fafc] rounded-[16px]">
            <p
              className="text-[11px] text-[#6b7280] tracking-wide mb-1"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Available Balance
            </p>
            <p className="font-bold text-2xl text-[#3a3a3a] font-mono">
              {isLoadingBalance ? 'Loading...' : `$${parseFloat(balanceFormatted).toFixed(2)}`}
            </p>
            <p className="text-[10px] font-mono text-[#6b7280]">USDC on Base</p>
          </div>

          {/* Recipient Address */}
          <div>
            <label
              className="block text-[11px] tracking-wide mb-2 text-[#6b7280]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Recipient Address
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x..."
              disabled={isProcessing}
              className={`w-full px-3 py-3 border font-mono text-sm transition-colors rounded-[8px] ${
                recipientAddress && !isValidAddress
                  ? 'border-red-400 bg-red-50'
                  : 'border-[#e5e7eb] focus:border-[#3a3a3a]'
              } disabled:opacity-50 disabled:bg-gray-100`}
            />
            {recipientAddress && !isValidAddress && (
              <p className="text-[10px] text-red-600 mt-1 font-mono">Invalid wallet address</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label
              className="block text-[11px] tracking-wide mb-2 text-[#6b7280]"
              style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
            >
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={isProcessing}
                className={`w-full px-3 py-3 pr-16 border font-mono text-sm transition-colors rounded-[8px] ${
                  amount && !hasEnoughBalance
                    ? 'border-red-400 bg-red-50'
                    : 'border-[#e5e7eb] focus:border-[#3a3a3a]'
                } disabled:opacity-50 disabled:bg-gray-100`}
              />
              <button
                type="button"
                onClick={handleMaxClick}
                disabled={isProcessing || isLoadingBalance}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white rounded-[8px] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Max
              </button>
            </div>
            {amount && !hasEnoughBalance && (
              <p className="text-[10px] text-red-600 mt-1 font-mono">Insufficient balance</p>
            )}
          </div>

          {/* Status Display */}
          {statusDisplay && (
            <div className={`flex items-center justify-center gap-2 py-3 border rounded-[8px] ${
              status === 'success' ? 'bg-green-50 border-green-200' :
              status === 'error' ? 'bg-red-50 border-red-200' :
              'bg-[#f8fafc] border-[#e5e7eb]'
            }`}>
              {statusDisplay.showSpinner && (
                <div className="w-4 h-4 border-2 border-[#e5e7eb] border-t-[#3a3a3a] rounded-full animate-spin" />
              )}
              {status === 'success' && (
                <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {status === 'error' && (
                <svg className="w-4 h-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={`text-[11px] font-semibold tracking-wide ${
                status === 'success' ? 'text-green-700' :
                status === 'error' ? 'text-red-700' :
                'text-[#48484b]'
              }`}>
                {statusDisplay.text}
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && status === 'error' && (
            <p className="text-[10px] font-mono text-red-600 text-center">{error}</p>
          )}

          {/* Transaction Link */}
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[11px] font-mono text-blue-600 hover:text-blue-800 tracking-wide underline"
            >
              View Transaction on BaseScan
            </a>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            {status === 'success' ? (
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[11px] font-semibold tracking-wide hover:opacity-90 transition-opacity rounded-[8px]"
                style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
              >
                Done
              </button>
            ) : status === 'error' ? (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-3 border border-[#e5e7eb] bg-white text-[#3a3a3a] text-[11px] font-semibold tracking-wide hover:bg-gradient-to-b hover:from-[#1a1a1a] hover:to-[#3b3b3b] hover:text-white transition-colors rounded-[8px]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[11px] font-semibold tracking-wide hover:opacity-90 transition-opacity rounded-[8px]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="flex-1 py-3 border border-[#e5e7eb] bg-white text-[#3a3a3a] text-[11px] font-semibold tracking-wide hover:bg-gradient-to-b hover:from-[#1a1a1a] hover:to-[#3b3b3b] hover:text-white transition-colors disabled:opacity-50 rounded-[8px]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={!canWithdraw || isProcessing}
                  className="flex-1 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white text-[11px] font-semibold tracking-wide hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  {isProcessing ? 'Processing...' : 'Withdraw'}
                </button>
              </>
            )}
          </div>

          {/* Info Note */}
          {status === 'idle' && (
            <p className="text-[10px] text-[#6b7280] text-center">
              Withdrawals are gasless and processed on Base network
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
