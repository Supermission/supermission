'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';

const FONT = "var(--font-bricolage, 'Bricolage Grotesque', sans-serif)";
const DISMISS_MS = 5000;

export interface WatchlistAlert {
  id: string;
  conditionId: string;
  question: string;
  direction: 'up' | 'down';
  changeStr: string;
  currentPrice: number;
}

// Play different alert sounds for up vs down
function playAlertSound(direction: 'up' | 'down') {
  try {
    const src = direction === 'up' ? '/sounds/alert-up.mp3' : '/sounds/alert-down.mp3';
    const audio = new Audio(src);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {}
}

function AlertCard({
  alert,
  index,
  onDismiss,
  onClick,
}: {
  alert: WatchlistAlert;
  index: number;
  onDismiss: (id: string) => void;
  onClick: (alert: WatchlistAlert) => void;
}) {
  const isUp = alert.direction === 'up';
  const x = useMotionValue(0);
  const dragOpacity = useTransform(x, [0, 80], [1, 0]);
  const progressRef = useRef<HTMLDivElement>(null);

  // Animate the progress bar
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '100%';
    // Force reflow
    void el.offsetWidth;
    el.style.transition = `width ${DISMISS_MS}ms linear`;
    el.style.width = '0%';
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 40 || info.velocity.x > 200) {
      onDismiss(alert.id);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      style={{ x, opacity: dragOpacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.4}
      onDragEnd={handleDragEnd}
      onClick={() => onClick(alert)}
      className="cursor-pointer touch-none"
    >
      <div
        className="bg-white rounded-[16px] overflow-hidden border border-[#e5e7eb]"
        style={{
          boxShadow: '0 16px 48px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        {/* Content */}
        <div className="px-4 py-3.5 flex items-center gap-3">
          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#111] truncate" style={{ fontFamily: FONT }}>
              {alert.question}
            </p>
          </div>

          {/* Price change */}
          <span className={`text-[13px] font-bold tabular-nums flex-shrink-0 ${isUp ? 'text-emerald-600' : 'text-rose-500'}`} style={{ fontFamily: FONT }}>
            {alert.changeStr}
          </span>
        </div>

        {/* Progress bar — auto-dismiss countdown */}
        <div className="h-[2px] bg-[#f1f3f4]">
          <div
            ref={progressRef}
            className={`h-full ${isUp ? 'bg-emerald-500' : 'bg-rose-500'}`}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

export function WatchlistAlertOverlay({ onMarketClick }: { onMarketClick?: (conditionId: string) => void }) {
  const [alerts, setAlerts] = useState<WatchlistAlert[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WatchlistAlert>).detail;
      // Only 1 alert at a time — replace any existing
      setAlerts([detail]);
      playAlertSound(detail.direction);

      setTimeout(() => {
        setAlerts(prev => prev.filter(a => a.id !== detail.id));
      }, DISMISS_MS);
    };

    window.addEventListener('watchlist-alert', handler);
    return () => window.removeEventListener('watchlist-alert', handler);
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleClick = useCallback((alert: WatchlistAlert) => {
    onMarketClick?.(alert.conditionId);
    dismiss(alert.id);
  }, [onMarketClick, dismiss]);

  return (
    <div className="fixed top-20 right-4 z-50 w-[380px] max-w-[calc(100vw-32px)]">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert, i) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            index={i}
            onDismiss={dismiss}
            onClick={handleClick}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
