'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, useRef, useMemo, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';

const font = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

// ─── Auth Context ───────────────────────────────────────────────────────────

interface AuthContextValue {
  ready: boolean;
  authenticated: boolean;
  userEmail?: string;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}

/** Public hook — returns auth state for conditional UI (nav, tags, etc.) */
export function useAuth() {
  return useContext(AuthContext);
}

function useAuthScreenDark() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const compute = () => {
      const root = document.documentElement;
      const rootDark = root.classList.contains('dark') || root.style.colorScheme === 'dark';
      const systemDark = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;

      const currentPath = pathname || window.location.pathname;
      let routeDark: boolean | null = null;
      try {
        const readRouteKey = (key: string) => {
          const raw = window.localStorage.getItem(key);
          if (raw === '1') return true;
          if (raw === '0') return false;
          return null;
        };

        if (currentPath.startsWith('/markets')) routeDark = readRouteKey('sm:markets-dark-mode');
        else if (currentPath.startsWith('/defai')) routeDark = readRouteKey('sm:defai-dark-mode');
        else if (currentPath.startsWith('/perps')) routeDark = readRouteKey('sm:perps-dark-mode');
        else if (currentPath.startsWith('/security')) routeDark = readRouteKey('sm:security-dark-mode');
        else if (currentPath.startsWith('/dashboard')) routeDark = readRouteKey('sm:dashboard-dark-mode');
      } catch {
        routeDark = null;
      }

      // Respect explicit route preference ('1' or '0') when available.
      // Fall back to document/system theme only when route has no saved preference.
      setIsDark(routeDark ?? (rootDark || systemDark));
    };

    compute();

    const mql = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
    const onMediaChange = () => compute();
    mql?.addEventListener('change', onMediaChange);

    const observer = new MutationObserver(compute);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

    window.addEventListener('storage', compute);
    return () => {
      mql?.removeEventListener('change', onMediaChange);
      observer.disconnect();
      window.removeEventListener('storage', compute);
    };
  }, [pathname]);

  return isDark;
}

// ─── AuthProvider ───────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const userEmail = user?.email?.address || user?.google?.email || user?.discord?.email || user?.github?.email || user?.linkedin?.email || undefined;
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;

  // Refresh the privy-token cookie by calling getAccessToken() + /api/auth/session.
  // Keeps the httpOnly JWT cookie (which middleware checks for API auth) in sync
  // with Privy's session.
  const refreshSession = useRef(async () => {
    const token = await getAccessTokenRef.current();
    if (!token) return null;

    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token }),
    });
    return res.json();
  });

  useEffect(() => {
    if (!authenticated || !userEmail) return;

    // Sync the token cookie now, then every 10 min (Privy JWTs expire ~1hr).
    refreshSession.current().catch(() => {});
    const interval = setInterval(() => {
      refreshSession.current().catch(() => {});
    }, 10 * 60 * 1000);

    return () => { clearInterval(interval); };
  }, [authenticated, userEmail]);

  // BFCache restore leaves Privy's internal state desynced — force a fresh boot
  // so `ready` doesn't stay stuck at false on back-nav from external subdomains.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    authenticated,
    userEmail,
    login,
    logout,
  }), [ready, authenticated, userEmail, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── RequireAuth ────────────────────────────────────────────────────────────

export function RequireAuth({ children }: { children: React.ReactNode }) {
  // Access is open to any signed-in user — the only gate is Privy sign-in.
  const { ready, authenticated, login } = useAuthContext();
  const isDark = useAuthScreenDark();

  if (!ready) {
    // Auth check is brief. Render a clean theme-colored screen (no skeleton) so
    // we don't flash a generic box+line skeleton BEFORE the page's own skeleton
    // (e.g. the markets card-grid loader) — that double-skeleton looked broken.
    return <div className={`h-screen ${isDark ? 'bg-[#121212]' : 'bg-white'}`} />;
  }

  if (!authenticated) {
    return (
      <div className={`h-screen flex items-center justify-center ${isDark ? 'bg-[#121212]' : 'bg-white'}`}>
        <div className="text-center">
          <p className={`text-[16px] mb-4 tracking-[-0.32px] ${isDark ? 'text-white/78' : 'text-[#48484b]'}`} style={{ fontFamily: font }}>
            Sign in to continue
          </p>
          <button
            onClick={() => login()}
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-b from-[#1a1a1a] to-[#3b3b3b] text-white font-medium text-[15px] rounded-[8px] hover:opacity-90 transition-opacity"
            style={{ fontFamily: font }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
