'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useHyperliquidStore } from '@/lib/hyperliquid/store';
import { useUIStore } from '@/lib/store/ui';
import { PerpsThemeScope } from '@/components/perps/PerpsThemeScope';
import { SettingsDropdown } from '@/components/layout/SettingsDropdown';

const TradingBalancePill = dynamic(() => import('@/components/shared/TradingBalancePill').then(m => ({ default: m.TradingBalancePill })), { ssr: false });
const PerpsDepositBanner = dynamic(() => import('@/components/perps/PerpsDepositBanner'), { ssr: false });

export default function SpotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { paymentAddress } = usePaymentWallet();
  const fetchUserState = useHyperliquidStore((s) => s.fetchUserState);
  const perpsDarkMode = useUIStore((s) => s.perpsDarkMode);

  useEffect(() => {
    if (!paymentAddress) return;
    fetchUserState(paymentAddress);
    const iv = setInterval(() => fetchUserState(paymentAddress), 15_000);
    return () => clearInterval(iv);
  }, [paymentAddress, fetchUserState]);

  return (
    <RequireAuth>
      <PerpsThemeScope>
      <div className={`flex flex-col min-h-dvh transition-colors duration-200 ${perpsDarkMode ? 'bg-[#121212]' : 'bg-white'}`}>
        {/* ── Top navbar ── */}
        <div className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b transition-colors duration-200 ${perpsDarkMode ? 'bg-[#121212]/85 border-white/[0.08] shadow-[0_1px_0_rgba(255,255,255,0.03),0_4px_20px_rgba(0,0,0,0.6)]' : 'bg-white/95 border-[#e5e7eb]'}`}>
          <div className="px-4 sm:px-6 md:px-8">
            <div className="flex h-14 sm:h-16 items-center">
              {/* Mobile: back button */}
              <div className="lg:hidden flex items-center gap-1.5 flex-shrink-0 mr-3">
                <Link
                  href="/perps"
                  className={`flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-[8px] border transition-colors text-[11px] font-bold ${perpsDarkMode ? 'border-white/[0.08] hover:bg-white/[0.04] text-white' : 'border-[#e5e7eb] hover:bg-[#f7f7f7] text-[#1a1a1a]'}`}
                  style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
                >
                  <ArrowLeft size={14} />
                  <span>Markets</span>
                </Link>
              </div>

              {/* Desktop: back link */}
              <Link
                href="/perps"
                className={`hidden lg:flex group items-center gap-2 text-[11px] sm:text-xs font-bold transition-all duration-300 flex-shrink-0 ${perpsDarkMode ? 'text-white' : 'text-black'}`}
                style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
              >
                <ArrowLeft
                  size={14}
                  className="group-hover:-translate-x-0.5 transition-transform flex-shrink-0"
                />
                <span>Back to Markets</span>
              </Link>

              <div className="flex-1" />

              {/* Trading balance — far right */}
              <div className="flex items-center gap-2">
                <TradingBalancePill
                  mode="perps"
                  themeAware
                  forceDark={perpsDarkMode}
                  onDeposit={() => {
                    window.dispatchEvent(new Event('open-perps-deposit'));
                  }}
                />
                <SettingsDropdown forceDark={perpsDarkMode} />
              </div>
            </div>
          </div>
        </div>

        {/* Deposit modal (listens for open-perps-deposit event) */}
        <PerpsDepositBanner />

        {/* Main content */}
        <main className="flex-1 pt-14 sm:pt-16 pb-0 min-h-0">
          {children}
        </main>
      </div>
      </PerpsThemeScope>
    </RequireAuth>
  );
}
