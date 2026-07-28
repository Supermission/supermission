'use client';

import { useMemo, useState } from 'react';
import { useHLOrders, useHLTrade } from '@/lib/hyperliquid/hooks';
import { useHyperliquidStore } from '@/lib/hyperliquid/store';
import { formatPrice } from '@/lib/hyperliquid/utils';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

import { CoinIcon } from './CoinIcon';

type ViewMode = 'card' | 'list';

function CardViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ListViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PerpsOrderHistory() {
  const openOrders = useHLOrders();
  const userFills = useHyperliquidStore((s) => s.userFills);
  const { cancelOrder, isExecuting } = useHLTrade();
  const [subTab, setSubTab] = useState<'open' | 'filled'>('open');
  const [cancellingOid, setCancellingOid] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  const sortedFills = useMemo(
    () => [...userFills].sort((a, b) => b.time - a.time).slice(0, 50),
    [userFills],
  );

  const fillStats = useMemo(() => {
    let buys = 0, sells = 0, volume = 0;
    for (const f of sortedFills) {
      const isBuy = f.side === 'B' || f.side.toLowerCase() === 'buy';
      if (isBuy) buys++; else sells++;
      volume += parseFloat(f.px) * parseFloat(f.sz);
    }
    return { trades: sortedFills.length, buys, sells, volume };
  }, [sortedFills]);

  const handleCancel = async (coin: string, oid: number) => {
    setCancellingOid(oid);
    try {
      await cancelOrder(coin, oid);
    } finally {
      setCancellingOid(null);
    }
  };

  const EmptyState = ({ message, sub }: { message: string; sub: string }) => (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-300">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8M16 17H8M10 9H8" />
        </svg>
      </div>
      <span className="text-[13px] font-semibold text-gray-900 mb-1" style={{ fontFamily: FONT }}>{message}</span>
      <span className="text-[11px] text-gray-400" style={{ fontFamily: FONT }}>{sub}</span>
    </div>
  );

  const VIEW_MODES: { id: ViewMode; label: string; Icon: typeof CardViewIcon }[] = [
    { id: 'card', label: 'Cards', Icon: CardViewIcon },
    { id: 'list', label: 'List', Icon: ListViewIcon },
  ];

  // ─── Card primitives ──────────────────────────────────────────────────────

  const FillCard = ({ fill }: { fill: typeof sortedFills[number] }) => {
    const px = parseFloat(fill.px);
    const decimals = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    const isBuy = fill.side === 'B' || fill.side.toLowerCase() === 'buy';
    const sz = parseFloat(fill.sz);
    const total = px * sz;
    const pnl = parseFloat(fill.closedPnl);
    const hasPnl = pnl !== 0;
    const isPnlPositive = pnl > 0;

    return (
      <div className="group relative rounded-2xl flex flex-col overflow-hidden bg-white border border-gray-200 dark:border-white/[0.08] shadow-sm hover:shadow-md transition-shadow">
        {/* Side banner */}
        <div className={`flex items-center justify-center py-1.5 text-white ${isBuy ? 'bg-emerald-500' : 'bg-rose-400'}`}>
          <span className="text-[9px] font-mono font-bold tracking-wider uppercase">{isBuy ? 'BUY' : 'SELL'}</span>
        </div>

        {/* Header: coin badge + date + title */}
        <div className={`relative px-4 pt-4 pb-2.5 ${isBuy ? 'bg-emerald-50/40 dark:bg-emerald-500/[0.06]' : 'bg-rose-50/40 dark:bg-rose-500/[0.06]'}`}>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span
              className={`inline-flex items-baseline gap-1.5 px-2.5 py-[3px] rounded-md text-white shadow-sm ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ fontFamily: FONT }}
            >
              <span className="font-black tracking-tight text-[10px] uppercase">{fill.coin}</span>
              <span className="text-white/60 text-[10px]">@</span>
              <span className="font-mono font-black tabular-nums text-[11px]">${formatPrice(px, decimals)}</span>
            </span>
            <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{formatDate(fill.time)}</span>
          </div>
          <div className="flex items-center gap-2">
            <CoinIcon symbol={fill.coin} size={16} />
            <span className="text-[14px] font-semibold text-gray-900" style={{ fontFamily: FONT }}>{fill.coin}/USDC Perp</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="px-4 pb-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-50 dark:bg-white/[0.06] px-2.5 py-2 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Price</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>${formatPrice(px, decimals)}</span>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-white/[0.06] px-2.5 py-2 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Size</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>{sz.toFixed(4)}</span>
            </div>
            <div className={`rounded-lg px-2.5 py-2 text-center ${
              hasPnl ? (isPnlPositive ? 'bg-emerald-50 dark:bg-emerald-500/[0.12]' : 'bg-rose-50 dark:bg-rose-500/[0.12]') : 'bg-gray-50 dark:bg-white/[0.06]'
            }`}>
              <span className={`text-[8px] font-bold uppercase tracking-wider block mb-0.5 ${
                hasPnl ? (isPnlPositive ? 'text-emerald-600' : 'text-rose-500') : 'text-gray-400'
              }`}>{hasPnl ? 'P&L' : 'Total'}</span>
              <span className={`text-[14px] font-bold tabular-nums block ${
                hasPnl ? (isPnlPositive ? 'text-emerald-700' : 'text-rose-600') : 'text-gray-900'
              }`} style={{ fontFamily: FONT }}>
                {hasPnl ? `${isPnlPositive ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}` : `$${total.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const OpenOrderCard = ({ order }: { order: typeof openOrders[number] }) => {
    const px = parseFloat(order.limitPx);
    const decimals = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
    const isBuy = order.side === 'B' || order.side.toLowerCase() === 'buy';
    const sz = parseFloat(order.sz);
    const total = px * sz;
    const isCancelling = cancellingOid === order.oid;

    return (
      <div className="group relative rounded-2xl flex flex-col overflow-hidden bg-white border border-gray-200 dark:border-white/[0.08] shadow-sm hover:shadow-md transition-shadow">
        <div className={`flex items-center justify-center py-1.5 text-white ${isBuy ? 'bg-emerald-500' : 'bg-rose-400'}`}>
          <span className="text-[9px] font-mono font-bold tracking-wider uppercase">{isBuy ? 'BUY' : 'SELL'} · LIMIT</span>
        </div>

        <div className={`relative px-4 pt-4 pb-2.5 ${isBuy ? 'bg-emerald-50/40 dark:bg-emerald-500/[0.06]' : 'bg-rose-50/40 dark:bg-rose-500/[0.06]'}`}>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span
              className={`inline-flex items-baseline gap-1.5 px-2.5 py-[3px] rounded-md text-white shadow-sm ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ fontFamily: FONT }}
            >
              <span className="font-black tracking-tight text-[10px] uppercase">{order.coin}</span>
              <span className="text-white/60 text-[10px]">@</span>
              <span className="font-mono font-black tabular-nums text-[11px]">${formatPrice(px, decimals)}</span>
            </span>
            <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{formatDate(order.timestamp)}</span>
          </div>
          <div className="flex items-center gap-2">
            <CoinIcon symbol={order.coin} size={16} />
            <span className="text-[14px] font-semibold text-gray-900" style={{ fontFamily: FONT }}>{order.coin}/USDC Perp</span>
          </div>
        </div>

        <div className="px-4 pb-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-50 dark:bg-white/[0.06] px-2.5 py-2 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Price</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>${formatPrice(px, decimals)}</span>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-white/[0.06] px-2.5 py-2 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Size</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>{sz.toFixed(4)}</span>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-white/[0.06] px-2.5 py-2 text-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Total</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>${total.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={() => handleCancel(order.coin, order.oid)}
            disabled={isExecuting || isCancelling}
            className="mt-2.5 w-full h-8 rounded-lg text-[10px] font-bold border border-gray-200 dark:border-white/[0.08] text-gray-500 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
            style={{ fontFamily: FONT }}
          >
            {isCancelling ? (
              <span className="inline-flex items-center justify-center gap-1">
                <span className="w-3 h-3 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
              </span>
            ) : 'Cancel Order'}
          </button>
        </div>
      </div>
    );
  };

  // ─── Layout ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Sub-tabs + view toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 bg-black/[0.03] perps-subtab-container rounded-[10px] p-1 flex-1">
          <button
            onClick={() => setSubTab('open')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              subTab === 'open'
                ? 'bg-white shadow-sm perps-subtab-active'
                : 'perps-subtab-inactive'
            }`}
            style={{ fontFamily: FONT, color: subTab === 'open' ? '#1a1a1a' : '#6b7280' }}
          >
            Open Orders
            {openOrders.length > 0 && (
              <span className={`text-[8px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                subTab === 'open'
                  ? 'perps-tab-count-active bg-[#1a1a1a] text-white'
                  : 'perps-tab-count-inactive bg-gray-200 text-gray-400'
              }`}>{openOrders.length}</span>
            )}
          </button>
          <button
            onClick={() => setSubTab('filled')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              subTab === 'filled'
                ? 'bg-white shadow-sm perps-subtab-active'
                : 'perps-subtab-inactive'
            }`}
            style={{ fontFamily: FONT, color: subTab === 'filled' ? '#1a1a1a' : '#6b7280' }}
          >
            Trade History
            {sortedFills.length > 0 && (
              <span className={`text-[8px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                subTab === 'filled'
                  ? 'perps-tab-count-active bg-[#1a1a1a] text-white'
                  : 'perps-tab-count-inactive bg-gray-200 text-gray-400'
              }`}>{sortedFills.length}</span>
            )}
          </button>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 perps-viewtoggle-container">
          {VIEW_MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                viewMode === id
                  ? 'bg-white text-gray-900 shadow-sm perps-subtab-active'
                  : 'text-gray-400 hover:text-gray-600 perps-subtab-inactive'
              }`}
              style={{ fontFamily: FONT }}
              title={label}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>

      {/* Trade History summary strip */}
      {subTab === 'filled' && sortedFills.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Trades', value: fillStats.trades },
            { label: 'Buys', value: fillStats.buys },
            { label: 'Sells', value: fillStats.sells },
            { label: 'Volume', value: `$${fillStats.volume.toFixed(0)}` },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-2.5 text-center">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">{s.label}</span>
              <span className="text-[14px] font-bold text-gray-900 tabular-nums block" style={{ fontFamily: FONT }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Open Orders — Card view */}
      {subTab === 'open' && viewMode === 'card' && (
        openOrders.length === 0 ? (
          <EmptyState message="No Open Orders" sub="Limit orders and stop orders will appear here" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {openOrders.map((order) => <OpenOrderCard key={order.oid} order={order} />)}
          </div>
        )
      )}

      {/* Open Orders — List view */}
      {subTab === 'open' && viewMode === 'list' && (
        openOrders.length === 0 ? (
          <EmptyState message="No Open Orders" sub="Limit orders and stop orders will appear here" />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.06]">
            {openOrders.map((order) => {
              const px = parseFloat(order.limitPx);
              const decimals = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
              const isBuy = order.side === 'B' || order.side.toLowerCase() === 'buy';
              const sz = parseFloat(order.sz);
              const isCancelling = cancellingOid === order.oid;
              return (
                <div key={order.oid} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`text-[9px] font-bold uppercase tracking-wider w-14 text-center py-1 rounded-md ${
                    isBuy ? 'bg-emerald-50 dark:bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-500/[0.15] text-rose-500 dark:text-rose-300'
                  }`} style={{ fontFamily: FONT }}>{isBuy ? 'BUY' : 'SELL'}</span>
                  <CoinIcon symbol={order.coin} size={20} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-gray-900 block truncate" style={{ fontFamily: FONT }}>
                      {order.coin}/USDC @ ${formatPrice(px, decimals)}
                    </span>
                    <span className="text-[10px] text-gray-400 block truncate" style={{ fontFamily: FONT }}>
                      {sz.toFixed(4)} · {formatDate(order.timestamp)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCancel(order.coin, order.oid)}
                    disabled={isExecuting || isCancelling}
                    className="h-8 px-3 rounded-md text-[10px] font-bold border border-gray-200 dark:border-white/[0.08] text-gray-500 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                    style={{ fontFamily: FONT }}
                  >
                    {isCancelling ? '...' : 'Cancel'}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Trade History — Card view (kanban grid) */}
      {subTab === 'filled' && viewMode === 'card' && (
        sortedFills.length === 0 ? (
          <EmptyState message="No Trade History" sub="Executed trades will appear here" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sortedFills.map((fill) => (
              <FillCard key={`${fill.hash}-${fill.oid}`} fill={fill} />
            ))}
          </div>
        )
      )}

      {/* Trade History — List view */}
      {subTab === 'filled' && viewMode === 'list' && (
        sortedFills.length === 0 ? (
          <EmptyState message="No Trade History" sub="Executed trades will appear here" />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.06]">
            {sortedFills.map((fill) => {
              const px = parseFloat(fill.px);
              const decimals = px >= 1000 ? 2 : px >= 1 ? 4 : 6;
              const isBuy = fill.side === 'B' || fill.side.toLowerCase() === 'buy';
              const sz = parseFloat(fill.sz);
              const total = px * sz;
              const pnl = parseFloat(fill.closedPnl);
              const hasPnl = pnl !== 0;
              const isPnlPositive = pnl > 0;
              return (
                <div key={`${fill.hash}-${fill.oid}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <span className={`text-[9px] font-bold uppercase tracking-wider w-14 text-center py-1 rounded-md ${
                    isBuy ? 'bg-emerald-50 dark:bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-500/[0.15] text-rose-500 dark:text-rose-300'
                  }`} style={{ fontFamily: FONT }}>{isBuy ? 'BUY' : 'SELL'}</span>
                  <CoinIcon symbol={fill.coin} size={20} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-gray-900 block truncate" style={{ fontFamily: FONT }}>
                      {fill.coin}/USDC @ ${formatPrice(px, decimals)}
                    </span>
                    <span className="text-[10px] text-gray-400 block truncate" style={{ fontFamily: FONT }}>
                      {sz.toFixed(4)} · {formatDate(fill.time)}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[12px] font-bold tabular-nums text-gray-900 block" style={{ fontFamily: FONT }}>${total.toFixed(2)}</span>
                    {hasPnl ? (
                      <span className={`text-[10px] font-bold tabular-nums ${isPnlPositive ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
                        {isPnlPositive ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400" style={{ fontFamily: FONT }}>Fee ${parseFloat(fill.fee).toFixed(4)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
