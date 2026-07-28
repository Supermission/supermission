import { create } from 'zustand';

export type DashboardTab = 'overview' | 'tokens';
export type MarketTab = 'browse' | 'watchlist' | 'portfolio' | 'signals' | 'history' | 'agent';
export type Language =
  | 'en'
  | 'hi'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'ja'
  | 'zh'
  | 'ar'
  | 'ru';

export interface UIState {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  hideMobileNav: boolean;
  setHideMobileNav: (hide: boolean) => void;

  // Dashboard nav
  dashboardTab: DashboardTab;
  setDashboardTab: (tab: DashboardTab) => void;

  // Market nav
  marketTab: MarketTab;
  setMarketTab: (tab: MarketTab) => void;
  watchlistCount: number;
  setWatchlistCount: (n: number) => void;
  portfolioCount: number;
  setPortfolioCount: (n: number) => void;
  openOrderCount: number;
  setOpenOrderCount: (n: number) => void;

  // Site-wide dark mode — scoped to marketing routes
  // (/how-it-works, /blog, /faq, /terms, /privacy). Parallel to arena flags
  // so neither leaks into the other.
  siteDarkMode: boolean;
  setSiteDarkMode: (enabled: boolean) => void;
  toggleSiteDarkMode: () => void;
  siteThemePref: 'light' | 'dark' | 'system';
  setSiteThemePref: (pref: 'light' | 'dark' | 'system') => void;

  // Markets dark mode — scoped to /markets page (browse, signals, portfolio,
  // watchlist, agent tabs). Parallel to arena flags so they never bleed into
  // each other.
  marketsDarkMode: boolean;
  setMarketsDarkMode: (enabled: boolean) => void;
  toggleMarketsDarkMode: () => void;

  // DeFAI (Delphi) dark mode — scoped to /defai
  defaiDarkMode: boolean;
  setDefaiDarkMode: (enabled: boolean) => void;
  toggleDefaiDarkMode: () => void;

  // Perps (Hyperion) dark mode — scoped to /perps
  perpsDarkMode: boolean;
  setPerpsDarkMode: (enabled: boolean) => void;
  togglePerpsDarkMode: () => void;

  // Security (Securo) dark mode — scoped to /security
  securityDarkMode: boolean;
  setSecurityDarkMode: (enabled: boolean) => void;
  toggleSecurityDarkMode: () => void;

  // Dashboard dark mode — scoped to /dashboard
  dashboardDarkMode: boolean;
  setDashboardDarkMode: (enabled: boolean) => void;
  toggleDashboardDarkMode: () => void;

  // Language preference
  language: Language;
  setLanguage: (lang: Language) => void;
}

const SITE_DARK_KEY = 'sm:site-dark-mode';
const SITE_THEME_PREF_KEY = 'sm:site-theme-pref';
const MARKETS_DARK_KEY = 'sm:markets-dark-mode';
const DEFAI_DARK_KEY = 'sm:defai-dark-mode';
const PERPS_DARK_KEY = 'sm:perps-dark-mode';
const SECURITY_DARK_KEY = 'sm:security-dark-mode';
const DASHBOARD_DARK_KEY = 'sm:dashboard-dark-mode';
const LANGUAGE_KEY = 'sm:language';

