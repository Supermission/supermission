'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store/chat';

const SIGN_DELAY_SECONDS = 3;

interface RoroOrder {
  kind: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit';
  quantity?: number;
  amount_dollars?: number;
  limit_price?: number;
  time_in_force?: string;
  review?: string;
  reviewError?: boolean;
}

/**
 * Auto-executing equity-order card. No confirm button — a short countdown is the
 * abort window (Cancel), then it places the real order via /api/robinhood/order
 * and pushes a feedback message back into the chat. Mirrors swap-execute-inline.
 */
export function RoroOrderExecuteInline({ data, isHistory }: { data: RoroOrder; isHistory?: boolean }) {
  const addMessage = useChatStore((s) => s.addMessage);
  const [countdown, setCountdown] = useState(SIGN_DELAY_SECONDS);
  const [status, setStatus] = useState<'pending' | 'placing' | 'done' | 'error' | 'canceled'>('pending');
  const [detail, setDetail] = useState<string>('');
  const executingRef = useRef(false);
  const abortedRef = useRef(false);
  const feedbackSent = useRef(false);

  const qtyLabel = data.amount_dollars != null ? `$${data.amount_dollars}` : `${data.quantity ?? '?'} share${data.quantity === 1 ? '' : 's'}`;
  const priceLabel = data.order_type === 'limit' && data.limit_price != null ? ` @ $${data.limit_price} limit` : ' at market';
  const summary = `${data.side === 'buy' ? 'Buy' : 'Sell'} ${qtyLabel} ${data.symbol}${priceLabel}`;

  async function handleConfirm() {
    if (executingRef.current || abortedRef.current || isHistory) return;
    executingRef.current = true;
    setStatus('placing');
    try {
      const res = await fetch('/api/robinhood/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setStatus('done');
      setDetail(String(json.result || 'Order submitted.'));
      if (!feedbackSent.current) {
        feedbackSent.current = true;
        addMessage({ role: 'assistant', content: `Order placed — ${summary}.\n${String(json.result || '').slice(0, 400)}` });
        window.dispatchEvent(new Event('trade-completed'));
      }
    } catch (err: any) {
      setStatus('error');
      setDetail(err?.message || 'Order failed');
      if (!feedbackSent.current) {
        feedbackSent.current = true;
        addMessage({ role: 'assistant', content: `Order failed — ${summary}. ${err?.message || ''}`.trim() });
      }
    }
  }

  function handleCancel() {
    abortedRef.current = true;
    setStatus('canceled');
    if (!feedbackSent.current) {
      feedbackSent.current = true;
      addMessage({ role: 'assistant', content: 'Order canceled.' });
    }
  }

  useEffect(() => {
    if (isHistory || data.reviewError || status !== 'pending') return;
    if (countdown <= 0) { handleConfirm(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, isHistory, status]);

  const border = status === 'error' ? '#ef4444' : status === 'done' ? '#22c55e' : '#e5e7eb';

  return (
    <div className="mt-2 rounded-[12px] border p-3 text-sm" style={{ borderColor: border, background: '#fff' }}>
      <div className="font-semibold text-[#1a1a1a]">{summary}</div>
      {data.review ? <div className="mt-1 text-[11px] text-[#6b7280] whitespace-pre-wrap">{data.review.slice(0, 300)}</div> : null}
      {data.reviewError ? (
        <div className="mt-2 text-[13px] text-red-600">Pre-trade review failed — order not placed. {data.review}</div>
      ) : status === 'pending' && !isHistory ? (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] text-[#6b7280]">Placing in {countdown}s…</span>
          <button onClick={handleCancel} className="text-[12px] font-semibold text-[#ef4444] hover:underline">Cancel</button>
        </div>
      ) : status === 'placing' ? (
        <div className="mt-2 text-[12px] text-[#6b7280]">Placing order…</div>
      ) : status === 'done' ? (
        <div className="mt-2 text-[13px] text-green-700">Order placed. {detail.slice(0, 200)}</div>
      ) : status === 'error' ? (
        <div className="mt-2 text-[13px] text-red-600">{detail}</div>
      ) : status === 'canceled' ? (
        <div className="mt-2 text-[12px] text-[#6b7280]">Canceled.</div>
      ) : (
        <div className="mt-2 text-[12px] text-[#9ca3af]">Order (from history).</div>
      )}
    </div>
  );
}
