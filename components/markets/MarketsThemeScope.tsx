'use client';

/**
 * MarketsThemeScope
 *
 * Mounts the Tailwind `dark` class on a wrapper when the scoped markets
 * dark-mode flag is on. All `.dark.markets-theme-scope` CSS overrides in
 * globals.css activate only under this wrapper — nothing outside /markets
 * (non-league routes) ships these rules, so the feature is invisible to the
 * arena pages and the rest of the app.
 *
 * Removability: delete this component, its usage in layout.tsx, and the
 * marketsDarkMode state from useUIStore. No other file needs to change.
 */

import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui';

interface Props {
  children: React.ReactNode;
}

export function MarketsThemeScope({ children }: Props) {
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);

  useEffect(() => {
    const root = document.documentElement;
    if (marketsDarkMode) {
      root.style.colorScheme = 'dark';
    } else {
      root.style.removeProperty('color-scheme');
    }
    return () => {
      root.style.removeProperty('color-scheme');
    };
  }, [marketsDarkMode]);

  return (
    <div
      className={marketsDarkMode ? 'dark markets-theme-scope' : 'markets-theme-scope'}
      data-markets-dark={marketsDarkMode ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
