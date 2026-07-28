'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Menu, X, BarChart3, Briefcase, ListOrdered, Bot, ArrowLeft, PanelLeft } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { useUIStore } from '@/lib/store/ui';
import { PerpsThemeScope } from '@/components/perps/PerpsThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { usePaymentWallet } from '@/lib/hooks/use-payment-wallet';
import { useHyperliquidStore } from '@/lib/hyperliquid/store';

const PerpsPositions = dynamic(() => import('@/components/perps/PerpsPositions').then(m => ('default' in m ? m : { default: (m as Record<string, unknown>).PerpsPositions }) as { default: React.ComponentType }), { ssr: false });
const PerpsOrderHistory = dynamic(() => import('@/components/perps/PerpsOrderHistory').then(m => ('default' in m ? m : { default: (m as Record<string, unknown>).PerpsOrderHistory }) as { default: React.ComponentType }), { ssr: false });
const PerpsHyperionChat = dynamic(() => import('@/components/perps/PerpsHyperionChat').then(m => ('default' in m ? m : { default: (m as Record<string, unknown>).PerpsHyperionChat }) as { default: React.ComponentType }), { ssr: false });
const PerpsDepositBanner = dynamic(() => import('@/components/perps/PerpsDepositBanner'), { ssr: false });
const TradingBalancePill = dynamic(() => import('@/components/shared/TradingBalancePill').then(m => ({ default: m.TradingBalancePill })), { ssr: false });
const MoveFundsModal = dynamic(() => import('@/components/shared/MoveFundsModal').then(m => ({ default: m.MoveFundsModal })), { ssr: false });

type PerpsTab = 'markets' | 'positions' | 'orders' | 'hyperion';

const NAV_ITEMS: { id: PerpsTab; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'markets', label: 'Markets', Icon: BarChart3 },
  { id: 'positions', label: 'Positions', Icon: Briefcase },
  { id: 'orders', label: 'Orders', Icon: ListOrdered },
  { id: 'hyperion', label: 'HYPERION', Icon: Bot },
];

