'use client';

import { Header } from '@/components/layout/header';
import { MultiWalletProvider } from '@/lib/contexts/MultiWalletContext';
import { RequireAuth } from '@/components/auth/require-auth';
import { DefaiThemeScope } from '@/components/defai/DefaiThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { useUIStore } from '@/lib/store/ui';

export default function DefaiLayout({ children }: { children: React.ReactNode }) {
  const defaiDarkMode = useUIStore((s) => s.defaiDarkMode);
  return (
    <RequireAuth>
      <MultiWalletProvider>
        <DefaiThemeScope>
          <div className={`h-screen flex flex-col overflow-hidden !pb-0 transition-colors duration-200 ${defaiDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
            <Header variant="dashboard" rightExtra={<SiteThemeToggle />} />
            <main className="flex-1 pt-16 sm:pt-[72px] pb-0 overflow-hidden min-h-0">
              {children}
            </main>
          </div>
        </DefaiThemeScope>
      </MultiWalletProvider>
    </RequireAuth>
  );
}
