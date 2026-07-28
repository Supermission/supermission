'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { getHLBalance } from '@/lib/hyperliquid/deposit';
import { useUsdcBalances } from '@/lib/hooks/use-usdc-balances';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

interface TradingBalancePillProps {
  mode: 'perps' | 'markets';
  onDeposit?: () => void;
  /** When true, pill uses light styling by default and flips to dark
   *  only when an ancestor has the Tailwind `dark` class. Used by IPL Arena. */
  themeAware?: boolean;
  /** Explicit dark override — needed for UCL where the pill renders above
   *  the theme scope and Tailwind v4 `dark:` class variants don't cascade. */
  forceDark?: boolean;
}

export function TradingBalancePill({ mode, onDeposit, themeAware = false, forceDark = false }: TradingBalancePillProps) {
  const { paymentAddress } = usePaymentWallet();

  // Hyperliquid balance (perps)
  const [hlBalance, setHlBalance] = useState<number | null>(null);
  useEffect(() => {
    if (mode !== 'perps' || !paymentAddress) return;
    let cancelled = false;
    getHLBalance(paymentAddress).then(bal => { if (!cancelled) setHlBalance(bal); }).catch(() => { if (!cancelled) setHlBalance(0); });
    const iv = setInterval(() => {
      getHLBalance(paymentAddress).then(bal => { if (!cancelled) setHlBalance(bal); }).catch(() => {});
    }, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [mode, paymentAddress]);

  // Polymarket balance on Polygon — pUSD (V2 trading token) + USDC.e + native USDC.
  // Must match the `poly` row in MoveFundsModal (which uses polyUsdc) so the
  // top-corner pill and the modal agree.
  const { polyUsdc } = useUsdcBalances(mode === 'markets' ? paymentAddress ?? undefined : undefined);
  const marketsBalance = polyUsdc || 0;

  const balance = mode === 'perps'
    ? hlBalance
    : marketsBalance > 0 ? marketsBalance : null;

  if (!paymentAddress || balance === null) return null;

  const isLow = balance < 1;
  const icon = mode === 'perps' ? '/tokens/chain-hyperliquid.png' : '/tokens/polymarket.png';

  const shellClass = themeAware
    ? forceDark
      ? 'flex items-stretch h-10 rounded-[10px] overflow-hidden border border-[#242424] bg-gradient-to-b from-[#1a1a1a] to-[#0e0e0e] shadow-[0_1px_0_rgba(0,0,0,0.6),0_4px_16px_-4px_rgba(0,0,0,0.8)]'
      : 'flex items-stretch h-10 rounded-[10px] overflow-hidden border border-[#e5e7eb] bg-white dark:border-transparent dark:bg-gradient-to-b dark:from-[#1a1a1a] dark:to-[#3b3b3b]'
    : 'flex items-stretch h-10 rounded-[10px] bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] overflow-hidden';

  const balanceBtnClass = themeAware
    ? forceDark
      ? 'flex items-center gap-1.5 px-3 hover:bg-[#1f1f1f] transition-colors cursor-pointer'
      : 'flex items-center gap-1.5 px-3 hover:bg-black/[0.04] dark:hover:bg-white/10 transition-colors cursor-pointer'
    : 'flex items-center gap-1.5 px-3 hover:bg-white/10 transition-colors cursor-pointer';

  const balanceText = themeAware
    ? forceDark
      ? `text-[13px] font-semibold tabular-nums tracking-tight ${isLow ? 'text-amber-300' : 'text-white/95'}`
      : `text-[13px] font-medium tabular-nums ${isLow ? 'text-amber-600 dark:text-amber-300' : 'text-[#1a1a1a] dark:text-white'}`
    : `text-[13px] font-medium tabular-nums ${isLow ? 'text-amber-300' : 'text-white'}`;

  const depositBtnClass = themeAware
    ? forceDark
      ? 'px-2.5 flex items-center justify-center border-l border-[#242424] hover:bg-[#1f1f1f] transition-colors cursor-pointer text-[#e5e5e5]'
      : 'px-2.5 flex items-center justify-center border-l border-[#e5e7eb] hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/10 transition-colors cursor-pointer'
    : 'px-2.5 flex items-center justify-center border-l border-white/10 hover:bg-white/10 transition-colors cursor-pointer';

  const plusStroke = themeAware
    ? forceDark
      ? (isLow ? '#fbbf24' : 'currentColor')
      : (isLow ? '#d97706' : 'currentColor')
    : (isLow ? '#fbbf24' : 'white');

  return (
    <div>
      <div className={shellClass}>
        <button onClick={() => onDeposit?.()} className={balanceBtnClass}>
          <Image src={icon} alt="" width={14} height={14} className="rounded-full flex-shrink-0" unoptimized />
          <span className={balanceText} style={{ fontFamily: FONT }}>
            ${balance.toFixed(2)}
          </span>
        </button>
        {onDeposit && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeposit(); }}
            className={`${depositBtnClass} ${themeAware && !forceDark ? 'text-[#1a1a1a] dark:text-white' : ''}`}
            title="Deposit"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={plusStroke} strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
