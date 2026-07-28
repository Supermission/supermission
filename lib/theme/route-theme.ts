import type { UIState } from '@/lib/store/ui';

type ThemeState = Pick<
  UIState,
  | 'marketsDarkMode'
  | 'defaiDarkMode'
  | 'perpsDarkMode'
  | 'securityDarkMode'
  | 'dashboardDarkMode'
>;

const THEME_KEYS = {
  marketsDarkMode: 'sm:markets-dark-mode',
  defaiDarkMode: 'sm:defai-dark-mode',
  perpsDarkMode: 'sm:perps-dark-mode',
  securityDarkMode: 'sm:security-dark-mode',
  dashboardDarkMode: 'sm:dashboard-dark-mode',
} satisfies Record<keyof ThemeState, string>;

function readPersistedDarkMode(theme: keyof ThemeState, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;

  try {
    const value = window.localStorage.getItem(THEME_KEYS[theme]);
    if (value === '1') return true;
    if (value === '0') return false;
  } catch {
    // Ignore storage errors and keep the live store value.
  }

  return fallback;
}

function detectGlobalDarkFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('dark') || root.style.colorScheme === 'dark') return true;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export function resolveRouteDarkMode(pathname: string | null, state: ThemeState) {
  const path =
    pathname ||
    (typeof window !== 'undefined' ? window.location.pathname : null);

  if (!path) {
    return detectGlobalDarkFallback();
  }

  if (path.startsWith('/markets')) {
    return readPersistedDarkMode('marketsDarkMode', state.marketsDarkMode);
  }
  if (path.startsWith('/defai')) {
    return readPersistedDarkMode('defaiDarkMode', state.defaiDarkMode);
  }
  if (path.startsWith('/perps')) {
    return readPersistedDarkMode('perpsDarkMode', state.perpsDarkMode);
  }
  if (path.startsWith('/security')) {
    return readPersistedDarkMode('securityDarkMode', state.securityDarkMode);
  }
  if (path.startsWith('/dashboard')) {
    return readPersistedDarkMode('dashboardDarkMode', state.dashboardDarkMode);
  }

  return detectGlobalDarkFallback();
}
