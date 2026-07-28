'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui';

export function DashboardThemeScope({ children }: { children: React.ReactNode }) {
  const dark = useUIStore((s) => s.dashboardDarkMode);
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.style.colorScheme = 'dark';
    else root.style.removeProperty('color-scheme');
    return () => { root.style.removeProperty('color-scheme'); };
  }, [dark]);
  return (
    <div className={dark ? 'dark dashboard-theme-scope' : 'dashboard-theme-scope'}>
      {children}
    </div>
  );
}
