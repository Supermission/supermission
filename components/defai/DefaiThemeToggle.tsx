'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

export function DefaiThemeToggle() {
  const dark = useUIStore((s) => s.defaiDarkMode);
  const toggle = useUIStore((s) => s.toggleDefaiDarkMode);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="w-9 h-9 inline-block flex-shrink-0" aria-hidden />;
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`w-9 h-9 flex-shrink-0 inline-flex items-center justify-center rounded-[8px] border transition-colors ${
        dark ? 'border-white/[0.08] hover:bg-white/[0.05] text-[#ededed]' : 'border-[#e5e7eb] hover:bg-[#f7f7f7] text-[#1a1a1a]'
      }`}
      style={{ fontFamily: FONT }}
    >
      {dark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
    </button>
  );
}
