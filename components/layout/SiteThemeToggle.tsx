'use client';

import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

type Pref = 'light' | 'dark' | 'system';

const OPTIONS: { value: Pref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function SiteThemeToggle() {
  const siteDarkMode = useUIStore((s) => s.siteDarkMode);
  const siteThemePref = useUIStore((s) => s.siteThemePref);
  const setSiteThemePref = useUIStore((s) => s.setSiteThemePref);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const size = 'w-10 h-10';
  const ActiveIcon =
    siteThemePref === 'system' ? Monitor : siteThemePref === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        title="Theme"
        suppressHydrationWarning
        className={`${size} flex-shrink-0 inline-flex items-center justify-center rounded-[10px] border transition-colors ${
          siteDarkMode
            ? 'border-white/[0.08] hover:bg-white/[0.05] text-[#ededed]'
            : 'border-[#e5e7eb] hover:bg-[#f7f7f7] text-[#1a1a1a]'
        }`}
        style={{ fontFamily: FONT }}
      >
        <ActiveIcon size={14} strokeWidth={2} />
      </button>

      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          paddingTop: 6,
          transform: open ? 'scale(1)' : 'translateY(-4px) scale(0.97)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 100,
          width: 160,
        }}
      >
        <div
          style={{
            background: siteDarkMode ? '#141414' : '#ffffff',
            border: siteDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e8e4df',
            borderRadius: 12,
            padding: 4,
            boxShadow: siteDarkMode
              ? '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)'
              : '0 12px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = siteThemePref === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSiteThemePref(value);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] transition-colors"
                style={{
                  fontFamily: FONT,
                  background: active
                    ? siteDarkMode
                      ? 'rgba(255,255,255,0.06)'
                      : '#f5f3f0'
                    : 'transparent',
                  color: siteDarkMode ? '#ededed' : '#1a1a1a',
                }}
              >
                <Icon size={13} strokeWidth={2} />
                <span className="text-[13px] font-semibold flex-1 text-left">{label}</span>
                {active && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: siteDarkMode ? '#ededed' : '#1a1a1a',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SiteThemeToggle;
