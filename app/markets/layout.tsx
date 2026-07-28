'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Menu, X, Compass, Eye, Wallet, Radio, Bot, ArrowLeft } from 'lucide-react';
import { useUIStore, type MarketTab } from '@/lib/store/ui';
import { RequireAuth } from '@/components/auth/require-auth';
import { WelcomeModal } from '@/components/markets/WelcomeModal';
import { MarketsThemeScope } from '@/components/markets/MarketsThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';

const TradingBalancePill = dynamic(
  () => import('@/components/shared/TradingBalancePill').then(m => ({ default: m.TradingBalancePill })),
  { ssr: false }
);
const MarketsDepositBanner = dynamic(
  () => import('@/components/markets/MarketsDepositBanner'),
  { ssr: false }
);
const MoveFundsModal = dynamic(
  () => import('@/components/shared/MoveFundsModal').then(m => ({ default: m.MoveFundsModal })),
  { ssr: false }
);

const NAV_ITEMS = [
  { id: 'browse' as const, label: 'Browse', Icon: Compass },
  { id: 'agent' as const, label: 'Agent', Icon: Bot },
  { id: 'signals' as const, label: 'Signals', Icon: Radio },
  { id: 'portfolio' as const, label: 'Portfolio', Icon: Wallet },
  { id: 'watchlist' as const, label: 'Watchlist', Icon: Eye },
];

