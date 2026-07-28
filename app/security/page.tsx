'use client';

import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/header';
import { MultiWalletProvider } from '@/lib/contexts/MultiWalletContext';
import { RequireAuth } from '@/components/auth/require-auth';
import { SecurityThemeScope } from '@/components/security/SecurityThemeScope';
import { SiteThemeToggle } from '@/components/layout/SiteThemeToggle';
import { useUIStore } from '@/lib/store/ui';

const SecuroChat = dynamic(
  () => import('@/components/security/SecuroChat'),
  { ssr: false }
);

export default function SecurityPage() {
  const securityDarkMode = useUIStore((s) => s.securityDarkMode);
  return (
    <RequireAuth>
      <MultiWalletProvider>
        <SecurityThemeScope>
          <div className={`h-dvh flex flex-col overflow-hidden !pb-0 transition-colors duration-200 ${securityDarkMode ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
            <Header variant="dashboard" rightExtra={<SiteThemeToggle />} />
            <main className="flex-1 pt-16 sm:pt-[72px] overflow-hidden min-h-0">
              <SecuroChat />
            </main>
          </div>
        </SecurityThemeScope>
      </MultiWalletProvider>
    </RequireAuth>
  );
}
