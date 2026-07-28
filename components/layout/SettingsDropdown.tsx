'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";



interface SettingsDropdownProps {
  /** Optional override — if set, skips auto-detection. */
  forceDark?: boolean;
}

type ThemePref = 'light' | 'dark' | 'system';

/**
 * Walk up from `node` looking for an ancestor that carries a dark-theme
 * class (either plain `dark` or any `.dark.<scope>-theme-scope`). Also
 * checks <html>. Returns true if any ancestor is dark.
 */
function detectDarkFromDOM(node: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const html = document.documentElement;
  if (html.classList.contains('dark')) return true;
  let el: Element | null = node;
  while (el) {
    const cls = (el as HTMLElement).className;
    if (typeof cls === 'string') {
      // Matches "dark", "dark ", "... dark", ".dark.markets-theme-scope", etc.
      if (/\bdark\b/.test(cls)) return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function SettingsDropdown({ forceDark }: SettingsDropdownProps) {
  const pathname = usePathname();

  // Route-specific dark states + setters (for the Theme segmented control).
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);
  const perpsDarkMode = useUIStore((s) => s.perpsDarkMode);
  const defaiDarkMode = useUIStore((s) => s.defaiDarkMode);
  const securityDarkMode = useUIStore((s) => s.securityDarkMode);
  const dashboardDarkMode = useUIStore((s) => s.dashboardDarkMode);
  const siteDarkMode = useUIStore((s) => s.siteDarkMode);

  const setMarketsDarkMode = useUIStore((s) => s.setMarketsDarkMode);
  const setPerpsDarkMode = useUIStore((s) => s.setPerpsDarkMode);
  const setDefaiDarkMode = useUIStore((s) => s.setDefaiDarkMode);
  const setSecurityDarkMode = useUIStore((s) => s.setSecurityDarkMode);
  const setDashboardDarkMode = useUIStore((s) => s.setDashboardDarkMode);
  const siteThemePref = useUIStore((s) => s.siteThemePref);
  const setSiteThemePref = useUIStore((s) => s.setSiteThemePref);

  const [localThemePref, setLocalThemePref] = useState<ThemePref>('light');

  const systemPrefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const isRouteSpecific =
    pathname?.startsWith('/markets') ||
    pathname?.startsWith('/perps') ||
    pathname?.startsWith('/defai') ||
    pathname?.startsWith('/security') ||
    pathname?.startsWith('/dashboard');

  // Set dark mode globally across ALL sections
  const setAllDarkModes = (enabled: boolean) => {
    setMarketsDarkMode(enabled);
    setPerpsDarkMode(enabled);
    setDefaiDarkMode(enabled);
    setSecurityDarkMode(enabled);
    setDashboardDarkMode(enabled);
    setSiteThemePref(enabled ? 'dark' : 'light');
  };

  const themePref = isRouteSpecific ? localThemePref : siteThemePref;
  const setThemePref = (pref: ThemePref) => {
    const dark = pref === 'system' ? systemPrefersDark : pref === 'dark';
    setLocalThemePref(pref);
    setAllDarkModes(dark);
  };

  useEffect(() => {
    if (!isRouteSpecific) return;
    // Initial sync — infer pref from whichever route-specific flag is set.
    const dark =
      (pathname?.startsWith('/markets') && marketsDarkMode) ||
      (pathname?.startsWith('/perps') && perpsDarkMode) ||
      (pathname?.startsWith('/defai') && defaiDarkMode) ||
      (pathname?.startsWith('/security') && securityDarkMode) ||
      (pathname?.startsWith('/dashboard') && dashboardDarkMode);
    setLocalThemePref(dark ? 'dark' : 'light');
  }, [
    pathname, isRouteSpecific,
    marketsDarkMode,
    perpsDarkMode, defaiDarkMode, securityDarkMode, dashboardDarkMode,
  ]);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Dark-mode detection ─────────────────────────────────────────────
  // The modal's palette must match whichever theme scope surrounds it,
  // NOT the pathname heuristic (which breaks when a scope wrapper is
  // active on an unexpected route). We read the actual DOM class chain.
  const [domIsDark, setDomIsDark] = useState(false);
  useEffect(() => {
    const recompute = () => setDomIsDark(detectDarkFromDOM(rootRef.current));
    recompute();
    const obs = new MutationObserver(recompute);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
    return () => obs.disconnect();
  }, []);

  const isDark = forceDark ?? domIsDark ?? siteDarkMode;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Premium dark/light tokens ────────────────────────────────────────
  const surface = isDark ? '#141414' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const textPrimary = isDark ? '#ededed' : '#111111';
  const textMuted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)';
  const segmentTrackBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const segmentActiveBg = isDark ? '#ffffff' : '#111111';
  const segmentActiveFg = isDark ? '#111111' : '#ffffff';
  const segmentInactiveFg = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
  const panelShadow = isDark
    ? '0 24px 60px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.4)'
    : '0 16px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)';

  return (
    <div ref={rootRef} className="relative" translate="no">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        title="Theme"
        suppressHydrationWarning
        className={`w-10 h-10 flex-shrink-0 inline-flex items-center justify-center rounded-[10px] border transition-colors ${
          isDark
            ? 'border-white/[0.08] hover:bg-white/[0.05] text-[#ededed]'
            : 'border-[#e5e7eb] hover:bg-[#f7f7f7] text-[#1a1a1a]'
        }`}
        style={{ fontFamily: FONT }}
      >
        {themePref === 'system' ? <Monitor size={15} strokeWidth={2} /> : themePref === 'dark' ? <Moon size={15} strokeWidth={2} /> : <Sun size={15} strokeWidth={2} />}
      </button>

      <div
        className="fixed md:absolute right-4 md:right-0 top-14 md:top-full z-[9999] w-[264px]"
        style={{
          paddingTop: 8,
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(-4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: panelShadow,
            overflow: 'hidden',
            fontFamily: FONT,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px 12px',
              borderBottom: `1px solid ${dividerColor}`,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: textMuted,
              }}
            >
              Settings
            </div>
          </div>

          {/* Theme section */}
          <div style={{ padding: '10px 10px 12px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: textPrimary,
                marginBottom: 8,
                paddingLeft: 6,
              }}
            >
              Theme
            </div>
            <div
              style={{
                display: 'flex',
                gap: 2,
                padding: 3,
                borderRadius: 10,
                background: segmentTrackBg,
              }}
            >
              {(['light', 'dark', 'system'] as const).map((opt) => {
                const active = themePref === opt;
                const label = opt === 'light' ? 'Light' : opt === 'dark' ? 'Dark' : 'System';
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setThemePref(opt)}
                    className="flex-1 py-1.5 rounded-[7px] transition-all"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: active ? segmentActiveBg : 'transparent',
                      color: active ? segmentActiveFg : segmentInactiveFg,
                      boxShadow: active
                        ? isDark
                          ? '0 1px 2px rgba(0,0,0,0.4)'
                          : '0 1px 2px rgba(0,0,0,0.12)'
                        : 'none',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsDropdown;