export default function PerpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isOnCoinPage = pathname !== '/perps' && pathname.startsWith('/perps/');
  const [activeTab, setActiveTab] = useState<PerpsTab>('markets');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [moveFundsState, setMoveFundsState] = useState<{ open: boolean; from?: string; to?: string }>({ open: false });
  const { setSidebarOpen } = useUIStore();
  const perpsDarkMode = useUIStore((s) => s.perpsDarkMode);
  const { paymentAddress } = usePaymentWallet();
  const fetchUserState = useHyperliquidStore((s) => s.fetchUserState);

  // Listen for move-funds events from deposit modals
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setMoveFundsState({ open: true, from: detail.from, to: detail.to });
    };
    window.addEventListener('open-move-funds', handler);
    return () => window.removeEventListener('open-move-funds', handler);
  }, []);

  // Fetch HL positions, orders, fills when wallet is connected
  useEffect(() => {
    if (!paymentAddress) return;
    fetchUserState(paymentAddress);
    const iv = setInterval(() => fetchUserState(paymentAddress), 15_000);
    return () => clearInterval(iv);
  }, [paymentAddress, fetchUserState]);

  const searchParams = useSearchParams();

  // Hydrate from URL param first (?tab=hyperion), then sessionStorage.
  // React to URL changes so clicking the Hyperion link from anywhere (incl.
  // /perps itself) switches into the agent tab.
  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam && ['markets', 'positions', 'orders', 'hyperion'].includes(tabParam)) {
      setActiveTab(tabParam as PerpsTab);
      sessionStorage.setItem('perps-tab', tabParam);
      return;
    }
    const saved = sessionStorage.getItem('perps-tab');
    if (saved && ['markets', 'positions', 'orders', 'hyperion'].includes(saved)) {
      setActiveTab(saved as PerpsTab);
    }
  }, [pathname, searchParams]);

  const router = useRouter();

  const handleTabChange = (tab: PerpsTab) => {
    setActiveTab(tab);
    sessionStorage.setItem('perps-tab', tab);
    // If on a coin page (/perps/BTC), navigate back to /perps to show the tab content
    if (isOnCoinPage) {
      router.push('/perps');
    }
  };

  return (
    <RequireAuth>
      <PerpsThemeScope>
      <div className="perps-layout-bg flex flex-col min-h-dvh transition-colors duration-200">
        {/* ── Top navbar ── */}
        <div className="perps-navbar fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b transition-colors duration-200">
          <div className="px-4 sm:px-6 md:px-8">
            <div className="flex h-14 sm:h-16 items-center">
              {/* Mobile: back button on coin pages, hamburger on grid */}
              <div className="lg:hidden flex items-center gap-1.5 flex-shrink-0 mr-3">
                {isOnCoinPage ? (
                  <Link
                    href="/perps"
                    className="perps-nav-btn flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-[8px] border transition-colors text-[11px] font-bold"
                    style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </Link>
                ) : (
                  <>
                    {activeTab === 'hyperion' && (
                      <button
                        onClick={() => setSidebarOpen(true)}
                        className="perps-nav-btn w-9 h-9 flex items-center justify-center rounded-[8px] border transition-colors"
                        aria-label="Open chat history"
                      >
                        <PanelLeft size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setMobileNavOpen(!mobileNavOpen)}
                      className="perps-nav-btn w-9 h-9 flex items-center justify-center rounded-[8px] border transition-colors"
                    >
                      {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                  </>
                )}
              </div>

              {/* Back link — "Markets" on coin pages, "Supermission" on grid */}
              <Link
                href={isOnCoinPage ? '/perps' : '/'}
                className="perps-back-link hidden lg:flex group items-center gap-2 text-[11px] sm:text-xs font-bold transition-all duration-300 flex-shrink-0"
                style={{ fontFamily: 'var(--font-bricolage), sans-serif' }}
              >
                <ArrowLeft
                  size={14}
                  className="group-hover:-translate-x-0.5 transition-transform flex-shrink-0"
                />
                <span>{isOnCoinPage ? 'Back to Markets' : 'Back to Supermission'}</span>
              </Link>

              {/* Left spacer */}
              <div className="flex-1" />

              {/* Centre nav items — desktop (hidden on coin pages) */}
              <div className={`perps-tab-bar ${isOnCoinPage ? 'hidden' : 'hidden lg:flex'} items-center rounded-[8px] overflow-hidden border`}>
                {NAV_ITEMS.map(({ id, label, Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => handleTabChange(id)}
                      className={`perps-tab-btn h-9 sm:h-10 px-3 md:px-4 border-r last:border-r-0 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition-all duration-200 cursor-pointer ${active ? 'active' : ''}`}
                      style={{
                        fontFamily: 'var(--font-bricolage), sans-serif',
                      }}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Right spacer */}
              <div className="flex-1" />

              {/* Theme toggle (left) + trading balance — far right */}
              <div className="flex items-center gap-2">
                <SiteThemeToggle />
                <TradingBalancePill
                  mode="perps"
                  themeAware
                  forceDark={perpsDarkMode}
                  onDeposit={() => {
                    if (activeTab !== 'markets') handleTabChange('markets');
                    window.dispatchEvent(new Event('open-perps-deposit'));
                  }}
                />
              </div>
            </div>
          </div>

          {/* Mobile nav dropdown */}
          {mobileNavOpen && (
            <div className="perps-mobile-dropdown lg:hidden border-t transition-colors duration-200">
              <nav className="px-4 py-3 flex flex-col gap-1">
                {NAV_ITEMS.map(({ id, label, Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        handleTabChange(id);
                        setMobileNavOpen(false);
                        window.scrollTo(0, 0);
                      }}
                      className={`perps-mobile-nav-item flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all duration-200 text-left ${active ? 'active' : ''}`}
                    >
                      <Icon size={15} />
                      <span
                        className="text-sm font-semibold flex-1"
                        style={{
                          fontFamily: 'var(--font-bricolage), sans-serif',
                        }}
                      >
                        {label}
                      </span>
                      {active && (
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      )}
                    </button>
                  );
                })}

                {/* Back to Supermission — mobile */}
                <Link
                  href="/"
                  onClick={() => setMobileNavOpen(false)}
                  className="perps-mobile-nav-item flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all duration-200 mt-1"
                >
                  <ArrowLeft size={15} />
                  <span
                    className="text-sm font-semibold"
                    style={{
                      fontFamily: 'var(--font-bricolage), sans-serif',
                    }}
                  >
                    Back to Supermission
                  </span>
                </Link>
              </nav>
            </div>
          )}
        </div>

        {/* Deposit banner — shown only on markets tab when user has no HL balance */}
        <div className="pt-14 sm:pt-16">
          {(isOnCoinPage || activeTab === 'markets') && <PerpsDepositBanner />}
        </div>

        {/* Main content — coin pages render children directly, /perps switches by tab */}
        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
          {isOnCoinPage ? (
            children
          ) : (
            <>
              {activeTab === 'markets' && children}
              {activeTab === 'positions' && (
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
                  <PerpsPositions />
                </div>
              )}
              {activeTab === 'orders' && (
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
                  <PerpsOrderHistory />
                </div>
              )}
              {activeTab === 'hyperion' && (
                <div className="flex h-[calc(100dvh-56px)] sm:h-[calc(100dvh-64px)] overflow-hidden">
                  <PerpsHyperionChat />
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <MoveFundsModal
        open={moveFundsState.open}
        onClose={() => setMoveFundsState({ open: false })}
        defaultFrom={moveFundsState.from}
        defaultTo={moveFundsState.to}
      />
      </PerpsThemeScope>
    </RequireAuth>
  );
}
