'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui';

export function PerpsThemeScope({ children }: { children: React.ReactNode }) {
  const dark = useUIStore((s) => s.perpsDarkMode);
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.style.colorScheme = 'dark';
    else root.style.removeProperty('color-scheme');
    return () => { root.style.removeProperty('color-scheme'); };
  }, [dark]);
  const vars = dark ? {
    '--perps-marker-bg': 'rgba(255,255,255,0.08)',
    '--perps-marker-text': '#808080',
    '--perps-marker-hover': 'rgba(255,255,255,0.12)',
    '--perps-marker-hover-text': '#aaa',
    '--perps-bar-empty': '#404040',
  } : {};
  return (
    <div className={dark ? 'dark perps-theme-scope' : 'perps-theme-scope'} style={vars as React.CSSProperties}>
      {children}
    </div>
  );
}
