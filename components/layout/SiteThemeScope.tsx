'use client';

/**
 * SiteThemeScope
 *
 * Wraps marketing pages (/how-it-works, /blog, /faq, /terms, /privacy) in a
 * div that carries `dark site-theme-scope` when siteDarkMode is on, or
 * `site-theme-scope` alone when off. Every `.dark.site-theme-scope` rule in
 * globals.css activates only inside this wrapper, so anything else on the
 * site is unaffected. Default is light.
 *
 * Removability: delete this component + its usages + the
 * `.dark.site-theme-scope` block in globals.css + the siteDarkMode state
 * in useUIStore. No other file needs to change.
 */

import { useEffect } from 'react';
import { useUIStore } from '@/lib/store/ui';

interface Props {
  children: React.ReactNode;
}

export function SiteThemeScope({ children }: Props) {
  const siteDarkMode = useUIStore((s) => s.siteDarkMode);
  const siteThemePref = useUIStore((s) => s.siteThemePref);
  const setSiteDarkMode = useUIStore((s) => s.setSiteDarkMode);

  useEffect(() => {
    if (siteThemePref !== 'system' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setSiteDarkMode(mql.matches);
    const handler = (e: MediaQueryListEvent) => setSiteDarkMode(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [siteThemePref, setSiteDarkMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('site-theme-scope');
    if (siteDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.removeProperty('color-scheme');
    }
    return () => {
      root.classList.remove('site-theme-scope', 'dark');
      root.style.removeProperty('color-scheme');
    };
  }, [siteDarkMode]);

  return (
    <div
      className={siteDarkMode ? 'dark site-theme-scope' : 'site-theme-scope'}
      data-site-dark={siteDarkMode ? 'true' : 'false'}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}

export default SiteThemeScope;
