'use client';

import { Header } from '@/components/layout/header';
import { MultiWalletProvider } from '@/lib/contexts/MultiWalletContext';
import { RequireAuth } from '@/components/auth/require-auth';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';

export default function RoroLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <MultiWalletProvider>
        <div className="roro-theme-scope h-screen flex flex-col overflow-hidden bg-white">
          <Header variant="dashboard" rightExtra={<SiteThemeToggle />} />
          <main className="flex-1 pt-16 sm:pt-[72px] pb-0 overflow-hidden min-h-0">
            {children}
          </main>
        </div>
      </MultiWalletProvider>
    </RequireAuth>
  );
}