export const useUIStore = create<UIState>((set) => {
  const isClient = typeof window !== "undefined";

  // Site theme must be resolved first — all route-specific initializers inherit
  // from it when their localStorage key has never been explicitly set.
  const siteThemePrefInitial: 'light' | 'dark' | 'system' = (() => {
    if (!isClient) return 'system';
    try {
      const v = window.localStorage.getItem(SITE_THEME_PREF_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
      // Back-compat: fall back to old boolean key.
      if (window.localStorage.getItem(SITE_DARK_KEY) === '1') return 'dark';
    } catch {
      // ignore
    }
    return 'system';
  })();

  const systemPrefersDark = () =>
    isClient &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const resolveSiteDark = (pref: 'light' | 'dark' | 'system') =>
    pref === 'system' ? systemPrefersDark() : pref === 'dark';

  const siteDarkInitial = resolveSiteDark(siteThemePrefInitial);

  // Helper: read a route-specific dark key, falling back to siteDarkInitial
  // when the key has never been explicitly set (null). This means system dark
  // mode and any site-level dark preference propagate to route scopes on first
  // visit instead of defaulting to light.
  const readRouteDark = (_key: string): boolean => {
    // One global theme across the whole app: route scopes ALWAYS mirror the site
    // preference. (Per-route overrides removed — a stale route key like '0' was
    // making markets/perps render light while the site was dark.)
    return isClient ? siteDarkInitial : false;
  };

  const persistSiteDark = (enabled: boolean) => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(SITE_DARK_KEY, enabled ? '1' : '0');
    } catch {
      // storage unavailable — keep state in-memory
    }
  };

  const persistSiteThemePref = (pref: 'light' | 'dark' | 'system') => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(SITE_THEME_PREF_KEY, pref);
    } catch {
      // storage unavailable
    }
  };

  const marketsDarkInitial = (() => {
    if (!isClient) return false;
    try {
      const v = window.localStorage.getItem(MARKETS_DARK_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
      return siteDarkInitial;
    } catch {
      return false;
    }
  })();

  const persistMarketsDark = (enabled: boolean) => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(MARKETS_DARK_KEY, enabled ? '1' : '0');
    } catch {
      // storage unavailable — keep state in-memory
    }
  };

  const defaiDarkInitial = readRouteDark(DEFAI_DARK_KEY);
  const persistDefaiDark = (enabled: boolean) => { if (!isClient) return; try { window.localStorage.setItem(DEFAI_DARK_KEY, enabled ? '1' : '0'); } catch {} };

  const perpsDarkInitial = readRouteDark(PERPS_DARK_KEY);
  const persistPerpsDark = (enabled: boolean) => { if (!isClient) return; try { window.localStorage.setItem(PERPS_DARK_KEY, enabled ? '1' : '0'); } catch {} };

  const securityDarkInitial = readRouteDark(SECURITY_DARK_KEY);
  const persistSecurityDark = (enabled: boolean) => { if (!isClient) return; try { window.localStorage.setItem(SECURITY_DARK_KEY, enabled ? '1' : '0'); } catch {} };

  const dashboardDarkInitial = readRouteDark(DASHBOARD_DARK_KEY);
  const persistDashboardDark = (enabled: boolean) => { if (!isClient) return; try { window.localStorage.setItem(DASHBOARD_DARK_KEY, enabled ? '1' : '0'); } catch {} };

  const languageInitial: Language = (() => {
    if (!isClient) return 'en';
    try {
      const v = window.localStorage.getItem(LANGUAGE_KEY);
      const valid: Language[] = ['en', 'hi', 'es', 'pt', 'fr', 'de', 'ja', 'zh', 'ar', 'ru'];
      if (v && (valid as string[]).includes(v)) return v as Language;
    } catch {}
    return 'en';
  })();
  const persistLanguage = (lang: Language) => { if (!isClient) return; try { window.localStorage.setItem(LANGUAGE_KEY, lang); } catch {} };

  return {
    mobileMenuOpen: false,
    setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

    sidebarOpen: false,
    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    hideMobileNav: false,
    setHideMobileNav: (hide) => set({ hideMobileNav: hide }),

    // Dashboard nav
    dashboardTab: 'overview',
    setDashboardTab: (tab) => set({ dashboardTab: tab }),

    // Market nav
    marketTab: 'browse',
    setMarketTab: (tab) => set({ marketTab: tab }),
    watchlistCount: 0,
    setWatchlistCount: (n) => set({ watchlistCount: n }),
    portfolioCount: 0,
    setPortfolioCount: (n) => set({ portfolioCount: n }),
    openOrderCount: 0,
    setOpenOrderCount: (n) => set({ openOrderCount: n }),

    // Site-wide dark mode
    siteDarkMode: siteDarkInitial,
    setSiteDarkMode: (enabled) => {
      persistSiteDark(enabled);
      set({ siteDarkMode: enabled });
    },
    toggleSiteDarkMode: () => set((s) => {
      const next = !s.siteDarkMode;
      persistSiteDark(next);
      persistSiteThemePref(next ? 'dark' : 'light');
      persistMarketsDark(next); persistPerpsDark(next); persistDefaiDark(next);
      persistSecurityDark(next); persistDashboardDark(next);
      return {
        siteDarkMode: next, siteThemePref: next ? 'dark' : 'light',
        marketsDarkMode: next, perpsDarkMode: next, defaiDarkMode: next,
        securityDarkMode: next, dashboardDarkMode: next,
      };
    }),
    siteThemePref: siteThemePrefInitial,
    setSiteThemePref: (pref) => {
      const resolved = resolveSiteDark(pref);
      persistSiteThemePref(pref);
      persistSiteDark(resolved);
      // Propagate to every route scope so the whole app follows one theme. Without
      // this, toggling the site theme left markets/perps/dashboard on their old
      // value, so navigating there flashed the wrong (light) theme first.
      persistMarketsDark(resolved); persistPerpsDark(resolved); persistDefaiDark(resolved);
      persistSecurityDark(resolved); persistDashboardDark(resolved);
      set({
        siteThemePref: pref, siteDarkMode: resolved,
        marketsDarkMode: resolved, perpsDarkMode: resolved, defaiDarkMode: resolved,
        securityDarkMode: resolved, dashboardDarkMode: resolved,
      });
    },

    // Markets dark mode
    marketsDarkMode: marketsDarkInitial,
    setMarketsDarkMode: (enabled) => { persistMarketsDark(enabled); set({ marketsDarkMode: enabled }); },
    toggleMarketsDarkMode: () => set((s) => { const next = !s.marketsDarkMode; persistMarketsDark(next); return { marketsDarkMode: next }; }),

    // DeFAI dark mode
    defaiDarkMode: defaiDarkInitial,
    setDefaiDarkMode: (enabled) => { persistDefaiDark(enabled); set({ defaiDarkMode: enabled }); },
    toggleDefaiDarkMode: () => set((s) => { const next = !s.defaiDarkMode; persistDefaiDark(next); return { defaiDarkMode: next }; }),

    // Perps dark mode
    perpsDarkMode: perpsDarkInitial,
    setPerpsDarkMode: (enabled) => { persistPerpsDark(enabled); set({ perpsDarkMode: enabled }); },
    togglePerpsDarkMode: () => set((s) => { const next = !s.perpsDarkMode; persistPerpsDark(next); return { perpsDarkMode: next }; }),

    // Security dark mode
    securityDarkMode: securityDarkInitial,
    setSecurityDarkMode: (enabled) => { persistSecurityDark(enabled); set({ securityDarkMode: enabled }); },
    toggleSecurityDarkMode: () => set((s) => { const next = !s.securityDarkMode; persistSecurityDark(next); return { securityDarkMode: next }; }),

    // Dashboard dark mode
    dashboardDarkMode: dashboardDarkInitial,
    setDashboardDarkMode: (enabled) => { persistDashboardDark(enabled); set({ dashboardDarkMode: enabled }); },
    toggleDashboardDarkMode: () => set((s) => { const next = !s.dashboardDarkMode; persistDashboardDark(next); return { dashboardDarkMode: next }; }),

    // Language
    language: languageInitial,
    setLanguage: (lang) => { persistLanguage(lang); set({ language: lang }); },
  };
})
