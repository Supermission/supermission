'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui';

export function SecurityThemeScope({ children }: { children: React.ReactNode }) {
  const dark = useUIStore((s) => s.securityDarkMode);
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.style.colorScheme = 'dark';
    else root.style.removeProperty('color-scheme');
    return () => { root.style.removeProperty('color-scheme'); };
  }, [dark]);
  return (
    <div className={dark ? 'dark security-theme-scope' : 'security-theme-scope'}>
      {children}
    </div>
  );
}
