'use client';

import { useState, useEffect } from 'react';
import { X, FlaskConical } from 'lucide-react';

const DEFAULT_STORAGE_KEY = 'sm_beta_disclaimer_dismissed';

export function BetaDisclaimer({ storageKey }: { storageKey?: string } = {}) {
  const key = storageKey || DEFAULT_STORAGE_KEY;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(key)) {
      setVisible(true);
    }
  }, [key]);

  const dismiss = () => {
    localStorage.setItem(key, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="mx-3 sm:mx-4 md:mx-6 mt-1 mb-2 flex items-start gap-3 px-4 py-3 border border-amber-200/80 bg-amber-50/60 rounded-[8px] animate-in fade-in slide-in-from-top-2 duration-300">
      <FlaskConical size={15} className="text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
      <p
        className="flex-1 text-[11px] leading-relaxed text-amber-800/90 font-medium"
        style={{ fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif" }}
      >
        Supermission is currently in <span className="font-bold">beta</span> and may occasionally make mistakes. Use at your own risk.
      </p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-0.5 rounded-[4px] text-amber-500 hover:text-amber-700 hover:bg-amber-100 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
