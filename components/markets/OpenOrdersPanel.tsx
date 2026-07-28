'use client';

import { useLimitOrders, OpenOrder } from '@/lib/hooks/use-limit-orders';

interface OpenOrdersPanelProps {
  conditionId?: string;
}

export default function OpenOrdersPanel({ conditionId }: OpenOrdersPanelProps) {
  const { openOrders, cancelOrder, cancelAllOrders, loading, refreshOrders } = useLimitOrders();

  const filteredOrders = conditionId
    ? openOrders.filter((o) => o.market === conditionId || o.asset_id === conditionId)
    : openOrders;

  const filledPct = (order: OpenOrder): string => {
    const orig = parseFloat(order.original_size) || 0;
    const matched = parseFloat(order.size_matched) || 0;
    if (orig <= 0) return '0%';
    return `${((matched / orig) * 100).toFixed(0)}%`;
  };

  if (filteredOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-[#9ca3af]">
        <svg className="mb-1.5 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7.5 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15A2.25 2.25 0 002.25 6.75v10.5A2.25 2.25 0 004.5 19.5z" />
        </svg>
        <p className="text-[11px] font-mono">No open orders</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold text-[#6b7280]">
            Open orders
          </span>
          <span className="text-[9px] font-mono font-bold bg-[#e5e7eb] text-[#6b7280] px-1.5 py-[1px] rounded-[4px]">
            {filteredOrders.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={refreshOrders}
            disabled={loading}
            className="text-[9px] font-mono font-semibold text-[#9ca3af] hover:text-[#6b7280] transition-colors disabled:opacity-40"
          >
            {loading ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin text-black/30">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-black/30 hover:text-black transition-colors">
                <path d="M21 2V8H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 12C3 7.03 7.03 3 12 3c3.36 0 6.26 1.95 7.62 4.77" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M3 22V16H9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12c0 4.97-4.03 9-9 9-3.36 0-6.26-1.95-7.62-4.77" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button
            onClick={cancelAllOrders}
            disabled={loading}
            className="text-rose-400 hover:text-rose-600 transition-colors disabled:opacity-40"
            title="Cancel all orders"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Orders */}
      <div className="space-y-1">
        {filteredOrders.map((order) => (
          <div
            key={order.id}
            className="flex items-center justify-between border border-[#e5e7eb] rounded-[8px] px-3 py-2 hover:bg-[#f7f7f7] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-mono font-bold ${
                order.side === 'BUY' ? 'text-emerald-600' : 'text-rose-500'
              }`}>
                {order.side}
              </span>
              <span className="text-[11px] font-mono font-bold text-black tabular-nums">
                {(parseFloat(order.price) * 100).toFixed(1)}¢
              </span>
              <span className="text-[11px] font-mono text-[#6b7280] tabular-nums">
                {parseFloat(order.original_size).toFixed(1)} shares
              </span>
              <span className="text-[9px] font-mono text-[#9ca3af]">
                {filledPct(order)} filled
              </span>
            </div>
            <button
              onClick={() => cancelOrder(order.id)}
              disabled={loading}
              className="text-[9px] font-mono font-bold text-[#9ca3af] hover:text-rose-500 transition-colors disabled:opacity-40"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