export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  const validTabs = ['browse', 'watchlist', 'portfolio', 'signals', 'agent'];

  const activeTab = useUIStore((s) => s.marketTab);
  const setMarketTab = useUIStore((s) => s.setMarketTab);
  const watchlistCount = useUIStore((s) => s.watchlistCount);
  const portfolioCount = useUIStore((s) => s.portfolioCount);
  const openOrderCount = useUIStore((s) => s.openOrderCount);
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);

  const pathname = usePathname();
  const router = useRouter();

  const setActiveTab = (tab: MarketTab) => {
    setMarketTab(tab);
    sessionStorage.setItem('market-tab', tab);
    // The tab bar controls the /markets home (MarketTerminal). On a sub-route
    // like the /markets/[conditionId] detail page, that terminal isn't mounted,
    // so setting state alone does nothing — navigate to the home with the tab.
    if (pathname !== '/markets') {
      router.push(`/markets?tab=${tab}`);
    }
  };

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [moveFundsState, setMoveFundsState] = useState<{ open: boolean; from?: string; to?: string }>({ open: false });

  // Listen for move-funds events from deposit modals
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setMoveFundsState({ open: true, from: detail.from, to: detail.to });
    };
    window.addEventListener('open-move-funds', handler);
    return () => window.removeEventListener('open-move-funds', handler);
  }, []);

  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return false;
    const fromUrl = new URLSearchParams(window.location.search).get('welcome') === 'true';
    if (fromUrl) {
      sessionStorage.setItem('show-welcome', '1');
      return true;
    }
    // Recover flag if component re-mounts after URL was already cleaned
    return sessionStorage.getItem('show-welcome') === '1';
  });

  const searchParams = useSearchParams();

  // Hydrate tab from URL/sessionStorage. React to URL changes so clicking
  // the Oracle link (or any /markets?tab=… link) from anywhere — including
  // the /markets page itself — switches tabs even when the pathname is the
  // same. Without this, Next.js soft-nav to the same pathname leaves the
  // mounted layout's state untouched and the click appears to do nothing.
  useEffect(() => {
    const urlTab = searchParams?.get('tab');
    if (urlTab && validTabs.includes(urlTab)) {
      setActiveTab(urlTab as MarketTab);
    } else {
      const saved = sessionStorage.getItem('market-tab');
      if (saved && validTabs.includes(saved)) {
        setMarketTab(saved as MarketTab);
      } else if (saved === 'orders' || saved === 'history') {
        setMarketTab('portfolio');
      }
    }
    // Clean URL params (run once per change so the URL stays tidy).
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('tab')) { url.searchParams.delete('tab'); changed = true; }
    if (url.searchParams.has('welcome')) { url.searchParams.delete('welcome'); changed = true; }
    if (changed) window.history.replaceState({}, '', url.toString());
  }, [searchParams]);

  return (
    <RequireAuth>
      <MarketsThemeScope>
      <WelcomeModal isOpen={showWelcome} onClose={() => { sessionStorage.removeItem('show-welcome'); setShowWelcome(false); }} />
      <div className={`flex flex-col transition-colors duration-200 ${marketsDarkMode ? 'bg-[#121212]' : 'bg-white'} ${activeTab === 'agent' ? 'h-dvh overflow-hidden !pb-0' : 'min-h-dvh'} ${showWelcome ? 'blur-sm pointer-events-none select-none' : ''}`} style={showWelcome ? { transition: 'filter 0.3s ease' } : undefined}>
        {/* ── Top navbar ── */}
        <div className="fixed top-0 left-0 right-0 z-50 site-navbar transition-colors duration-200">
          <div className="px-4 sm:px-6 md:px-8">
            <div className="flex h-14 sm:h-16 items-center">
              {/* Logo + Sidebar toggle + Hamburger — mobile only */}
              <div className="lg:hidden flex items-center gap-1.5 flex-shrink-0 mr-3">
              
                {activeTab === 'agent' && (
                  <button
                    onClick={() => useUIStore.getState().setSidebarOpen(true)}
                    className="w-9 h-9 flex items-center justify-center rounded-[8px] border border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors"
                    aria-label="Chat history"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 3v18" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setMobileNavOpen(!mobileNavOpen)}
                  className="w-9 h-9 flex items-center justify-center rounded-[8px] border border-[#e5e7eb] hover:bg-[#f7f7f7] transition-colors"
                >
                  {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
                </button>
              </div>

              {/* Back to Supermission — desktop only */}
              <Link
                href="/"
                className="hidden lg:flex group items-center gap-2 text-[11px] sm:text-xs font-bold text-black transition-all duration-300 flex-shrink-0"
                style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
              >
                <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform flex-shrink-0" />
                <span>Back to Supermission</span>
              </Link>

              {/* Left spacer */}
              <div className="flex-1" />

              {/* Centre nav items */}
              <div className="hidden lg:flex items-center rounded-[8px] overflow-hidden border border-[#e5e7eb]">
                {NAV_ITEMS.map(({ id, label, Icon }) => {
                  const active = activeTab === id;
                  const count = id === 'watchlist' && watchlistCount > 0 ? watchlistCount : id === 'portfolio' && portfolioCount > 0 ? portfolioCount : undefined;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`h-9 sm:h-10 px-3 md:px-4 border-r border-[#e5e7eb] last:border-r-0 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition-all duration-200 cursor-pointer ${
                        active
                          ? 'bg-[#3a3a3a] text-white'
                          : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7]'
                      }`}
                      style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}
                    >
                      <Icon size={13} />
                      <span>{label}</span>
                      {count !== undefined && (
                        <span className={`text-[8px] font-bold tabular-nums px-1 py-px rounded-[4px] ${
                          active ? 'bg-white/20 text-white' : 'bg-[#e5e7eb] text-[#9ca3af]'
                        }`}>
                          {count}
                        </span>
                      )}
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
                  mode="markets"
                  themeAware
                  forceDark={marketsDarkMode}
                  onDeposit={() => window.dispatchEvent(new Event('open-markets-deposit'))}
                />
              </div>
            </div>
          </div>

          {/* Mobile nav dropdown */}
          {mobileNavOpen && (
            <div className={`lg:hidden border-t transition-colors duration-200 ${marketsDarkMode ? 'border-white/[0.08] bg-[#121212]' : 'border-[#e5e7eb] bg-white'}`}>
              <nav className="px-4 py-3 flex flex-col gap-1">
                {NAV_ITEMS.map(({ id, label, Icon }) => {
                  const active = activeTab === id;
                  const count = id === 'watchlist' && watchlistCount > 0 ? watchlistCount : id === 'portfolio' && portfolioCount > 0 ? portfolioCount : undefined;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveTab(id);
                        setMobileNavOpen(false);
                        window.scrollTo(0, 0);
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all duration-200 text-left ${
                        active
                          ? 'bg-[#3a3a3a] text-white'
                          : 'bg-white text-[#9ca3af] hover:bg-[#f7f7f7] hover:text-black'
                      }`}
                    >
                      <Icon size={15} />
                      <span className="text-sm font-semibold flex-1" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                        {label}
                      </span>
                      {count !== undefined && (
                        <span className={`text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded-[4px] ${
                          active ? 'bg-white/20 text-white' : 'bg-[#e5e7eb] text-[#9ca3af]'
                        }`}>
                          {count}
                        </span>
                      )}
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
                  className="flex items-center gap-3 px-4 py-3 rounded-[8px] text-[#9ca3af] hover:text-black hover:bg-[#f7f7f7] transition-all duration-200 mt-1"
                >
                  <ArrowLeft size={15} />
                  <span className="text-sm font-semibold" style={{ fontFamily: 'Bricolage Grotesque, sans-serif' }}>
                    Back to Supermission
                  </span>
                </Link>
              </nav>
            </div>
          )}
        </div>

        {/* Markets deposit modal (rendered invisibly until triggered) */}
        <MarketsDepositBanner />

        {/* Main content */}
        <main className="flex-1 pt-14 sm:pt-16 pb-0 min-h-0">
          {children}
        </main>
      </div>
      <MoveFundsModal
        open={moveFundsState.open}
        onClose={() => setMoveFundsState({ open: false })}
        defaultFrom={moveFundsState.from}
        defaultTo={moveFundsState.to}
      />
      </MarketsThemeScope>
    </RequireAuth>
  );
}
