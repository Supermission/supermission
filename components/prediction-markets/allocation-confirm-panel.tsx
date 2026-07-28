'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Check, X, Loader2 } from 'lucide-react';
import type { AllocationItem } from '@/lib/ai/prediction-market-allocator';

export interface BatchProgress {
  current: number;
  total: number;
  currentMarket: string;
  status: 'idle' | 'executing' | 'completed' | 'failed';
  results: Array<{
    condition_id: string;
    success: boolean;
    orderId?: string;
    error?: string;
  }>;
}

interface AllocationConfirmPanelProps {
  allocations: AllocationItem[];
  totalBudget: number;
  reasoning: string;
  onConfirm: () => void;
  onCancel: () => void;
  batchProgress?: BatchProgress;
}

export function AllocationConfirmPanel({
  allocations,
  totalBudget,
  reasoning,
  onConfirm,
  onCancel,
  batchProgress,
}: AllocationConfirmPanelProps) {
  const isExecuting = batchProgress?.status === 'executing';
  const isCompleted = batchProgress?.status === 'completed';
  const isFailed = batchProgress?.status === 'failed';

  return (
    <div className="w-full border border-[#e5e7eb] rounded-[16px] bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold font-bricolage text-[#3a3a3a] uppercase tracking-wider">
            Trade Allocation
          </span>
          <span className="text-[11px] font-mono text-[#6b7280]">
            ${totalBudget.toFixed(2)} total
          </span>
        </div>
        {reasoning && (
          <p className="text-[10px] text-[#6b7280] mt-1 leading-relaxed">{reasoning}</p>
        )}
      </div>

      {/* Allocation table */}
      <div className="divide-y divide-[#f3f4f6]">
        {allocations.map((alloc, idx) => {
          const isYes = alloc.outcome === 'YES';
          const tradeResult = batchProgress?.results.find(r => r.condition_id === alloc.condition_id);
          const isCurrent = batchProgress?.current === idx && isExecuting;
          // Only show failures after the entire batch finishes — avoids
          // flashing "failed" for validation errors while later trades
          // are still executing.
          const showFailure = tradeResult && !tradeResult.success && !isExecuting;

          return (
            <div
              key={alloc.condition_id}
              className={cn(
                'px-4 py-2.5 flex items-center gap-3 transition-colors',
                isCurrent && 'bg-blue-50/50',
                tradeResult?.success && 'bg-emerald-50/30',
                showFailure && 'bg-red-50/30',
              )}
            >
              {/* Status indicator */}
              <div className="w-5 flex-shrink-0">
                {isCurrent ? (
                  <Loader2 size={14} className="text-blue-500 animate-spin" />
                ) : tradeResult?.success ? (
                  <Check size={14} className="text-emerald-600" />
                ) : showFailure ? (
                  <X size={14} className="text-red-500" />
                ) : isExecuting && tradeResult && !tradeResult.success ? (
                  <Check size={14} className="text-amber-500" />
                ) : (
                  <span className="text-[10px] font-mono text-[#9ca3af]">{idx + 1}</span>
                )}
              </div>

              {/* Market info */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#3a3a3a] leading-tight line-clamp-1 font-bricolage">
                  {alloc.question}
                </p>
                {showFailure && (
                  <p className="text-[9px] text-red-500 mt-0.5">{tradeResult.error}</p>
                )}
              </div>

              {/* Outcome badge */}
              <span className={cn(
                'flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[4px]',
                isYes ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              )}>
                {isYes ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                {alloc.outcome}
              </span>

              {/* Amount */}
              <span className="flex-shrink-0 text-[12px] font-mono font-bold text-[#3a3a3a] w-16 text-right">
                ${alloc.amount.toFixed(2)}
              </span>

              {/* Confidence */}
              <span className="flex-shrink-0 text-[9px] font-mono text-[#9ca3af] w-10 text-right">
                {alloc.confidence}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar during execution */}
      {isExecuting && batchProgress && (
        <div className="px-4 py-2 bg-blue-50/50 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-blue-700">
              Trade {batchProgress.current + 1}/{batchProgress.total}
            </span>
            <span className="text-[10px] font-mono text-blue-600 truncate max-w-[200px]">
              {batchProgress.currentMarket}
            </span>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-1">
            <div
              className="bg-blue-600 h-1 rounded-full transition-all duration-300"
              style={{ width: `${((batchProgress.current + 1) / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Completion summary */}
      {isCompleted && batchProgress && (
        <div className="px-4 py-2.5 bg-emerald-50/50 border-t border-[#e5e7eb]">
          <span className="text-[11px] font-bold text-emerald-700">
            {batchProgress.results.filter(r => r.success).length}/{batchProgress.total} trades completed successfully
          </span>
        </div>
      )}

      {/* Action buttons */}
      {!isExecuting && !isCompleted && (
        <div className="px-4 py-3 border-t border-[#e5e7eb] flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[11px] font-bold text-[#6b7280] hover:text-[#3a3a3a] transition-colors rounded-[6px] hover:bg-[#f3f4f6]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-[11px] font-bold text-white bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] rounded-[8px] hover:from-[#2a2a2a] hover:to-[#4b4b4b] shadow-sm transition-all"
          >
            Confirm All Trades
          </button>
        </div>
      )}
    </div>
  );
}
