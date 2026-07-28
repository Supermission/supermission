'use client';

/**
 * MarketsThemeToggle
 *
 * Small icon-only toggle that lives in the main markets nav bar. Switches the
 * scoped dark-mode flag for the /markets page. No visual footprint outside
 * the main markets shell (not rendered in league arenas).
 *
 * Renders nothing on the server to avoid hydration mismatches.
 */

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUIStore } from '@/lib/store/ui';

const FONT = "var(--font-bricolage), 'Bricolage Grotesque', sans-serif";

export function MarketsThemeToggle() {
  const marketsDarkMode = useUIStore((s) => s.marketsDarkMode);
  const toggle = useUIStore((s) => s.toggleMarketsDarkMode);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const size = 'w-9 h-9';

  if (!mounted) {
    return <span className={`${size} inline-block flex-shrink-0`} aria-hidden />;
  }

  const label = marketsDarkMode ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`${size} flex-shrink-0 inline-flex items-center justify-center rounded-[8px] border transition-colors ${
        marketsDarkMode
          ? 'border-white/[0.08] hover:bg-white/[0.05] text-[#ededed]'
          : 'border-[#e5e7eb] hover:bg-[#f7f7f7] text-[#1a1a1a]'
      }`}
      style={{ fontFamily: FONT }}
    >
      {marketsDarkMode ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
    </button>
  );
}
