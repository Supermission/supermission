'use client';

import { useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { useUIStore, type DashboardTab } from '@/lib/store/ui';
import { MultiWalletProvider } from '@/lib/contexts/MultiWalletContext';
import { RequireAuth } from '@/components/auth/require-auth';
import { DashboardThemeScope } from '@/components/dashboard/DashboardThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const setDashboardTab = useUIStore((s) => s.setDashboardTab);
  const dashboardDarkMode = useUIStore((s) => s.dashboardDarkMode);

  const VALID_TABS: readonly DashboardTab[] = ['overview'];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (urlTab && VALID_TABS.includes(urlTab as DashboardTab)) {
      setDashboardTab(urlTab as DashboardTab);
      return;
    }
    const saved = localStorage.getItem('dashboard_tab');
    if (saved === 'defi' || saved === 'agent') {
      localStorage.setItem('dashboard_tab', 'overview');
    } else if (saved && VALID_TABS.includes(saved as DashboardTab)) {
      setDashboardTab(saved as DashboardTab);
    }
  }, []);

  return (
    <RequireAuth>
      <MultiWalletProvider>
        <DashboardThemeScope>
          <div className={`flex flex-col min-h-screen transition-colors duration-200 ${dashboardDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
            <Header rightExtra={<SiteThemeToggle />} hideSettings />
            <main className="flex-1 pt-16 sm:pt-[72px] pb-0">
              {children}
            </main>
          </div>
        </DashboardThemeScope>
      </MultiWalletProvider>
    </RequireAuth>
  );
}
