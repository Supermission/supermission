'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLimitOrders } from '@/lib/hooks/use-limit-orders';
import { fetchTickSize } from '@/lib/polymarket/api';
import { PolymarketAvailable } from './PolymarketAvailable';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";
const MIN_SHARES = 5;

interface LimitOrderFormProps {
  tokenId: string;
  noTokenId?: string;
  conditionId: string;
  outcomes: string[];
}

export default function LimitOrderForm({ tokenId, noTokenId, conditionId, outcomes }: LimitOrderFormProps) {
  const { createLimitOrder, loading } = useLimitOrders();

  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [priceInput, setPriceInput] = useState('50');
  const [sizeInput, setSizeInput] = useState('');
  const [tickSize, setTickSize] = useState('0.01');
  const [submitting, setSubmitting] = useState(false);

  const outcomeLabels = outcomes.length > 0 ? outcomes : ['Yes', 'No'];

  useEffect(() => {
    let cancelled = false;
    fetchTickSize(tokenId)
      .then((ts) => { if (!cancelled) setTickSize(ts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tokenId]);

  const priceDecimal = parseFloat(priceInput) / 100;
  const size = parseFloat(sizeInput) || 0;
  const tickSizeNum = parseFloat(tickSize);
  const tickCents = tickSizeNum * 100;
  const cost = priceDecimal * size;

  const validatePrice = useCallback(
    (cents: number): boolean => {
      if (cents <= 0 || cents >= 100) return false;
      const decimal = cents / 100;
      if (tickSizeNum <= 0) return true;
      const remainder = Math.round((decimal * 1e8) % (tickSizeNum * 1e8)) / 1e8;
      return remainder < 1e-10;
    },
    [tickSizeNum],
  );

  const priceValid = validatePrice(parseFloat(priceInput));
  const sizeValid = size >= MIN_SHARES;
  const formValid = priceValid && sizeValid && !loading && !submitting;

  const handleSubmit = async () => {
    if (!formValid) return;
    setSubmitting(true);
    try {
      const activeTokenId = selectedOutcome === 0 ? tokenId : (noTokenId || tokenId);
      await createLimitOrder(activeTokenId, side, priceDecimal, size);
      setSizeInput('');
    } catch {
      // Error already toasted by hook
    } finally {
      setSubmitting(false);
    }
  };

  const isBuy = side === 'BUY';
  const activeLabel = outcomeLabels[selectedOutcome] || 'Yes';
  const isYesOutcome = selectedOutcome === 0;

  return (
    <div
      data-limit-order-form
      className="rounded-[16px] bg-white border border-[#e5e7eb] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)' }}
    >
      {/* Outcome tabs — the main decision */}
      <div data-limit-outcome-tabs className="grid grid-cols-2 border-b border-[#f1f3f4]">
        {outcomeLabels.map((label, idx) => {
          const isActive = selectedOutcome === idx;
          const isYes = idx === 0;
          return (
            <button
              key={label}
              onClick={() => setSelectedOutcome(idx)}
              data-active={isActive ? 'true' : 'false'}
              data-outcome-tone={isYes ? 'yes' : 'no'}
              className={`py-3 text-[13px] font-semibold transition-colors ${
                isActive
                  ? isYes
                    ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/40'
                    : 'text-rose-500 border-b-2 border-rose-500 bg-rose-50/40'
                  : 'text-[#9ca3af] hover:text-[#6b7280]'
              }`}
              style={{ fontFamily: FONT }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-3">
        {/* BUY/SELL — subtle toggle, not the main focus */}
        <div className="flex items-center gap-2">
          <div data-limit-side-toggle className="flex bg-[#f5f5f5] p-0.5 rounded-[8px]">
            {(['BUY', 'SELL'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                data-active={side === s ? 'true' : 'false'}
                data-side={s.toLowerCase()}
                className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all rounded-[6px] ${
                  side === s
                    ? s === 'BUY'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'bg-white text-rose-500 shadow-sm'
                    : 'text-[#b0b4ba]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="ml-auto"><PolymarketAvailable short /></span>
          <span data-limit-helper-text className="text-[10px] text-[#b0b4ba]" style={{ fontFamily: FONT }}>
            {isBuy ? `Buy ${activeLabel} shares` : `Sell ${activeLabel} shares`}
          </span>
        </div>

        {/* Price + Shares — side by side */}
        <div data-limit-order-fields className="grid grid-cols-2 gap-3">
          <div>
            <label data-limit-field-label className="block text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">
              Price
            </label>
            <div className="relative">
              <input
                type="number"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                min={tickCents}
                max={99}
                step={tickCents}
                placeholder="50"
                className={`w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold tabular-nums focus:outline-none transition-colors ${
                  priceInput && !priceValid
                    ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                    : 'bg-[#f8f9fa] text-[#111] focus:ring-1 focus:ring-[#e5e7eb]'
                }`}
                style={{ fontFamily: FONT }}
              />
              <span data-limit-input-suffix className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#b0b4ba]">¢</span>
            </div>
            {priceInput && !priceValid && (
              <p className="text-[9px] text-rose-500 mt-1">
                1–99¢, step {tickCents.toFixed(1)}¢
              </p>
            )}
          </div>

          <div>
            <label data-limit-field-label className="block text-[9px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">
              Shares
            </label>
            <input
              type="number"
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              min={MIN_SHARES}
              step={1}
              placeholder={String(MIN_SHARES)}
              className={`w-full rounded-[10px] px-3 py-2.5 text-[14px] font-bold tabular-nums focus:outline-none transition-colors placeholder:text-[#d1d5db] ${
                size > 0 && size < MIN_SHARES
                  ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                  : 'bg-[#f8f9fa] text-[#111] focus:ring-1 focus:ring-[#e5e7eb]'
              }`}
              style={{ fontFamily: FONT }}
            />
            {size > 0 && size < MIN_SHARES && (
              <p className="text-[9px] text-rose-500 mt-1">Min {MIN_SHARES} shares</p>
            )}
          </div>
        </div>

        {/* Cost display — only when both inputs valid */}
        {size >= MIN_SHARES && priceValid && (
          <div data-limit-order-cost className="flex items-center justify-between px-3 py-2 bg-[#f8f9fa] rounded-[10px]">
            <span data-limit-field-label className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Total Cost</span>
            <span data-limit-cost-value className="text-[16px] font-bold text-[#111] tabular-nums" style={{ fontFamily: FONT }}>
              ${cost.toFixed(2)}
            </span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!formValid}
          data-limit-submit
          className={`w-full py-3 rounded-[10px] text-[13px] font-semibold transition-all active:scale-[0.98] ${
            !formValid
              ? 'bg-[#f0f0f0] text-[#c5c7cb] cursor-not-allowed'
              : isBuy
                ? isYesOutcome
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-rose-500 text-white hover:bg-rose-600'
                : 'bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white hover:from-[#2a2a2a] hover:to-[#4a4a4a]'
          }`}
          style={{ fontFamily: FONT }}
        >
          {submitting || loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Placing order...
            </span>
          ) : (
            `${side} ${activeLabel}${size >= MIN_SHARES ? ` · ${size} @ ${priceInput}¢` : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
