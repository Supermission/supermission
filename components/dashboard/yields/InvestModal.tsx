'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, AlertTriangle, ExternalLink, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useDefiInvest, SupportedProtocol } from '@/lib/hooks/use-defi-invest';

interface InvestModalProps {
  protocol: SupportedProtocol;
  protocolLabel: string;
  apyDisplay: string;
  suggestedAmount: string;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
}

const STEP_MESSAGES: Record<string, string> = {
  checking_balance: 'Checking USDC balance...',
  checking_allowance: 'Checking allowance...',
  approving: 'Approving USDC...',
  depositing: 'Depositing into protocol...',
};

export function InvestModal({
  protocol,
  protocolLabel,
  apyDisplay,
  suggestedAmount,
  onClose,
  onSuccess,
}: InvestModalProps) {
  const [amount, setAmount] = useState(suggestedAmount);
  const [uiStep, setUiStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { executeInvest, progress, isInvesting, reset } = useDefiInvest();

  const amountNum = parseFloat(amount) || 0;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountNum || amountNum <= 0) {
      toast.error('Enter a valid USDC amount');
      return;
    }

    setUiStep('processing');
    setErrorMsg(null);

    try {
      const txHash = await executeInvest({ protocol, amountUsdc: amount });
      setUiStep('success');
      toast.success(`Deposited $${amount} USDC into ${protocolLabel}`);
      if (txHash) onSuccess(txHash);
    } catch (err: any) {
      setUiStep('error');
      const msg = err?.message || 'Investment failed';
      setErrorMsg(msg);
      toast.error(msg);
    }
  }, [amountNum, amount, protocol, protocolLabel, executeInvest, onSuccess]);

  const handleRetry = () => {
    reset();
    setUiStep('input');
    setErrorMsg(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={uiStep === 'input' ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md bg-white border border-[#e5e7eb] rounded-[12px] shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] rounded-t-[12px]">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span className="font-black text-sm uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Invest in {protocolLabel}
              </span>
            </div>
            {uiStep === 'input' && (
              <button
                onClick={onClose}
                className="hover:bg-[#f7f7f7] p-1 transition-colors rounded"
              >
                <X className="h-5 w-5 text-[#6b7280]" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Protocol Info */}
            <div className="p-3 bg-neutral-50 border border-[#e5e7eb] rounded-[8px]">
              <div className="flex items-center justify-between">
                <p className="font-mono text-sm font-bold">{protocolLabel}</p>
                <span className="font-mono text-sm font-bold text-green-600">{apyDisplay} APY</span>
              </div>
              <p className="font-mono text-xs text-neutral-500 mt-1">Supply USDC on Base</p>
            </div>

            {/* Input State */}
            {uiStep === 'input' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-neutral-600 mb-2" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                    Amount (USDC)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-3 border border-[#e5e7eb] rounded-[8px] font-mono text-lg font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1a1a1a]"
                    autoFocus
                  />
                </div>

                {amountNum > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-[8px]">
                    <div className="flex justify-between items-center">
                      <span className="text-xs uppercase text-green-800" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>Est. Annual Yield</span>
                      <span className="font-mono text-sm font-bold text-green-700">
                        ~${(amountNum * parseFloat(apyDisplay) / 100).toFixed(2)} / year
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isInvesting || !amountNum || amountNum <= 0}
                  className="w-full py-3.5 bg-green-600 text-white text-sm font-bold uppercase tracking-wider rounded-[8px] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Deposit ${amountNum.toFixed(2)} USDC
                </button>
              </form>
            )}

            {/* Processing State */}
            {uiStep === 'processing' && (
              <div className="text-center py-12">
                <Loader2 className="h-16 w-16 animate-spin text-green-500 mx-auto mb-4" />
                <p className="text-sm uppercase font-bold mb-2">
                  {STEP_MESSAGES[progress.step] || 'Processing...'}
                </p>
                <p className="font-mono text-xs text-neutral-500">
                  {progress.message}
                </p>
              </div>
            )}

            {/* Success State */}
            {uiStep === 'success' && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-4">
                  <Check className="h-10 w-10 text-emerald-600" />
                </div>
                <p className="text-sm uppercase font-bold text-emerald-600 mb-2">
                  Deposit Successful
                </p>
                <p className="font-mono text-xs text-neutral-500 mb-3">
                  ${amount} USDC deposited into {protocolLabel}
                </p>
                {progress.txHash && (
                  <a
                    href={`https://basescan.org/tx/${progress.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs underline text-green-700 hover:text-green-900"
                  >
                    View on Basescan <ExternalLink size={10} />
                  </a>
                )}
                <div className="mt-6">
                  <button
                    onClick={onClose}
                    className="px-6 py-2 border border-[#e5e7eb] rounded-[8px] text-xs uppercase hover:bg-[#f7f7f7] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Error State */}
            {uiStep === 'error' && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                  <AlertTriangle className="h-10 w-10 text-red-600" />
                </div>
                <p className="text-sm uppercase font-bold text-red-600 mb-2">
                  Deposit Failed
                </p>
                <p className="font-mono text-xs text-neutral-600 mb-4 px-4 break-words">
                  {errorMsg || 'An error occurred'}
                </p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 border border-[#e5e7eb] rounded-[8px] text-xs uppercase hover:bg-[#f7f7f7] transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
