'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, AlertTriangle, ExternalLink, ArrowDownToLine } from 'lucide-react';
import { toast } from 'sonner';
import { useDefiWithdraw } from '@/lib/hooks/use-defi-withdraw';
import { DeFiPosition } from '@/lib/hooks/use-defi-positions';

interface WithdrawModalProps {
  position: DeFiPosition;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
}

export function WithdrawModal({ position, onClose, onSuccess }: WithdrawModalProps) {
  const [uiStep, setUiStep] = useState<'confirm' | 'processing' | 'success' | 'error'>('confirm');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { executeWithdraw, progress, isWithdrawing, reset } = useDefiWithdraw();

  const handleWithdraw = useCallback(async () => {
    setUiStep('processing');
    setErrorMsg(null);

    try {
      const txHash = await executeWithdraw({
        protocol: position.protocol,
        balanceRaw: position.balanceRaw,
      });
      setUiStep('success');
      toast.success(`Withdrew $${position.balanceFormatted} USDC from ${position.label}`);
      if (txHash) onSuccess(txHash);
    } catch (err: any) {
      setUiStep('error');
      const msg = err?.message || 'Withdrawal failed';
      setErrorMsg(msg);
      toast.error(msg);
    }
  }, [position, executeWithdraw, onSuccess]);

  const handleRetry = () => {
    reset();
    setUiStep('confirm');
    setErrorMsg(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={uiStep === 'confirm' ? onClose : undefined}
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
              <ArrowDownToLine className="h-5 w-5 text-orange-600" />
              <span className="font-black text-sm uppercase tracking-wider text-[#3a3a3a]" style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}>
                Withdraw from {position.label}
              </span>
            </div>
            {uiStep === 'confirm' && (
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
            {/* Confirm State */}
            {uiStep === 'confirm' && (
              <>
                <div className="p-3 bg-neutral-50 border border-[#e5e7eb] rounded-[8px]">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm font-bold">{position.label}</p>
                    <span className="font-mono text-sm font-bold text-orange-600">
                      ${position.balanceFormatted} USDC
                    </span>
                  </div>
                  <p className="font-mono text-xs text-neutral-500 mt-1">
                    Full withdrawal including accrued interest
                  </p>
                </div>

                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  className="w-full py-3.5 bg-orange-600 text-white text-sm font-bold uppercase tracking-wider rounded-[8px] hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)]"
                  style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
                >
                  Withdraw All
                </button>
              </>
            )}

            {/* Processing State */}
            {uiStep === 'processing' && (
              <div className="text-center py-12">
                <Loader2 className="h-16 w-16 animate-spin text-orange-500 mx-auto mb-4" />
                <p className="text-sm uppercase font-bold mb-2">
                  Withdrawing...
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
                  Withdrawal Successful
                </p>
                <p className="font-mono text-xs text-neutral-500 mb-3">
                  ${position.balanceFormatted} USDC withdrawn from {position.label}
                </p>
                {progress.txHash && (
                  <a
                    href={`https://basescan.org/tx/${progress.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs underline text-orange-700 hover:text-orange-900"
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
                  Withdrawal Failed
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
